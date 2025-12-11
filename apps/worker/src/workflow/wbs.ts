import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { AIService } from '../ai';
import { WbsWorkflowParams } from '../models/wbs-workflow-params';
import { ProjectService } from '../services/project.service';
import { sortTasksByWbsId } from '../utils/treeUtils';

export class WbsWorkflow extends WorkflowEntrypoint<Env, WbsWorkflowParams> {
    async run(event: WorkflowEvent<WbsWorkflowParams>, step: WorkflowStep) {
        const { fileKey, projectId, fileName } = event.payload;
        const projectService = new ProjectService(this.env);
        const aiService = new AIService(this.env);

        try {
            // Step 0: Create Project Record
            let project = await step.do('create-project', async () => {
                const project = await projectService.getProject(projectId);
                if (project) return project;

                await projectService.upsertProject(projectId, {
                    name: fileName,
                    file_key: fileKey,
                    last_updated: new Date()
                });

                return await projectService.getProject(projectId);
            });

            if (!project) {
                throw new NonRetryableError('Project not found');
            }

            //
            //  If we don't have the markdown content, we need to extract it
            //
            if (!project.markdown_content && fileKey) {
                // Step 1: Extract Markdown from PDF via Azure Document Intelligence
                project.markdown_content = await step.do('extract-pdf-azure', async () => {
                    return await aiService.azure.extractMarkdown(fileKey, fileName);
                });

                await step.do('save-markdown-content', async () => {
                    await projectService.upsertProject(projectId, project);
                });
            }

            // Step 2: Analyze full document with Gemini
            const modelsToRun = event.payload.models ?? this.env.AI_MODELS.split(',');

            const modelResults = await step.do(`analyze-document`, async () => {
                if (!project.markdown_content) {
                    throw new NonRetryableError('Markdown content not found after extraction');
                }

                const allResults = await aiService.aiCalls.analyzeDocument(modelsToRun, project.markdown_content);

                for (const result of allResults) {
                    if (result.results) {
                        result.results = sortTasksByWbsId(result.results);
                    }
                }

                return allResults;
            });

            await step.do('save-model-results', async () => {
                if (!project.model_results) {
                    project.model_results = modelResults;
                } else {
                    for (const result of modelResults) {
                        const index = project.model_results.findIndex(r => r.model === result.model);
                        if (index >= 0) {
                            project.model_results[index] = result;
                        } else {
                            project.model_results.push(result);
                        }
                    }
                }

                await projectService.upsertProject(projectId, project);
            });

            project.comparison_result = await step.do('compare-results', async () => {
                return await aiService.aiCalls.compareResults(modelResults);
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
