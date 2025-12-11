import { Context } from "hono";
import { ProjectService } from "../project.service";
import { AIService } from "../../ai";

export async function getProject(ctx: Context): Promise<Response> {
    const projectId = ctx.req.param('projectId');
    try {
        const projectService = new ProjectService(ctx.env);

        return ctx.json(await projectService.getProject(projectId));
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

        const instance = await ctx.env.INGESTION_WORKFLOW.create({
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

        // Transform the results into a tree where ID == WBS ID
        const tasks = resultToPromote.results;
        const flatTasks: any[] = [];

        // 1. Flatten the existing tree (just in case it's nested)
        function flatten(list: any[]) {
            for (const t of list) {
                flatTasks.push({ ...t, children: [] }); // Start with empty children
                if (t.children && t.children.length > 0) {
                    flatten(t.children);
                }
            }
        }
        flatten(tasks);

        // 2. Map WBS IDs to objects and set ID = WBS ID
        const taskMap = new Map<string, any>();
        for (const t of flatTasks) {
            t.id = t.wbsId; // FORCE ID to be WBS ID
            taskMap.set(t.wbsId, t);
        }

        // 3. Reconstruct tree structure (SKIPPED - SAVING FLAT LIST)
        /*const rootTasks: any[] = [];
        for (const t of flatTasks) {
            const lastDotIndex = t.wbsId.lastIndexOf('.');
            if (lastDotIndex !== -1) {
                const parentId = t.wbsId.substring(0, lastDotIndex);
                if (taskMap.has(parentId)) {
                    t.parentId = parentId;
                    taskMap.get(parentId).children.push(t);
                } else {
                    t.parentId = null;
                    rootTasks.push(t);
                }
            } else {
                t.parentId = null;
                rootTasks.push(t);
            }
        }*/

        // Correct parentId logic but keep flat
        for (const t of flatTasks) {
            const lastDotIndex = t.wbsId.lastIndexOf('.');
            if (lastDotIndex !== -1) {
                const parentId = t.wbsId.substring(0, lastDotIndex);
                if (taskMap.has(parentId)) {
                    t.parentId = parentId;
                } else {
                    t.parentId = null;
                }
            } else {
                t.parentId = null;
            }
            delete t.children; // Ensure no children array messes up flat binding
        }

        project.tree = flatTasks;

        await projectService.upsertProject(projectId, project);

        return ctx.json({ success: true });

    } catch (e) {
        console.error("Promote Error", e);
        return ctx.text(`Promote Error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
}

export async function updateProject(ctx: Context): Promise<Response> {
    const projectId = ctx.req.param('projectId');
    try {
        const body = await ctx.req.json();
        const projectService = new ProjectService(ctx.env);

        await projectService.upsertProject(projectId, body);

        return ctx.json({ success: true });
    } catch (e) {
        console.error("Update Project Error", e);
        return ctx.text(`Update Project Error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
}

export async function getModelInfo(ctx: Context): Promise<Response> {
    const modelId = ctx.req.param('modelId');
    try {
        const modelInfo = await ctx.env.KV_DATA.get(`model_info:${modelId}`);

        if (modelInfo) {
            return ctx.json(JSON.parse(modelInfo));
        }

        const apiService = new AIService(ctx.env);
        const modelDetails = await apiService.openrouter.getModelDetails(modelId);

        if (!modelDetails) {
            return ctx.text('Model info not found', 404);
        }

        await ctx.env.KV_DATA.put(`model_info:${modelId}`, JSON.stringify(modelDetails));

        return ctx.json(modelDetails);
    } catch (e) {
        console.error("Get Model Info Error", e);
        return ctx.text(`Get Model Info Error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
}