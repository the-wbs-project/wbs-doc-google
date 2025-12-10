export interface OpenRouterMessage {
    model: string;
    systemMessage?: string;
    userMessages: string[];
    jsonSchema?: unknown;
    max_tokens?: number;
    transformer?: (data: any) => any;
}