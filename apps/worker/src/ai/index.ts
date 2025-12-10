import { AiCallService } from "./ai-calls";
import { AzureService } from "./azure-service";
import { OpenRouterService } from "./openrouter-service";

export class AIService {
    readonly aiCalls: AiCallService;
    readonly azure: AzureService;
    readonly openrouter: OpenRouterService;

    constructor(env: Env) {
        this.azure = new AzureService(env);
        this.openrouter = new OpenRouterService(env);
        this.aiCalls = new AiCallService(env, this.openrouter);
    }
}
