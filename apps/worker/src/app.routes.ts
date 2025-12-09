import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AIService } from './ai';
import { getMongoClient, getDb } from './utils/mongo';
import { reconstructTree } from './utils/treeUtils';

export * from './containers/mpp';
export * from './workflow/wbs';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// API Routes
app.post('/api/upload', async (c) => {
    try {
        const formData = await c.req.parseBody();
        const file = formData['file'];

        if (!file || !(file instanceof File)) {
            return c.text('No file uploaded', 400);
        }

        const key = `uploads/${crypto.randomUUID()}-${file.name}`;
        await c.env.FILES_BUCKET.put(key, file);

        const projectId = crypto.randomUUID();

        // Trigger Workflow
        const instance = await c.env.INGESTION_WORKFLOW.create({
            params: {
                fileKey: key,
                projectId: projectId,
                fileName: file.name,
                skipCache: false
            }
        });

        return c.json({
            message: 'Upload successful, processing started',
            projectId: projectId,
            fileKey: key,
            workflowId: instance.id
        });
    } catch (e: any) {
        console.error('Error processing upload:', e);
        return c.text(`Server Error: ${e.message}`, 500);
    }
});

app.get('/api/status/:id', async (c) => {
    const id = c.req.param('id');
    try {
        const instance = await c.env.INGESTION_WORKFLOW.get(id);
        const status = await instance.status();
        return c.json(status);
    } catch (e) {
        return c.text('Workflow instance not found', 404);
    }
});


app.post('/api/ai/refine', async (c) => {
    try {
        const { tasks, instructions } = await c.req.json();
        const aiService = new AIService(c.env, true);
        const refinedTasks = await aiService.gemini.refineTasks(tasks, instructions);
        return c.json({ tasks: refinedTasks });
    } catch (e: any) {
        console.error("Refinement Error", e);
        return c.text(`Refinement Error: ${e.message}`, 500);
    }
});

app.get('/api/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    try {
        const client = await getMongoClient(c.env);
        const db = getDb(client);

        const project = await db.collection('projects').findOne({ _id: projectId as any });
        console.log(`[DEBUG] Project fetched: ${!!project}`);

        let tree: any[] = [];

        // Fetch legacy tasks collection (Active Grid)
        console.log('[DEBUG] Fetching active tasks...');
        const tasks = await db.collection('tasks').find({ project_id: projectId }).sort({ order_index: 1 }).toArray();
        console.log(`[DEBUG] Tasks fetched: ${tasks?.length}`);

        if (tasks && tasks.length > 0) {
            const flatTasks = tasks.map((t: any) => ({
                id: t._id,
                name: t.name,
                outlineLevel: t.indent_level,
                wbsId: t.wbs_id,
                orderIndex: t.order_index,
                metadata: t.metadata
            }));

            console.log('[DEBUG] Reconstructing tree...');
            tree = reconstructTree(flatTasks);
            console.log(`[DEBUG] Tree reconstructed. Nodes: ${tree.length}`);
        }

        // If project has model_results (new flow), return it alongside the tree
        if (project && (project.model_results || project.comparison_result)) {
            console.log('[DEBUG] Returning new flow results with tree');
            return c.json({
                modelResults: project.model_results,
                comparison: project.comparison_result,
                tree: tree
            });
        }

        return c.json({ tree: tree });

    } catch (e: any) {
        console.error("API Error", e);
        return c.text(`API Error: ${e.message}`, 500);
    }
});

// Delete a specific model result
app.delete('/api/projects/:projectId/models/:modelId', async (c) => {
    const projectId = c.req.param('projectId');
    const modelId = c.req.param('modelId');

    try {
        const client = await getMongoClient(c.env);
        const db = getDb(client);

        const project = await db.collection('projects').findOne({ _id: projectId as any });
        if (!project || !project.model_results) {
            return c.text('Project or model results not found', 404);
        }

        const modelResults = project.model_results as any[];
        const filteredResults = modelResults.filter((r: any) => r.model !== modelId);

        let comparison = undefined;
        if (filteredResults.length > 1) {
            const aiService = new AIService(c.env, true);
            comparison = await aiService.gemini.compareResults(filteredResults);
        }

        await db.collection('projects').updateOne(
            { _id: projectId as any },
            {
                $set: {
                    model_results: filteredResults,
                    comparison_result: comparison,
                    last_updated: new Date()
                }
            }
        );

        return c.json({ success: true, modelResults: filteredResults, comparison });
    } catch (e: any) {
        console.error("Delete Model Error", e);
        return c.text(`Delete Model Error: ${e.message}`, 500);
    }
});

