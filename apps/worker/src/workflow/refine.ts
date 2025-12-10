import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { AIService } from '../ai';
import { ProjectService } from '../services/project.service';
import { RefineWorkflowParams } from '../models/refine-workflow-params';

export class RefineWorkflow extends WorkflowEntrypoint<Env, RefineWorkflowParams> {
    async run(event: WorkflowEvent<RefineWorkflowParams>, step: WorkflowStep) {
        const { projectId, modelId, instructions } = event.payload;
        const projectService = new ProjectService(this.env);
        const aiService = new AIService(this.env);

        try {
            // Step 0: Create Project Record
            const project = await step.do('get-project', async () => projectService.getProject(projectId));

            if (!project) {
                throw new NonRetryableError('Project not found');
            }

            const modelResult = await step.do(`refine-tasks`, async () => {
                const result = project.model_results?.find(r => r.model === modelId);

                if (!result) {
                    throw new NonRetryableError('Model result not found');
                }

                return await aiService.aiCalls.refineTasks(result, instructions);
            });

            await step.do('save-model-results', async () => {
                if (!project.model_results) {
                    project.model_results = [modelResult];
                } else {
                    const index = project.model_results.findIndex(r => r.model === modelResult.model);
                    if (index >= 0) {
                        project.model_results[index] = modelResult;
                    } else {
                        project.model_results.push(modelResult);
                    }
                }

                await projectService.upsertProject(projectId, project);
            });

            project.comparison_result = await step.do('compare-results', async () => {
                const list = project.model_results ?? [];

                return await aiService.aiCalls.compareResults(list);
            });

            await step.do('save-comparison-result', async () => {
                await projectService.upsertProject(projectId, project);
            });

            return { success: true, results: project };
        } catch (error) {
            console.error('Workflow failed unrecoverably:', error);
            // Log to logging service if available
            throw new NonRetryableError(error instanceof Error ? error.message : String(error));
        }
    }
}
