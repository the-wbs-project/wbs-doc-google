import { TreeTask } from "@wbs/domains";
import { Context } from "hono";
import { AIService } from "../../ai";

export async function refine(ctx: Context): Promise<Response> {
    try {
        const { model, instructions, tasks } = await ctx.req.json() as { model: string, instructions: string, tasks: TreeTask[] };
        const aiService = new AIService(ctx.env);
        const refinedTasks = await aiService.aiCalls.refineTasks(model, tasks, instructions);

        return ctx.json(refinedTasks);
    } catch (e) {
        console.error('Error refining tasks:', e);
        return ctx.text(`Server Error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
}
