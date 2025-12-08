import { ModelResults } from "../models/model-results";

export interface IAIProvider {
    generateContent(messages: string[], systemMessage?: string): Promise<ModelResults>;
}
