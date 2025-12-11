import { Context } from "hono";

export async function workflowStart(ctx: Context): Promise<Response> {
    try {
        const formData = await ctx.req.parseBody();
        const file = formData['file'];

        if (!file || !(file instanceof File)) {
            return ctx.text('No file uploaded', 400);
        }

        const key = `uploads/${crypto.randomUUID()}-${file.name}`;
        await ctx.env.FILES_BUCKET.put(key, file);

        const projectId = crypto.randomUUID();

        // Trigger Workflow
        let instance: WorkflowInstance;

        if (file.name.toLowerCase().endsWith('.mpp')) {
            instance = await ctx.env.MPP_WORKFLOW.create({
                params: {
                    fileKey: key,
                    projectId: projectId,
                    fileName: file.name,
                    skipCache: false
                }
            });
        } else {
            instance = await ctx.env.INGESTION_WORKFLOW.create({
                params: {
                    fileKey: key,
                    projectId: projectId,
                    fileName: file.name,
                    skipCache: false
                }
            });
        }

        return ctx.json({
            message: 'Upload successful, processing started',
            projectId: projectId,
            fileKey: key,
            workflowId: instance.id
        });
    } catch (e) {
        console.error('Error processing upload:', e);
        return ctx.text(`Server Error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
}

export async function workflowStatus(ctx: Context): Promise<Response> {
    const id = ctx.req.param('id');
    try {
        const instance = await ctx.env.INGESTION_WORKFLOW.get(id);

        const status = await instance.status();
        return ctx.json(status);
    } catch (e) {
        return ctx.text('Workflow instance not found', 404);
    }
}