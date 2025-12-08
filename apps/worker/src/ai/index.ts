import { AnthropicService } from "./anthropic-service";
import { OpenAIService } from "./openai-service";
import { GeminiService } from "./gemini-service";
import { AzureService } from "./azure-service";

export class AIService {
    readonly anthropic: AnthropicService;
    readonly openai: OpenAIService;
    readonly gemini: GeminiService;
    readonly azure: AzureService;

    constructor(env: Env) {
        this.anthropic = new AnthropicService(env);
        this.openai = new OpenAIService(env);
        this.gemini = new GeminiService(env);
        this.azure = new AzureService(env);
    }
}
