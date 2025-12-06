import { Container } from '@cloudflare/containers';
import { getMongoClient, getDb } from '../utils/mongo';
import { WbsWorkflow as WbsWorkflowImplementation } from '../workflow/WbsWorkflow';

export class PdfService extends Container {
    defaultPort = 8000; // pass requests to port 8080 in the container
    sleepAfter = "2h"; // only sleep a container if it hasn't gotten requests in 2 hours
}

export class MppService extends Container {
    defaultPort = 8080; // pass requests to port 8080 in the container
    sleepAfter = "2h"; // only sleep a container if it hasn't gotten requests in 2 hours
}

export * from '../workflow/WbsWorkflow';

interface Env {
    FILES_BUCKET: R2Bucket;
    INGESTION_WORKFLOW: Workflow;
    MONGO_URI: string;
}
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        try {
            const url = new URL(request.url);

            if (request.method === 'POST' && url.pathname === '/upload') {
                const formData = await request.formData();
                const file = formData.get('file');

                if (!file || !(file instanceof File)) {
                    return new Response('No file uploaded', { status: 400 });
                }

                const key = `uploads/${crypto.randomUUID()}-${file.name}`;
                await env.FILES_BUCKET.put(key, file);

                // Create a project record
                const projectId = crypto.randomUUID();
                try {
                    const client = await getMongoClient(env);
                    const db = getDb(client);
                    await db.collection('projects').insertOne({
                        _id: projectId as any, // Use _id as string UUID
                        name: file.name,
                        created_at: new Date()
                    });
                } catch (e) {
                    return new Response(`Database error: ${e}`, { status: 500 });
                }

                // Trigger Workflow
                await env.INGESTION_WORKFLOW.create({
                    params: {
                        fileKey: key,
                        projectId: projectId
                    }
                });

                return new Response(JSON.stringify({
                    message: 'Upload successful, processing started',
                    projectId: projectId,
                    fileKey: key
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response('Not Found', { status: 404 });
        } catch (e) {
            console.error('Error processing upload:', e);
            console.log(e);
            return new Response('Server Error', { status: 500 });
        }
    }
};

