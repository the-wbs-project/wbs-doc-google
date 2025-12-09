import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { AIService } from '../ai';
import { ModelResults, ComparisonResult } from '@wbs/domains';
import { getMongoClient, getDb } from '../utils/mongo';
import { sortTasksByWbsId } from '../utils/treeUtils';

interface WorkflowParams {
    fileKey: string;
    projectId: string; // The ID of the project in D1
    fileName: string;
    skipCache: boolean;
    models?: string[]; // Optional: List of models to run (for partial runs)
}

export class WbsWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
    async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
        const { fileKey, projectId, fileName, skipCache } = event.payload;
        const client = await getMongoClient(this.env);
        const db = getDb(client);
        const aiService = new AIService(this.env, skipCache);

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
                                file_key: fileKey,
                                file_extension: fileKey.split('.').pop()?.toLowerCase(),
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
            let comparison: ComparisonResult | undefined;

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

                    const file = await this.env.FILES_BUCKET.get(fileKey);
                    if (!file) {
                        throw new Error(`File not found: ${fileKey}`);
                    }
                    const arrayBuffer = await file.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);

                    const response = await this.env.WBS_MPP_SERVICE.processMpp(uint8Array);

                    if (!response) {
                        throw new Error(`MPP Service failed: ${response}`);
                    }

                    console.log(response);

                    return [];// [{ model: 'none', tasks: response }];
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
                    const modelsToRun = event.payload.models || ['gemini', 'openai', 'anthropic'];

                    const promises: Promise<any>[] = [];

                    if (modelsToRun.includes('gemini')) {
                        promises.push(aiService.gemini.generateContent([userMessage, markdownContent], systemMessage));
                    }
                    if (modelsToRun.includes('openai')) {
                        promises.push(aiService.openai.generateContent([userMessage, markdownContent], systemMessage));
                    }
                    if (modelsToRun.includes('anthropic')) {
                        promises.push(aiService.anthropic.generateContent([userMessage, markdownContent], systemMessage));
                    }

                    return await Promise.all(promises);
                });
            }


            // Step: Sort results by WBS ID to ensure correct order
            if (Array.isArray(results)) {
                results.forEach(r => {
                    if (r.tasks) {
                        r.tasks = sortTasksByWbsId(r.tasks);
                    }
                });
            }

            if (Array.isArray(results) && results.length > 1) {
                comparison = await step.do('compare-results', async () => {
                    return await aiService.gemini.compareResults(results as ModelResults[]);
                });
            }

            // Step 5: Persist Results (Merged)
            await step.do('persist-db', async () => {
                try {
                    // Fetch existing project to merge results
                    const existingProject = await db.collection('projects').findOne({ _id: projectId as any });

                    let finalResults = results as ModelResults[];

                    if (existingProject && existingProject['model_results']) {
                        const existingResults = existingProject['model_results'] as ModelResults[];
                        // Filter out results that are being replaced by the current run
                        const currentModelNames = (results as ModelResults[]).map(r => r.model);
                        const keptResults = existingResults.filter(r => !currentModelNames.includes(r.model));

                        finalResults = [...keptResults, ...(results as ModelResults[])];
                    }

                    // Re-run comparison on the consolidated results
                    if (finalResults.length > 1) {
                        comparison = await aiService.gemini.compareResults(finalResults);
                    } else {
                        // If only one model result exists, we can't really compare, or we just set it as single source
                        // For now, let's just clear comparison if < 2 models
                        comparison = undefined;
                    }

                    await db.collection('projects').updateOne(
                        { _id: projectId as any },
                        {
                            $set: {
                                model_results: finalResults,
                                comparison_result: comparison,
                                last_updated: new Date()
                            }
                        }
                    );
                } catch (e) {
                    console.error("Failed to persist results to DB.", e);
                    throw new Error(`DB Error (Persist Results): ${(e as Error).message}.`);
                }
            });

            return { success: true, results: results, comparison };

        } catch (error) {
            console.error('Workflow failed unrecoverably:', error);
            // Log to logging service if available
            throw new NonRetryableError(error instanceof Error ? error.message : String(error));
        }
    }
}
