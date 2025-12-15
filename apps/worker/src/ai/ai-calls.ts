import { ComparisonResult, ModelResults, TreeTask } from "@wbs/domains";
import { GEMINI_COMPARISON_SCHEMA, GEMINI_TASK_SCHEMA } from "./ai-validation";
import { AIService } from "./index";
import { LangfuseService } from "./langfuse-service";

export class AiCallService {
    constructor(private readonly prompts: LangfuseService, private readonly ai: AIService) { }

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
        const aiService = this.ai.getService(model);

        const textResults = await aiService.generateContent({
            prompt,
            promptName: 'process-document',
            maxTokens: this.getMaxTokens(promptObj.config as any)
        });

        const results = await this.ai.gemini.standardize<TreeTask[]>(textResults, GEMINI_TASK_SCHEMA);

        console.log(`Finished model ${model}`);

        return { model, results };
    }

    async compareResults(modelResults: ModelResults<TreeTask[]>[]): Promise<ComparisonResult> {
        console.log('Starting Comparison...');

        const promptObj = await this.prompts.getPrompt('compare-results', undefined, 'latest');
        const prompt = promptObj.compile({ inputs: JSON.stringify(modelResults) }) as unknown as { role: string; content: string }[];

        const textResults = await this.ai.openai.generateContent({
            prompt,
            promptName: 'compare-results',
            maxTokens: this.getMaxTokens(promptObj.config as any)
        });

        console.log('Finished Comparison...');

        return await this.ai.gemini.standardize<ComparisonResult>(textResults, GEMINI_COMPARISON_SCHEMA);
    }

    async refineTasks(data: ModelResults<TreeTask[]>, instructions: string): Promise<ModelResults<TreeTask[]>> {
        const systemMessage = "You are a project management expert. Refine the tasks based on the instructions.";
        const userMessage = `Refine the following tasks based on the instructions.`;

        const aiService = this.ai.getService(data.model);

        const text = await aiService.generateContent({
            prompt: [{ role: 'system', content: systemMessage }, { role: 'user', content: userMessage }, { role: 'user', content: instructions }, { role: 'user', content: JSON.stringify(data.results) }],
            promptName: 'refine-tasks',
            //maxTokens: this.getMaxTokens(promptObj.config as any)
        });

        return { model: data.model, results: [...data.results] };
    }

    private getMaxTokens(config: Record<string, unknown>): number | undefined {
        return config['maxTokens'] as number | undefined;
    }
}