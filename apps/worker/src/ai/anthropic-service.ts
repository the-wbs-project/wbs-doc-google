import { Anthropic } from "@anthropic-ai/sdk";
import { ModelResults } from "@wbs/domains";
import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import { IAIProvider } from "./interface";

const MetadataItemSchema = z.object({
    key: z.string(),
    value: z.string(),
});

const TreeTaskSchema = z.object({
    wbsId: z.string(),
    name: z.string(),
    metadata: z.array(MetadataItemSchema).default([]),
});

const ResponseSchema = z.object({
    tasks: z.array(TreeTaskSchema),
});

// JSON Schema definition matching the Zod schema
const JsonSchema = {
    type: "object",
    properties: {
        tasks: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    wbsId: { type: "string" },
                    name: { type: "string" },
                    metadata: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                key: { type: "string" },
                                value: { type: "string" }
                            },
                            required: ["key", "value"],
                            additionalProperties: false
                        }
                    },
                },
                required: ["wbsId", "name"],
                additionalProperties: false
            }
        }
    },
    required: ["tasks"],
    additionalProperties: false
};

export class AnthropicService implements IAIProvider {
    private readonly client: Anthropic;
    private readonly model: string;
    private readonly maxTokens: number;

    constructor(env: Env, skipCache: boolean) {
        this.model = env.AI_ANTHROPIC_MODEL;
        this.client = new Anthropic({
            apiKey: env.AI_ANTHROPIC_KEY,
            baseURL: `${env.AI_GATEWAY_URL}/anthropic`,
            defaultHeaders: {
                'cf-aig-skip-cache': `${skipCache}`,
                'anthropic-beta': 'structured-outputs-2025-11-13' // Enable beta feature
            }
        });
        this.maxTokens = this.model.includes('opus') ? 32000 : 64000;
    }

    async generateContent(messages: string[], systemMessage?: string): Promise<ModelResults> {
        try {
            const messages2: Anthropic.MessageParam[] = messages.map(x => ({ role: 'user', content: x }));

            // Streaming is required for long requests
            const stream: any = await this.client.messages.create({
                model: this.model,
                messages: messages2,
                system: systemMessage,
                max_tokens: this.maxTokens,
                temperature: 0.1,
                stream: true,
                // @ts-ignore - Beta feature parameter
                output_format: {
                    type: "json_schema",
                    schema: JsonSchema
                }
            } as any);

            let rawJsonString = "";

            for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    rawJsonString += chunk.delta.text;
                }
            }

            if (!rawJsonString) {
                console.error("No content received from Anthropic stream");
                throw new NonRetryableError("Anthropic returned no content");
            }

            const rawData = JSON.parse(rawJsonString);

            // Validate with Zod
            const validated = ResponseSchema.parse(rawData);

            // Transform metadata array back to Record object
            const transformedTasks = validated.tasks.map(task => {
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

            return { model: this.model, tasks: transformedTasks as any[] };

        } catch (e: any) {
            if (e instanceof NonRetryableError) throw e;
            if (e instanceof Anthropic.APIError) {
                throw new Error(`Anthropic API failed: ${e.status} ${e.message}`);
            }
            if (e instanceof z.ZodError) {
                console.error("Anthropic Zod Validation Failed", e);
                throw new NonRetryableError("Anthropic response failed Zod validation");
            }
            console.error("Failed to parse Anthropic JSON or API error", e);
            throw new NonRetryableError("Invalid JSON returned by Anthropic or API Error");
        }
    }
}
