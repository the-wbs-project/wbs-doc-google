import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { fetchSystemPrompt } from '../utils/prompthub';
import { reconstructTree, flattenTreeForDb, FlatTask } from './treeUtils';

import { getMongoClient, getDb } from '../utils/mongo';
import { getRandom } from '@cloudflare/containers';
import { MppService, PdfService } from '../worker';

const INSTANCE_COUNT = 3;

interface Env {
    FILES_BUCKET: R2Bucket;
    MPP_SERVICE_DO: DurableObjectNamespace<MppService>;
    PDF_SERVICE_DO: DurableObjectNamespace<PdfService>;
    PROMPTHUB_PROJECT_ID: string;
    PROMPTHUB_API_KEY: string;
    MONGO_URI: string;
    AI_GATEWAY_URL: string;
    AI_GOOGLE_KEY: string;
}

interface WorkflowParams {
    fileKey: string;
    projectId: string; // The ID of the project in D1
}

export class WbsWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
    async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
        const { fileKey, projectId } = event.payload;

        try {
            // Step 1: Identify file type
            const fileExtension = fileKey.split('.').pop()?.toLowerCase();

            let flatTasks: FlatTask[] = [];

            if (fileExtension === 'mpp') {
                flatTasks = await step.do('parse-mpp', async () => {
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

                    return await response.json() as FlatTask[];
                });
            } else if (fileExtension === 'pdf') {
                // Step 1: Extract Text/Layout from PDF (Once)
                const pdfData = await step.do('extract-pdf-text', async () => {
                    const fileObj = await this.env.FILES_BUCKET.get(fileKey);
                    if (!fileObj) throw new Error(`File not found: ${fileKey}`);

                    const formData = new FormData();
                    formData.append('file', await fileObj.blob(), fileKey.split('/').pop() || 'file.pdf');

                    const containerInstance = await getRandom(this.env.PDF_SERVICE_DO, INSTANCE_COUNT);
                    // Wait for instance to be ready? getRandom returns a stub.

                    const response = await containerInstance.fetch('http://pdf-service:8000/analyze', {
                        method: 'POST',
                        body: formData,
                    });

                    console.log("PDF SERVICE RESPONSE: " + response.status);

                    if (!response.ok) {
                        const txt = await response.text();
                        throw new Error(`PDF Service failed: ${response.status} ${txt}`);
                    }

                    const responseData = await response.json() as { results: any[], images_map?: Record<string, string>, debug_logs: string[] };
                    if (responseData.debug_logs) {
                        console.log("--------------- PDF CONTAINER LOGS ---------------");
                        console.log(responseData.debug_logs.join('\n'));
                        console.log("--------------------------------------------------");
                    }
                    return {
                        results: responseData.results,
                        images_map: responseData.images_map || {}
                    };
                });

                // Group Layout Data by page
                const pagesMap = new Map<number, any[]>();
                // Also track which pages have images
                const imagesMap = pdfData.images_map;

                for (const item of pdfData.results) {
                    const p = item.page_number;
                    if (!pagesMap.has(p)) pagesMap.set(p, []);
                    pagesMap.get(p)?.push(item);
                }

                // Determine all unique page numbers from both text results and images
                const textPages = Array.from(pagesMap.keys());
                const imagePages = Object.keys(imagesMap).map(p => parseInt(p));
                const allPages = new Set([...textPages, ...imagePages]);

                const pageNumbers = Array.from(allPages).sort((a, b) => a - b);

                console.log("PAGE NUMBERS: " + pageNumbers);

                // Step 2: Analyze pages in batches to control concurrency
                const BATCH_SIZE = 3; // Low concurrency to prevent "stalled response"
                const allPageResults: any[] = [];

                // Generate batches
                const batches: number[][] = [];
                for (let i = 0; i < pageNumbers.length; i += BATCH_SIZE) {
                    batches.push(pageNumbers.slice(i, i + BATCH_SIZE));
                }

                // Fetch prompt once (or per step if needed, but once is cleaner if we assume stability)
                // Note: In Workflow replay, this might be re-fetched. That is acceptable.
                const prompt = await fetchSystemPrompt(this.env.PROMPTHUB_PROJECT_ID, this.env.PROMPTHUB_API_KEY);
                const systemMessage = prompt.find(m => m.role === 'system');
                const otherMessages = prompt.filter(m => m.role !== 'system');

                for (const [batchIdx, batch] of batches.entries()) {
                    const batchResults = await step.do(`analyze-batch-${batchIdx}`, async () => {
                        // Process batch in parallel
                        const batchPromises = batch.map(async (pageNum) => {
                            const layoutData = pagesMap.get(pageNum);
                            const pageImage = imagesMap[String(pageNum)];

                            // Construct Gemini Request
                            const contents: any[] = otherMessages.map(m => ({
                                role: m.role === 'assistant' ? 'model' : 'user',
                                parts: [{ text: m.content }]
                            }));

                            if (pageImage) {
                                // Multimodal Request (Image)
                                console.log(`Sending Page ${pageNum} as IMAGE to Gemini`);
                                contents.push({
                                    role: 'user',
                                    parts: [
                                        { text: `Here is the image of page ${pageNum} of the PDF. Please extract the WBS tasks from this image.` },
                                        {
                                            inlineData: {
                                                mimeType: "image/jpeg",
                                                data: pageImage
                                            }
                                        }
                                    ]
                                });
                            } else {
                                // Text-based Request
                                console.log(`Sending Page ${pageNum} as TEXT to Gemini`);
                                contents.push({
                                    role: 'user',
                                    parts: [{ text: `Here is the PDF layout data for this page (Page ${pageNum}): ${JSON.stringify(layoutData)}` }]
                                });
                            }

                            const gatewayUrl = this.env.AI_GATEWAY_URL;
                            const model = 'gemini-3-pro-preview';
                            const url = `${gatewayUrl}/v1beta/models/${model}:generateContent`;

                            const response = await fetch(url, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-goog-api-key': this.env.AI_GOOGLE_KEY
                                },
                                body: JSON.stringify({
                                    contents: contents,
                                    systemInstruction: systemMessage ? {
                                        parts: [{ text: systemMessage.content }]
                                    } : undefined,
                                    generationConfig: {
                                        temperature: 0.1,
                                        topP: 0.95,
                                        maxOutputTokens: 8192,
                                        responseMimeType: "application/json"
                                    }
                                })
                            });

                            console.log("GEMINI RESPONSE: " + response.status);

                            if (!response.ok) {
                                const errText = await response.text();
                                throw new Error(`Gemini API failed: ${response.status} ${errText}`);
                            }

                            const geminiData = await response.json() as any;

                            try {
                                const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
                                if (!rawText) throw new Error("No content in Gemini response");
                                const parsed = JSON.parse(rawText);
                                if (Array.isArray(parsed)) {
                                    return parsed;
                                } else if (parsed.tasks && Array.isArray(parsed.tasks)) {
                                    return parsed.tasks;
                                } else {
                                    console.error("Unexpected Gemini response structure:", parsed);
                                    // Try to see if it's wrapped in another key or just return as is if it's single object?
                                    // For now throw
                                    throw new Error("Gemini returned invalid structure: expected array or {tasks: []}");
                                }
                            } catch (e) {
                                console.error("Failed to parse Gemini JSON", e);
                                throw new Error("Invalid JSON returned by Gemini");
                            }
                        });

                        return await Promise.all(batchPromises);
                    });
                    allPageResults.push(...batchResults);
                }

                flatTasks = allPageResults.flat();
            }

            // Step 4: Reconstruct Tree
            const tree = reconstructTree(flatTasks);
            const dbRows = flattenTreeForDb(tree);

            // Step 5: Persist
            await step.do('persist-db', async () => {
                const client = await getMongoClient(this.env);
                const db = getDb(client);

                const docs = dbRows.map(row => ({
                    _id: row.id,
                    project_id: projectId,
                    name: row.name,
                    indent_level: row.indent_level, // Ensure casing matches what you want in Mongo
                    parent_id: row.parent_id,
                    order_index: row.order_index,
                    metadata: JSON.parse(row.metadata || '{}') // Store as real JSON in Mongo
                }));

                if (docs.length > 0) {
                    await db.collection('tasks').insertMany(docs);
                }
            });

            return { success: true, taskCount: dbRows.length };

        } catch (error) {
            console.error('Workflow failed unrecoverably:', error);
            // Log to logging service if available
            throw new NonRetryableError(error instanceof Error ? error.message : String(error));
        }
    }
}
