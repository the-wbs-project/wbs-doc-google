import { AiTask, ComparisonResult } from "@wbs/domains";
import { ComparisonResponseSchema, ResponseSchema } from "../ai/ai-validation";

export function transformAiTasks(rawData: unknown): AiTask[] {
    const validated = ResponseSchema.parse(rawData);

    return validated.tasks;
}

export function transformComparisonResults(rawData: unknown): ComparisonResult {
    const validated = ComparisonResponseSchema.parse(rawData);

    return validated;
}