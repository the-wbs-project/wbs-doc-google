import { NonRetryableError } from "cloudflare:workflows";
import { OpenAI } from "openai";
import { AiMessage } from "../models/ai-message";
import { IAIProvider } from "./interface";

export class OpenAIService implements IAIProvider {
    private readonly client: OpenAI;
    private readonly model: string;

    constructor(env: Env, skipCache: boolean) {
        this.client = new OpenAI({
            apiKey: env.AI_OPENAI_KEY,
            baseURL: `${env.AI_GATEWAY_URL}/openai`,
            defaultHeaders: {
                'cf-aig-skip-cache': `${skipCache}`
            }
        });
        this.model = env.AI_OPENAI_MODEL;
    }

    async generateContent(message: AiMessage): Promise<string> {
        try {
            const chatMessages = message.prompt as { role: string; content: string }[];

            // Responses API prefers system/developer guidance via `instructions`
            const instructions = chatMessages
                .filter((m) => m.role === "system" || m.role === "developer")
                .map((m) => m.content)
                .join("\n\n")
                .trim();

            // Keep user/assistant turns as input items (simple text form)
            const input = chatMessages
                .filter((m) => m.role !== "system" && m.role !== "developer")
                .map((m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content, // IMPORTANT: string content
                }));

            const stream = await this.client.responses.create({
                model: this.model,
                ...(instructions ? { instructions } : {}),
                input,
                max_output_tokens: message.maxTokens ?? 65536,
                stream: true,
            });

            let content = "";

            for await (const event of stream) {
                if (event.type === "response.output_text.delta") {
                    content += event.delta ?? "";
                } else if (event.type === "error") {
                    console.error("OpenAI stream error event", event);
                    throw new NonRetryableError("OpenAI streaming error");
                }
            }

            if (!content) {
                console.error("No content in OpenAI response");
                throw new NonRetryableError("OpenAI returned no content");
            }

            return content;
        } catch (e: any) {
            if (e instanceof NonRetryableError) throw e;
            console.error("OpenAI API Error", e);
            throw new NonRetryableError("Failed to generate content with OpenAI API");
        }
    }

}
