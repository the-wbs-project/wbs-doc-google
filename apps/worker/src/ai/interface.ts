import { AiMessage } from "../models/ai-message";

export interface IAIProvider {
    generateContent(message: AiMessage): Promise<string>;
}