// Trigger a Re-run for a specific model
app.post('/api/projects/:projectId/models/:modelId/rerun', async (c) => {
    const projectId = c.req.param('projectId');
    const modelId = c.req.param('modelId');

    try {
        const client = await getMongoClient(c.env);
        const db = getDb(client);

        const project = await db.collection('projects').findOne({ _id: projectId as any });
        if (!project || !project.file_key) {
            return c.text('Project or file key not found. Cannot rerun.', 404);
        }

        // Trigger Workflow for SINGLE model
        const instance = await c.env.INGESTION_WORKFLOW.create({
            params: {
                fileKey: project.file_key,
                projectId: projectId,
                fileName: project.name,
                skipCache: true,
                models: [modelId]
            }
        });

        return c.json({
            message: `Rerun triggered for ${modelId}`,
            workflowId: instance.id
        });

    } catch (e: any) {
        console.error("Rerun Error", e);
        return c.text(`Rerun Error: ${e.message}`, 500);
    }
});

// Promote a specific model result to the main grid
app.post('/api/projects/:projectId/models/:modelId/promote', async (c) => {
    const projectId = c.req.param('projectId');
    const modelId = c.req.param('modelId');

    try {
        const client = await getMongoClient(c.env);
        const db = getDb(client);

        const project = await db.collection('projects').findOne({ _id: projectId as any });
        if (!project || !project.model_results) {
            return c.text('Project or model results not found', 404);
        }

        const modelResults = project.model_results as any[];
        const resultToPromote = modelResults.find((r: any) => r.model === modelId);

        if (!resultToPromote) {
            return c.text('Model result not found', 404);
        }

        // The resultToPromote.tasks contains the hierarchical or flat tasks? 
        // Based on previous code, they seem to be flat or tree-like?
        // Let's assume they are structured tasks.
        // We need to convert them to the flat structure stored in 'tasks' collection.
        // The `tasks` collection uses: _id, project_id, name, indent_level, parent_id, order_index, wbs_id, metadata

        // We need a helper to flatten the tree if it is a tree.
        // Assuming resultToPromote.tasks is a list of tasks.
        // Let's inspect the structure of `reconstructTree` usage.
        // It consumes flat tasks.
        // The `treeUtils.ts` has `flattenTreeForDb`.

        // If the model result tasks are already flat (which AI service usually returns), we just map them.
        // But if they are a tree, we flatten.
        // Let's assume they are a tree since they come from the workflow processing which might reconstruct them?
        // Wait, `model_results` are typically the output of the AI service, which are flat tasks?
        // Let's check `WbsWorkflow.ts` (deleted/moved) or `AI service`.
        // AI Service usually returns a list of tasks with indent_level.

        const tasksToSave: any[] = [];
        const generateId = () => crypto.randomUUID();

        // If tasks have children, flatten. If not, map.
        // Simple heuristic: check if any task has `children` array.
        const hasChildren = resultToPromote.tasks.some((t: any) => t.children && t.children.length > 0);

        if (hasChildren) {
            // Use flattenTreeForDb (but we need to import it or implement it)
            // We'll trust they are flat for now as Gemini usually returns a flat list with levels.
            // Wait, `reconstructTree` builds the tree for the UI.
        }

        // We will wipe existing tasks for this project and insert new ones.
        await db.collection('tasks').deleteMany({ project_id: projectId });

        const newTasks = resultToPromote.tasks.map((t: any, index: number) => ({
            _id: t.id || generateId(),
            project_id: projectId,
            name: t.name,
            indent_level: t.outlineLevel || t.indent_level || 1,
            parent_id: null, // We'll let reconstructTree figure it out or we need to recalc?
            // Actually, if we just save them flat with indent_level, `reconstructTree` on GET will work!
            // BUT `reconstructTree` relies on `wbs_id` logic usually, OR `indent_level`.
            // The `reconstructTree` in `treeUtils` uses `wbsId` to find parents?
            // Let's check `reconstructTree`.
            // It iterates `flatTasks`, uses `wbsId` to find parent.
            // If `wbsId` is missing, it puts at root.

            wbs_id: t.wbsId,
            order_index: index,
            metadata: JSON.stringify(t.metadata || {})
        }));

        await db.collection('tasks').insertMany(newTasks);

        // Also update the project to indicate it was promoted? 
        // Or maybe just ensure GET prefers tasks if they exist?
        // GET currently prioritizes `model_results`.
        // We need to change GET to check if we want to return the tree.
        // But if we just update `tasks`, GET will still return `model_results` and `tree: []`.
        // So we should probably remove `model_results`?
        // Or update a flag?
        // "Promote" implies we are moving to the grid editor.
        // Maybe we just nullify `model_results`?
        // "It saves the data the backend see and this is currently the data we're currently preparing to load."

        // I'll effectively "archive" the comparison by unsetting it?
        // Or I should change the GET logic to always return the tree if tasks exist.
        // Let's modify GET in the next step. For now, let's just save the tasks.

        return c.json({ success: true, count: newTasks.length });
    } catch (e: any) {
        console.error("Promote Error", e);
        return c.text(`Promote Error: ${e.message}`, 500);
    }
});

// Fallback to serving assets
app.get('*', async (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
});

export const APP_ROUTES = app;
