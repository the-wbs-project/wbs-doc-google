import { ModelResults } from "@wbs/domains";
import { OpenRouterMessage } from "../models/open-router-message";

export class OpenRouterService {
    private readonly apiKey: string;
    private readonly baseUrl = 'https://openrouter.ai/api/v1';

    constructor(env: Env) {
        this.apiKey = env.OPENROUTER_API_KEY;
    }

    async generateContent<T>(message: OpenRouterMessage): Promise<ModelResults<T>> {
        // Prepare messages
        const apiMessages: Array<{ role: string; content: string }> = [];
        if (message.systemMessage) {
            apiMessages.push({ role: 'system', content: message.systemMessage });
        }
        apiMessages.push(...message.userMessages.map(m => ({ role: 'user', content: m })));

        const body = {
            model: message.model,
            messages: apiMessages,
            response_format: message.jsonSchema
        };

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://wbs-ingestion.worker.dev',
                'X-Title': 'WBS Ingestion Worker',
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenRouter API Error: ${response.status} - ${errorText}`);
        }

        const validResponse = await response.json() as any;
        const content = validResponse.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error('OpenRouter returned no content');
        }

        let parsedContent;
        try {
            parsedContent = JSON.parse(content);
        } catch (e) {
            console.error('Failed to parse OpenRouter content:', content);
            throw new Error('Failed to parse OpenRouter JSON response');
        }

        if (message.transformer) {
            parsedContent = message.transformer(parsedContent);
        }

        return { model: validResponse.model || message.model, results: parsedContent as T };
    }

    async getModelDetails(modelId: string): Promise<{ id: string; name: string; description?: string } | null> {
        try {
            const response = await fetch(`${this.baseUrl}/models`);
            if (!response.ok) {
                console.error(`Failed to fetch models from OpenRouter: ${response.status}`);
                return null;
            }

            const data = await response.json() as { data: any[] };
            const model = data.data.find((m: any) => m.id === modelId);

            if (model) {
                return {
                    id: model.id,
                    name: model.name,
                    description: model.description
                };
            }
            return null;
        } catch (error) {
            console.error('Error fetching model details:', error);
            return null;
        }
    }
}
