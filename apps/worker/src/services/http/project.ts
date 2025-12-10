import { Context } from "hono";
import { ProjectService } from "../project.service";
import { generateId } from "../../utils/generate-id";
import { TreeTask } from "@wbs/domains";

export async function getProject(ctx: Context): Promise<Response> {
    const projectId = ctx.req.param('projectId');
    try {
        const projectService = new ProjectService(ctx.env);

        return ctx.json(await projectService.getProjectWithTree(projectId));
    } catch (e) {
        console.error("Get Project Error", e);
        return ctx.text(`API Error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
}

// Delete a specific model result
export async function deleteModelResult(ctx: Context): Promise<Response> {
    const projectId = ctx.req.param('projectId');
    const modelId = ctx.req.param('modelId');

    try {
        const projectService = new ProjectService(ctx.env);
        const result = await projectService.deleteModelResult(projectId, modelId);
        return ctx.json(result);
    } catch (e: any) {
        console.error("Delete Model Error", e);
        return ctx.text(`Delete Model Error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
}

export async function refineProject(ctx: Context): Promise<Response> {
    try {
        const { modelId, projectId } = await ctx.req.param();
        const { instructions } = await ctx.req.json();

        const instance = await ctx.env.REFINEMENT_WORKFLOW.send({
            payload: {
                projectId: projectId,
                modelId: modelId,
                instructions: instructions
            }
        });

        return ctx.json({
            message: 'Refinement started',
            workflowId: instance.id
        });
    } catch (e: any) {
        console.error("Refinement Error", e);
        return ctx.text(`Refinement Error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
}

export async function rerunModel(ctx: Context): Promise<Response> {
    try {
        const { modelId, projectId } = await ctx.req.param();

        const instance = await ctx.env.INGESTION_WORKFLOW.send({
            payload: {
                projectId: projectId,
                models: [modelId]
            }
        });

        return ctx.json({
            message: 'Refinement started',
            workflowId: instance.id
        });
    } catch (e: any) {
        console.error("Refinement Error", e);
        return ctx.text(`Refinement Error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
}

export async function promoteModel(ctx: Context): Promise<Response> {
    const { projectId, modelId } = await ctx.req.param();

    try {
        const projectService = new ProjectService(ctx.env);
        const project = await projectService.getProject(projectId);

        if (!project || !project.model_results) {
            return ctx.text('Project or model results not found', 404);
        }

        const resultToPromote = project.model_results.find((r) => r.model === modelId);

        if (!resultToPromote) {
            return ctx.text('Model result not found', 404);
        }

        const newTasks = resultToPromote.results.map((t: TreeTask, index: number) => ({
            _id: t.id || generateId(),
            project_id: projectId,
            name: t.name,
            indent_level: t.outlineLevel,
            parent_id: null,
            wbs_id: t.wbsId,
            order_index: index,
            metadata: t.metadata ?? {}
        }));

        const count = await projectService.replaceTasks(projectId, newTasks);

        return ctx.json({ success: true, count: count });
    } catch (e) {
        console.error("Promote Error", e);
        return ctx.text(`Promote Error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
}