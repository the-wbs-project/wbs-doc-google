import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources";
import { NonRetryableError } from "cloudflare:workflows";
import { AiMessage } from "../models/ai-message";
import { IAIProvider } from "./interface";

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

    async generateContent(message: AiMessage): Promise<string> {
        try {
            let systemMessage: string | undefined;
            const messages: MessageParam[] = [];

            for (const part of message.prompt) {
                if (part.role === 'user') {
                    messages.push({
                        role: part.role,
                        content: part.content
                    });
                } else if (part.role === 'system') {
                    systemMessage = part.content;
                }
            }

            // Streaming is required for long requests
            const stream: any = await this.client.messages.create({
                model: this.model,
                messages,
                system: systemMessage,
                max_tokens: message.maxTokens ?? this.maxTokens,
                temperature: 0.1,
                stream: true
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
            return rawJsonString;

        } catch (e: any) {
            if (e instanceof NonRetryableError) throw e;
            if (e instanceof Anthropic.APIError) {
                throw new Error(`Anthropic API failed: ${e.status} ${e.message}`);
            }
            console.error("Failed to parse Anthropic JSON or API error", e);
            throw new NonRetryableError("Invalid JSON returned by Anthropic or API Error");
        }
    }
}
