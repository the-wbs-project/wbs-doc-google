import { Langfuse, TextPromptClient } from "langfuse";

export class LangfuseService {
    private readonly langfuse: Langfuse;

    constructor(env: Env) {
        this.langfuse = new Langfuse({
            publicKey: env.LANGFUSE_PUBLIC_KEY,
            secretKey: env.LANGFUSE_SECRET_KEY,
            baseUrl: env.LANGFUSE_HOST
        });
    }

    async getPrompt(name: string, version?: number, label?: string): Promise<TextPromptClient> {
        return await this.langfuse.getPrompt(name, version, { label });
    }
}
