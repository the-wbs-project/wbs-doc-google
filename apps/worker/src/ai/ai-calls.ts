import { ComparisonResult, ModelResults, TreeTask } from "@wbs/domains";
import { OpenRouterService } from "./openrouter-service";
import { transformTasks } from "../utils/transformers";
import { COMPARISON_SCHEMA, TASK_RESULTS_SCHEMA } from "./json_schemas";
import { LangfuseService } from "./langfuse-service";

export class AiCallService {
    constructor(
        private readonly env: Env,
        private readonly prompts: LangfuseService,
        private readonly openRouter: OpenRouterService) { }

    async analyzeDocument(models: string[], markdownContent: string): Promise<ModelResults<TreeTask[]>[]> {
        const promises: Promise<ModelResults<TreeTask[]>>[] = [];

        for (const model of models) {
            promises.push(this.analyzeDocumentCall(model, markdownContent));
        }

        return await Promise.all(promises);
    }

    async analyzeDocumentCall(model: string, markdownContent: string): Promise<ModelResults<TreeTask[]>> {
        console.log(`Starting model ${model}`);

        const promptObj = await this.prompts.getPrompt('process-document', undefined, 'latest');
        const prompt = promptObj.compile({ markdownContent }) as unknown as { role: string; content: string }[];

        const result = await this.openRouter.generateTemplatedContent<TreeTask[]>({
            model,
            prompt,
            promptName: 'process-document',
            config: promptObj.config as Record<string, unknown>,
            transformer: transformTasks,
        });

        console.log(`Finished model ${model}`);

        return result;
    }

    async compareResults(modelResults: ModelResults<TreeTask[]>[]): Promise<ComparisonResult> {
        console.log('Starting Comparison...');

        const promptObj = await this.prompts.getPrompt('compare-results', undefined, 'latest');
        const prompt = promptObj.compile({ inputs: JSON.stringify(modelResults) }) as unknown as { role: string; content: string }[];

        const result = await this.openRouter.generateTemplatedContent<ComparisonResult>({
            model: this.env.COMPARISON_MODEL,
            promptName: 'compare-results',
            prompt,
            config: promptObj.config as Record<string, unknown>
        });

        console.log('Finished Comparison...');

        return result.results;
    }

    async refineTasks(data: ModelResults<TreeTask[]>, instructions: string): Promise<ModelResults<TreeTask[]>> {
        const systemMessage = "You are a project management expert. Refine the tasks based on the instructions.";
        const userMessage = `Refine the following tasks based on the instructions.`;

        return await this.openRouter.generateContent<TreeTask[]>({
            model: data.model,
            systemMessage,
            userMessages: [userMessage, instructions, JSON.stringify(data.results)],
            transformer: transformTasks,
            jsonSchema: TASK_RESULTS_SCHEMA
        });
    }
}