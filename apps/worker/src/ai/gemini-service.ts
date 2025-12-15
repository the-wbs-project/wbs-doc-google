import { GoogleGenAI } from "@google/genai";
import { NonRetryableError } from "cloudflare:workflows";
import { AiMessage } from "../models/ai-message";
import { ResponseSchema } from "./ai-validation";
import { IAIProvider } from "./interface";

export class GeminiService implements IAIProvider {
    private readonly client: GoogleGenAI;
    private readonly clientBeta: GoogleGenAI;
    private readonly model: string;

    constructor(env: Env, skipCache: boolean) {
        // Construct options if necessary. 
        // SDK constructor: new GoogleGenAI({ apiKey, ... })
        this.model = env.AI_GOOGLE_MODEL;
        this.client = new GoogleGenAI({
            apiKey: env.AI_GOOGLE_KEY,
            apiVersion: 'v1',
            httpOptions: {
                baseUrl: `${env.AI_GATEWAY_URL}/google-ai-studio`,
                headers: {
                    'cf-aig-skip-cache': `${skipCache}`
                }
            }
        });
        this.clientBeta = new GoogleGenAI({
            apiKey: env.AI_GOOGLE_KEY,
            apiVersion: 'v1beta',
            httpOptions: {
                baseUrl: `${env.AI_GATEWAY_URL}/google-ai-studio`,
                headers: {
                    'cf-aig-skip-cache': `${skipCache}`
                }
            }
        });
    }

    async generateContent(message: AiMessage): Promise<string> {
        const config: any = {
            temperature: 0.1,
            topP: 0.95,
            maxOutputTokens: message.maxTokens ?? 65536,
            responseMimeType: "application/json",
        };

        try {
            const { systemInstruction, contents } = this.mapMessageToGemini(message.prompt);

            if (message.promptName === 'compare-results') {
                console.log({
                    model: this.model,
                    contents,
                    config: {
                        ...config,
                        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
                    }
                });
            }

            const result = await this.getClient(this.model).models.generateContentStream({
                model: this.model,
                contents,
                config: {
                    ...config,
                    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
                }
            });

            let rawText = '';
            for await (const chunk of result) {
                const chunkText = chunk.text;
                if (chunkText) {
                    rawText += chunkText;
                }
            }

            if (!rawText) throw new NonRetryableError("No content in Gemini response");

            return rawText;

        } catch (e: any) {
            if (e instanceof NonRetryableError) throw e;

            console.error("Failed to parse Gemini JSON or API error", e);
            throw new NonRetryableError("Invalid JSON returned by Gemini or API Error");
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
            //responseSchema: GeminiSchema, // Reuse the same schema as generation
            systemInstruction: { parts: [{ text: systemMessage }] }
        };

        try {
            const result = await this.getClient(this.model).models.generateContentStream({
                model: this.model,
                contents: contents as any,
                config: config
            });

            let rawText = '';
            for await (const chunk of result) {
                const chunkText = chunk.text;
                if (chunkText) {
                    rawText += chunkText;
                }
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

    async standardize<T>(input: string, schema: any): Promise<T> {
        const model = this.model; // 'gemini-1.5-flash-8b';
        const systemMessage = "You are a data standardization expert. Your goal is to transform the input into the structure defined by the JSON Schema provided.";
        const contents = [{
            role: "user",
            parts: [
                { text: "Please transform the following input data into the correct JSON structure based on the schema provided:" },
                { text: input }
            ]
        }];

        const config: any = {
            temperature: 0.1,
            topP: 0.95,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: schema,
        };

        try {
            const result = await this.getClient(model).models.generateContentStream({
                model,
                config: {
                    ...config,
                    systemInstruction: { parts: [{ text: systemMessage }] }
                },
                contents
            });

            let rawText = '';
            for await (const chunk of result) {
                const chunkText = chunk.text;
                if (chunkText) {
                    rawText += chunkText;
                }
            }

            if (!rawText) throw new NonRetryableError("No content in Gemini Standardization response");

            return JSON.parse(rawText) as T;

        } catch (e: any) {
            if (e instanceof NonRetryableError) throw e;
            console.error("Failed to parse Gemini Standardization JSON or API error", e);
            throw new NonRetryableError("Standardization failed: " + (e.message || String(e)));
        }
    }

    private getClient(model: string): GoogleGenAI {
        if (model.includes('preview') || model.includes('flash')) return this.clientBeta;
        return this.client;
    }

    private mapMessageToGemini(prompt: { role: string; content: string }[]): { systemInstruction?: string; contents: any[] } {
        const systemMessages = prompt.filter(p => p.role === 'system').map(p => p.content);
        const systemInstruction = systemMessages.length > 0 ? systemMessages.join('\n') : undefined;

        const contents = prompt
            .filter(p => p.role !== 'system')
            .map(p => ({
                role: p.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: p.content }]
            }));

        return { systemInstruction, contents };
    }
}
