import { ComparisonResult, ModelResults, TreeTask } from "@wbs/domains";
import { OpenRouterService } from "./openrouter-service";
import { transformTasks } from "../utils/transformers";
import { COMPARISON_SCHEMA, TASK_RESULTS_SCHEMA } from "./json_schemas";

export class AiCallService {
    constructor(private readonly env: Env, private readonly openRouter: OpenRouterService) { }

    async analyzeDocument(models: string[], markdownContent: string): Promise<ModelResults<TreeTask[]>[]> {
        const promises: Promise<ModelResults<TreeTask[]>>[] = [];

        for (const model of models) {
            promises.push(this.analyzeDocumentCall(model, markdownContent));
        }

        return await Promise.all(promises);
    }

    async analyzeDocumentCall(model: string, markdownContent: string): Promise<ModelResults<TreeTask[]>> {
        console.log(`Starting model ${model}`);

        const systemMessage = "You are a project management expert. Extract task hierarchies precisely.";
        const userMessage = 'Extract the Work Breakdown Structure (WBS) from the following document content.';

        const result = await this.openRouter.generateContent<TreeTask[]>({
            model,
            systemMessage,
            userMessages: [userMessage, markdownContent],
            transformer: transformTasks,
            jsonSchema: TASK_RESULTS_SCHEMA
        });
        console.log(`Finished model ${model}`);

        return result;
    }

    async compareResults(modelResults: ModelResults<TreeTask[]>[]): Promise<ComparisonResult> {
        console.log('Starting Comparison...');

        const systemMessage = "You are a detailed auditor of Work Breakdown Structures. Your goal is to compare multiple WBS outputs and identify discrepancies.";
        const userMessage = `Compare the following WBS outputs from different AI models. 
        Identify which tasks are present in all models (consensus), and which are potentially missing or different (discrepancy).
        Return a consolidated list of tasks. 
        If a task is present in all models with effectively the same WBS ID and Name, mark it as 'pass'.
        If a task is missing from some models, or has significantly different details, mark it as 'needs_review' and describe the discrepancy.
        List the sources (model names) that included each task.
        Provide a brief summary of the comparison.`;

        const inputs = modelResults.map(r => JSON.stringify(r));
        const result = await this.openRouter.generateContent<ComparisonResult>({
            model: this.env.COMPARISON_MODEL,
            systemMessage,
            userMessages: [userMessage, ...inputs],
            jsonSchema: COMPARISON_SCHEMA
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