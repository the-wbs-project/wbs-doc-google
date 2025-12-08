import { getRandom } from '@cloudflare/containers';
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { AIService } from '../ai';
import { ModelResults } from '../models/model-results';
import { getMongoClient, getDb } from '../utils/mongo';
import { MppService } from '../worker/containers';

const INSTANCE_COUNT = 3;

interface WfEnv extends Env {
    MPP_SERVICE_DO: DurableObjectNamespace<MppService>;
}

interface WorkflowParams {
    fileKey: string;
    projectId: string; // The ID of the project in D1
    fileName: string;
}

export class WbsWorkflow extends WorkflowEntrypoint<WfEnv, WorkflowParams> {
    async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
        const { fileKey, projectId, fileName } = event.payload;
        const client = await getMongoClient(this.env);
        const db = getDb(client);
        const aiService = new AIService(this.env);

        try {
            // Step 0: Create Project Record
            await step.do('create-project', async () => {
                try {
                    // specific id, so we use replaceOne with upsert to be safe (idempotent)
                    // or just insertOne and ignore error if it exists?
                    // upsert is safer for retries

                    await db.collection('projects').updateOne(
                        { _id: projectId as any },
                        {
                            $setOnInsert: {
                                _id: projectId as any,
                                name: fileName,
                                created_at: new Date()
                            }
                        },
                        { upsert: true }
                    );
                } catch (e) {
                    console.error("Failed to create project record in DB. Check IP Allowlist.", e);
                    throw new Error(`DB Error (Create Project): ${(e as Error).message}. Ensure 0.0.0.0/0 is whitelisted in Atlas.`);
                }
            });

            // Step 1: Identify file type
            const fileExtension = fileKey.split('.').pop()?.toLowerCase();

            let results: ModelResults | ModelResults[] = [];

            if (fileExtension === 'mpp') {
                results = await step.do('parse-mpp', async () => {
                    // Generate a presigned URL for the container to download
                    // Note: In a real scenario, we might need to pass the object itself or use a shared secret
                    // For now, let's assume the container can access R2 via a presigned URL we generate here
                    // Or we stream the file to the container if it's small enough. 
                    // The plan says "pass a presigned URL".

                    // Actually, R2 presigned URLs need the S3 compat API. 
                    // Let's assume we pass the key and the container has R2 access or we stream it.
                    // For simplicity in this implementation, let's fetch the file and stream it to the container.
                    // WARNING: This might hit memory limits if file is huge. 
                    // Better: Generate presigned URL.

                    // const object = await this.env.FILES_BUCKET.get(fileKey);
                    // const url = ... generate presigned url ...

                    // Alternative: The container binding allows direct fetch.
                    // We can POST the file content if it's not too big.
                    // Or we can assume the container has its own R2 binding (as per plan "The Workflow should use an R2 binding...").
                    // Wait, the plan says "The Workflow (or a subsequent Worker) converts...".
                    // Plan says: "Workflow passes this key to the MPXJ Container. Container downloads the file directly from R2".

                    const containerInstance = await getRandom(this.env.MPP_SERVICE_DO, INSTANCE_COUNT);
                    const response = await containerInstance.fetch('http://mpp-service/parse', {
                        method: 'POST',
                        body: JSON.stringify({ fileKey }), // Container needs to handle R2 download
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (!response.ok) {
                        throw new Error(`MPP Service failed: ${response.statusText}`);
                    }

                    return [{ model: 'none', tasks: await response.json() }];
                });
            } else if (fileExtension === 'pdf') {
                // Step 1: Extract Markdown from PDF via Azure Document Intelligence
                const markdownContent = await step.do('extract-pdf-azure', async () => {
                    return await aiService.azure.extractMarkdown(fileKey, fileName);
                });

                // Step 2: Analyze full document with Gemini
                // We send the markdown content directly.
                results = await step.do('analyze-document', async () => {
                    const systemMessage = "You are a project management expert. Extract task hierarchies precisely.";
                    const userMessage = 'Extract the Work Breakdown Structure (WBS) from the following document content.';

                    return await Promise.all([
                        aiService.gemini.generateContent([userMessage, markdownContent], systemMessage),
                        aiService.openai.generateContent([userMessage, markdownContent], systemMessage),
                        aiService.anthropic.generateContent([userMessage, markdownContent], systemMessage)
                    ]);
                });
            }

            // Step 4: Reconstruct Tree
            /*const tree = reconstructTree(flatTasks);
            const dbRows = flattenTreeForDb(tree);

            // Step 5: Persist
            await step.do('persist-db', async () => {
                try {
                    await saveTasksToDb(this.ctx, db, projectId, dbRows);
                } catch (e) {
                    console.error("Failed to persist tasks to DB.", e);
                    throw new Error(`DB Error (Persist Tasks): ${(e as Error).message}.`);
                }
            });*/

            return { success: true, results: results };

        } catch (error) {
            console.error('Workflow failed unrecoverably:', error);
            // Log to logging service if available
            throw new NonRetryableError(error instanceof Error ? error.message : String(error));
        }
    }
}
