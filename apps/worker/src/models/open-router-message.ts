export interface OpenRouterMessage {
    model: string;
    systemMessage?: string;
    userMessages: string[];
    jsonSchema?: unknown;
    max_tokens?: number;
    transformer?: (data: any) => any;
}

export interface OpenRouterTemplatedMessage {
    model: string;
    promptName: string;
    prompt: Array<{ role: string; content: string }> | string;
    config?: Record<string, unknown>;
    transformer?: (data: any) => any;
}