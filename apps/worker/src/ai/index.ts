import { AiCallService } from "./ai-calls";
import { AnthropicService } from "./anthropic-service";
import { AzureService } from "./azure-service";
import { GeminiService } from "./gemini-service";
import { IAIProvider } from "./interface";
import { LangfuseService } from "./langfuse-service";
import { OpenAIService } from "./openai-service";

export class AIService {
    readonly aiCalls: AiCallService;
    readonly azure: AzureService;
    readonly langfuse: LangfuseService;
    readonly gemini: GeminiService;
    readonly openai: OpenAIService;
    readonly anthropic: AnthropicService;

    constructor(env: Env) {
        this.azure = new AzureService(env);
        this.langfuse = new LangfuseService(env);
        this.anthropic = new AnthropicService(env, false);
        this.gemini = new GeminiService(env, false);
        this.openai = new OpenAIService(env, false);
        this.aiCalls = new AiCallService(this.langfuse, this);
    }

    getService(model: string): IAIProvider {
        if (model.includes('gemini')) return this.gemini;
        if (model.includes('gpt')) return this.openai;
        if (model.includes('claude')) return this.anthropic;

        throw new Error("Unknown LLM Model");
    }
}
