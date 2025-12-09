import { ModelResults } from "@wbs/domains";

export interface IAIProvider {
    generateContent(messages: string[], systemMessage?: string): Promise<ModelResults>;
}
