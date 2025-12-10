import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { ProjectService } from '../services/project.service';

interface WorkflowParams {
    fileKey: string;
    projectId: string; // The ID of the project in D1
    fileName: string;
    skipCache: boolean;
}

export class MppWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
    async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
        const { fileKey, projectId, fileName } = event.payload;
        const projectService = new ProjectService(this.env);

        try {
            // Step 0: Create Project Record (Shared logic, good to have it here too to ensure consistency if called independently)
            await step.do('create-project', async () => {
                await projectService.upsertProject(projectId, {
                    name: fileName,
                    file_key: fileKey,
                    last_updated: new Date()
                });
            });

            // Step 1: Process MPP
            await step.do('process-mpp-tasks', async () => {
                // Fetch file from R2
                const file = await this.env.FILES_BUCKET.get(fileKey);
                if (!file) {
                    throw new Error(`File not found: ${fileKey}`);
                }
                const arrayBuffer = await file.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);

                // Call Cloudflare Service (MppService)
                const service = this.env.WBS_MPP_SERVICE as unknown as { processMpp: (uint8Array: Uint8Array) => Promise<{ success: boolean, error?: string, tasks: any[] }> };

                const mappResults = await service.processMpp(uint8Array);

                if (!mappResults.success || !Array.isArray(mappResults.tasks)) {
                    console.error(mappResults.error);
                    throw new Error(`MPP Service failed or returned invalid data`);
                }
                const mppTasks = mappResults.tasks;

                // Map to DB schema
                const tasksToSave = mppTasks.map((t: any, index: number) => {
                    const wbsId = t.levelText || '';
                    const indentLevel = wbsId ? wbsId.split('.').length : 1;

                    return {
                        _id: t.id ? String(t.id) : crypto.randomUUID(),
                        project_id: projectId,
                        name: t.title,
                        indent_level: indentLevel,
                        wbs_id: wbsId,
                        order_index: index,
                        metadata: JSON.stringify({ ...t.metadata, resources: t.resources })
                    };
                });

                // Clear existing tasks and insert new ones via service
                await projectService.replaceTasks(projectId, []); // tasksToSave);

                return { success: true, count: tasksToSave.length };
            });

            return { success: true, type: 'mpp' };

        } catch (error) {
            console.error('MPP Workflow failed unrecoverably:', error);
            throw new NonRetryableError(error instanceof Error ? error.message : String(error));
        }
    }
}
