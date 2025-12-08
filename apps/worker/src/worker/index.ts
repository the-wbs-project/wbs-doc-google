import { Container } from '@cloudflare/containers';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

export * from './containers';
export * from '../workflow/WbsWorkflow';
import { getMongoClient, getDb } from '../utils/mongo';
import { reconstructTree } from '../workflow/treeUtils';

interface Env {
    FILES_BUCKET: R2Bucket;
    INGESTION_WORKFLOW: Workflow;
    MONGO_URI: string;
    ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// API Routes
app.post('/upload', async (c) => {
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
                fileName: file.name
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

app.get('/status/:id', async (c) => {
    const id = c.req.param('id');
    try {
        const instance = await c.env.INGESTION_WORKFLOW.get(id);
        const status = await instance.status();
        return c.json(status);
    } catch (e) {
        return c.text('Workflow instance not found', 404);
    }
});

app.get('/api/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    try {
        const client = await getMongoClient(c.env);
        const db = getDb(client);

        console.log(projectId);
        // Fetch all tasks for this project
        const tasks = await db.collection('tasks').find({ project_id: projectId }).sort({ order_index: 1 }).toArray();

        console.log(tasks.length);
        if (!tasks || tasks.length === 0) {
            return c.json({ tree: [] });
        }

        // Convert DB tasks to FlatTask format expected by reconstructTree
        const flatTasks = tasks.map((t: any) => ({
            id: t._id, // Internal ID
            name: t.name,
            outlineLevel: t.indent_level,
            wbsId: t.wbs_id, // Important for reconstruction!
            orderIndex: t.order_index,
            metadata: t.metadata
        }));

        const tree = reconstructTree(flatTasks);

        return c.json({ tree: tree });

    } catch (e: any) {
        console.error("API Error", e);
        return c.text(`API Error: ${e.message}`, 500);
    }
});

// Fallback to serving assets
app.get('*', async (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
