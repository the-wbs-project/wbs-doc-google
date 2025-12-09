import { GoogleGenAI } from "@google/genai";
import { ComparisonResult, ModelResults } from "@wbs/domains";
import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import { IAIProvider } from "./interface";

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

const ComparedTaskSchema = z.object({
    wbsId: z.string(),
    name: z.string(),
    status: z.enum(['pass', 'needs_review']),
    sources: z.array(z.string()),
    discrepancies: z.string().optional(),
});

const ComparisonResponseSchema = z.object({
    tasks: z.array(ComparedTaskSchema),
    summary: z.string(),
});

const GeminiComparisonSchema = {
    type: "OBJECT",
    properties: {
        tasks: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    wbsId: { type: "STRING" },
                    name: { type: "STRING" },
                    status: { type: "STRING", enum: ["pass", "needs_review"] },
                    sources: { type: "ARRAY", items: { type: "STRING" } },
                    discrepancies: { type: "STRING" }
                },
                required: ["wbsId", "name", "status", "sources"]
            }
        },
        summary: { type: "STRING" }
    },
    required: ["tasks", "summary"]
};

export class GeminiService implements IAIProvider {
    private readonly client: GoogleGenAI;
    private readonly model: string;

    constructor(env: Env, skipCache: boolean) {
        // Construct options if necessary. 
        // SDK constructor: new GoogleGenAI({ apiKey, ... })
        this.model = env.AI_GOOGLE_MODEL;

        const version = this.model.includes('preview') ? 'v1beta' : 'v1';

        this.client = new GoogleGenAI({
            apiKey: env.AI_GOOGLE_KEY,
            apiVersion: version,
            httpOptions: {
                baseUrl: `${env.AI_GATEWAY_URL}/google-ai-studio`,
                headers: {
                    'cf-aig-skip-cache': `${skipCache}`
                }
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

    async compareResults(results: ModelResults[]): Promise<ComparisonResult> {
        const systemMessage = "You are a detailed auditor of Work Breakdown Structures. Your goal is to compare multiple WBS outputs and identify discrepancies.";

        const inputs = results.map(r => `Model: ${r.model}\nTasks:\n${JSON.stringify(r.tasks, null, 2)}`).join("\n\n-----------------\n\n");
        const userMessage = `Compare the following WBS outputs from different AI models. 
        Identify which tasks are present in all models (consensus), and which are potentially missing or different (discrepancy).
        Return a consolidated list of tasks. 
        If a task is present in all models with effectively the same WBS ID and Name, mark it as 'pass'.
        If a task is missing from some models, or has significantly different details, mark it as 'needs_review' and describe the discrepancy.
        List the sources (model names) that included each task.
        Provide a brief summary of the comparison.`;

        const contents = [{
            role: "user",
            parts: [{ text: userMessage }, { text: inputs }]
        }];

        const config: any = {
            temperature: 0.1,
            topP: 0.95,
            maxOutputTokens: 65536,
            responseMimeType: "application/json",
            responseSchema: GeminiComparisonSchema,
            systemInstruction: { parts: [{ text: systemMessage }] }
        };

        try {
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: contents as any,
                config: config
            });

            let rawText: string | null = null;
            if (response.text) {
                rawText = typeof response.text === 'string' ? response.text : (response.text as any)();
            }
            if (!rawText && response.candidates && response.candidates.length > 0) {
                rawText = response.candidates[0].content?.parts?.[0]?.text || null;
            }

            if (!rawText) throw new NonRetryableError("No content in Gemini Comparison response");

            const parsed = JSON.parse(rawText);
            const validated = ComparisonResponseSchema.parse(parsed);

            return validated;

        } catch (e: any) {
            if (e instanceof NonRetryableError) throw e;
            if (e instanceof z.ZodError) {
                console.error("Gemini Comparison Zod Validation Failed", e);
                throw new NonRetryableError("Gemini comparison response failed Zod validation");
            }
            console.error("Failed to parse Gemini Comparison JSON or API error", e);
            throw new NonRetryableError("Invalid JSON returned by Gemini during comparison or API Error");
        }
    }
    async refineTasks(tasks: any[], instructions: string): Promise<any[]> {
        const systemMessage = "You are an expert WBS editor. Your goal is to modify the provided WBS task list according to the user's instructions.";
        const userMessage = `Here is a list of WBS tasks:
${JSON.stringify(tasks, null, 2)}

Instructions: ${instructions}

Return the modified list of tasks in the same JSON structure. Maintain the hierarchy and metadata unless instructed otherwise.`;

        const contents = [{
            role: "user",
            parts: [{ text: userMessage }]
        }];

        const config: any = {
            temperature: 0.1,
            topP: 0.95,
            maxOutputTokens: 65536,
            responseMimeType: "application/json",
            responseSchema: GeminiSchema, // Reuse the same schema as generation
            systemInstruction: { parts: [{ text: systemMessage }] }
        };

        try {
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: contents as any,
                config: config
            });

            let rawText: string | null = null;
            if (response.text) {
                rawText = typeof response.text === 'string' ? response.text : (response.text as any)();
            }
            if (!rawText && response.candidates && response.candidates.length > 0) {
                rawText = response.candidates[0].content?.parts?.[0]?.text || null;
            }

            if (!rawText) throw new NonRetryableError("No content in Gemini Refinement response");

            const parsed = JSON.parse(rawText);

            // Transform metadata array back to Record object for Zod validation (Same logic as generateContent)
            if (parsed.tasks && Array.isArray(parsed.tasks)) {
                parsed.tasks = parsed.tasks.map((task: any) => {
                    const metadataRecord: Record<string, string | number> = {};
                    if (task.metadata && Array.isArray(task.metadata)) {
                        task.metadata.forEach((item: any) => {
                            if (item.key && item.value) {
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

            const validated = ResponseSchema.parse(parsed);

            return validated.tasks;

        } catch (e: any) {
            if (e instanceof NonRetryableError) throw e;
            console.error("Failed to parse Gemini Refinement JSON or API error", e);
            throw new NonRetryableError("Refinement failed: " + (e.message || String(e)));
        }
    }
}
