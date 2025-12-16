import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTP } from './services/http';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// API Routes
app.post('/api/workflow/start', HTTP.workflowStart);
app.get('/api/workflow/status/:id', HTTP.workflowStatus);
app.post('/api/refine', HTTP.refine);
app.get('/api/projects/:projectId', HTTP.getProject);
app.put('/api/projects/:projectId', HTTP.updateProject);

app.post('/api/projects/:projectId/models/:modelId/refine', HTTP.refineProject);
app.post('/api/projects/:projectId/models/:modelId/rerun', HTTP.rerunModel);
app.post('/api/projects/:projectId/models/:modelId/promote', HTTP.promoteModel);

app.delete('/api/projects/:projectId/models/:modelId', HTTP.deleteModelResult);

// Serve files from R2 for OpenRouter validation
app.get('/files/:key', async (c) => {
    const key = c.req.param('key');
    const file = await c.env.FILES_BUCKET.get(key);

    if (!file) {
        return c.text('File not found', 404);
    }

    const headers = new Headers();
    file.writeHttpMetadata(headers);
    headers.set('etag', file.httpEtag);
    headers.set('Content-Type', 'application/pdf');

    return new Response(file.body, {
        headers,
    });
});

export const APP_ROUTES = app;
