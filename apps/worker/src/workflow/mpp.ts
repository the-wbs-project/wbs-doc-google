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

                console.log(mppTasks);

                //SAVE TAKS TO PROJECT.TREE

                return { success: true, tree: mppTasks };
            });

            return { success: true, type: 'mpp' };

        } catch (error) {
            console.error('MPP Workflow failed unrecoverably:', error);
            throw new NonRetryableError(error instanceof Error ? error.message : String(error));
        }
    }
}
