import { OpenAI } from "openai";
import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { IAIProvider } from "./interface";
import { ModelResults } from "../models/model-results";

export interface ResponseInputItem {
    content: string;
    role: string;
}

// Define Zod schema for Structured Outputs
// Use Array of Key-Value pairs for metadata to support dynamic keys in strict schema
const MetadataItemSchema = z.object({
    key: z.string(),
    value: z.string(), // Ensure all values are strings for simplicity, or union if needed
});

const TreeTaskSchema = z.object({
    wbsId: z.string(),
    name: z.string(),
    metadata: z.array(MetadataItemSchema).default([]),
});

const ResponseSchema = z.object({
    tasks: z.array(TreeTaskSchema),
});

export class OpenAIService implements IAIProvider {
    private readonly client: OpenAI;
    private readonly model: string;

    constructor(env: Env) {
        this.client = new OpenAI({
            apiKey: env.AI_OPENAI_KEY,
            baseURL: `${env.AI_GATEWAY_URL}/openai`,
        });
        this.model = env.AI_OPENAI_MODEL;
    }

    async generateContent(messages: string[], systemMessage?: string): Promise<ModelResults> {
        const allMessages: ResponseInputItem[] = [...messages.map(x => ({ role: 'user', content: x }))];
        if (systemMessage) {
            allMessages.unshift({ role: "developer", content: systemMessage });
        }

        try {
            const response = await this.client.responses.parse({
                model: this.model,
                input: allMessages as any,
                text: {
                    format: zodTextFormat(ResponseSchema, "tasks_result"),
                }
            });

            const parsed = response.output_parsed;

            if (!parsed) {
                console.error("No parsed content in OpenAI response");
                throw new NonRetryableError("OpenAI returned no parsed content");
            }

            // Transform metadata array back to Record object
            const transformedTasks = parsed.tasks.map(task => {
                const metadataRecord: Record<string, string | number> = {};
                task.metadata.forEach(item => {
                    // Try to parse number if it looks like one
                    const num = Number(item.value);
                    metadataRecord[item.key] = !isNaN(num) ? num : item.value;
                });
                return {
                    wbsId: task.wbsId,
                    name: task.name,
                    metadata: metadataRecord
                };
            });

            return {
                model: this.model,
                tasks: transformedTasks
            };

        } catch (e: any) {
            if (e instanceof NonRetryableError) throw e;
            // Verify correct error catching from SDK
            console.error("OpenAI Responses API Error", e);
            throw new NonRetryableError("Failed to generate structured output with OpenAI Responses API");
        }
    }
}
