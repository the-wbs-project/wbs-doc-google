export interface AiMessage {
    promptName: string;
    prompt: { role: string; content: string }[];
    maxTokens?: number;
}

export interface StandardizationModel {
    prompt: { role: string; content: string }[];
    format: unknown;
}