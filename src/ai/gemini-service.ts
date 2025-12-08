import { GoogleGenAI } from "@google/genai";
import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import { IAIProvider } from "./interface";
import { ModelResults } from "../models/model-results";

const TreeTaskSchema = z.object({
    wbsId: z.string(),
    name: z.string(),
    metadata: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});

const ResponseSchema = z.object({
    tasks: z.array(TreeTaskSchema),
});

// JSON Schema definition for Gemini
const GeminiSchema = {
    type: "OBJECT",
    properties: {
        tasks: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    wbsId: { type: "STRING" },
                    name: { type: "STRING" },
                    metadata: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                key: { type: "STRING" },
                                value: { type: "STRING" }
                            },
                            required: ["key", "value"]
                        }
                    },
                },
                required: ["wbsId", "name", "metadata"]
            }
        }
    },
    required: ["tasks"]
};

export class GeminiService implements IAIProvider {
    private readonly client: GoogleGenAI;
    private readonly model: string;

    constructor(env: Env) {
        // Construct options if necessary. 
        // SDK constructor: new GoogleGenAI({ apiKey, ... })
        this.model = env.AI_GOOGLE_MODEL;

        const version = this.model.includes('preview') ? 'v1beta' : 'v1';

        this.client = new GoogleGenAI({
            apiKey: env.AI_GOOGLE_KEY,
            apiVersion: version,
            httpOptions: {
                baseUrl: `${env.AI_GATEWAY_URL}/google-ai-studio`
            }
        });
    }

    async generateContent(messages: string[], systemMessage?: string): Promise<ModelResults> {
        const contents = [{
            role: "user",
            parts: messages.map(msg => ({ text: msg }))
        }];
        const config: any = {
            temperature: 0.1,
            topP: 0.95,
            maxOutputTokens: 65536,
            responseMimeType: "application/json",
            responseSchema: GeminiSchema,
        };

        if (systemMessage) {
            config.systemInstruction = { parts: [{ text: systemMessage }] };
        }

        try {
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: contents as any,
                config: config
            });

            let rawText: string | null = null;

            if (response.text) {
                if (typeof response.text === 'string') {
                    rawText = response.text;
                } else if (typeof response.text === 'function') {
                    rawText = (response.text as any)();
                }
            }

            if (!rawText && response.candidates && response.candidates.length > 0) {
                rawText = response.candidates[0].content?.parts?.[0]?.text || null;
            }

            if (!rawText) throw new NonRetryableError("No content in Gemini response");

            const parsed = JSON.parse(rawText);

            // Transform metadata array back to Record object for Zod validation
            if (parsed.tasks && Array.isArray(parsed.tasks)) {
                parsed.tasks = parsed.tasks.map((task: any) => {
                    const metadataRecord: Record<string, string | number> = {};
                    if (task.metadata && Array.isArray(task.metadata)) {
                        task.metadata.forEach((item: any) => {
                            if (item.key && item.value) {
                                // Try to parse number if it looks like one
                                const num = Number(item.value);
                                metadataRecord[item.key] = !isNaN(num) ? num : item.value;
                            }
                        });
                    }
                    return {
                        ...task,
                        metadata: metadataRecord
                    };
                });
            }

            // Validate with Zod
            const validated = ResponseSchema.parse(parsed);

            return {
                model: this.model,
                tasks: validated.tasks as any[]
            };

        } catch (e: any) {
            if (e instanceof NonRetryableError) throw e;
            if (e instanceof z.ZodError) {
                console.error("Gemini Zod Validation Failed", e);
                throw new NonRetryableError("Gemini response failed Zod validation");
            }
            console.error("Failed to parse Gemini JSON or API error", e);
            throw new NonRetryableError("Invalid JSON returned by Gemini or API Error");
        }
    }
}
