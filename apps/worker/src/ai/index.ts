import { AiCallService } from "./ai-calls";
import { AzureService } from "./azure-service";
import { OpenRouterService } from "./openrouter-service";
import { LangfuseService } from "./langfuse-service";

export class AIService {
    readonly aiCalls: AiCallService;
    readonly azure: AzureService;
    readonly openrouter: OpenRouterService;
    readonly langfuse: LangfuseService;

    constructor(env: Env) {
        this.azure = new AzureService(env);
        this.openrouter = new OpenRouterService(env);
        this.langfuse = new LangfuseService(env);
        this.aiCalls = new AiCallService(env, this.langfuse, this.openrouter);
    }
}
