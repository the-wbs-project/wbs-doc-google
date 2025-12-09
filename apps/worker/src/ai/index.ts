import { AnthropicService } from "./anthropic-service";
import { OpenAIService } from "./openai-service";
import { GeminiService } from "./gemini-service";
import { AzureService } from "./azure-service";

export class AIService {
    readonly anthropic: AnthropicService;
    readonly openai: OpenAIService;
    readonly gemini: GeminiService;
    readonly azure: AzureService;

    constructor(env: Env, skipCache: boolean) {
        this.anthropic = new AnthropicService(env, skipCache);
        this.openai = new OpenAIService(env, skipCache);
        this.gemini = new GeminiService(env, skipCache);
        this.azure = new AzureService(env);
    }
}
