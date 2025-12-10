import { Db, WithId, Filter } from 'mongodb';
import { getMongoClient, getDb } from '../utils/mongo';
import { reconstructTree } from '../utils/treeUtils';
import { ModelResults, ComparisonResult, ProjectDocument, ProjectDataResponse, TreeTask, TaskDocument } from '@wbs/domains';

export class ProjectService {
    private db: Db | undefined;

    constructor(private env: Env) { }

    private async getProjectDb(): Promise<Db> {
        if (!this.db) {
            const client = await getMongoClient(this.env);
            this.db = getDb(client);
        }
        return this.db;
    }

    async upsertProject(id: string, data: Partial<Omit<ProjectDocument, '_id'>>): Promise<void> {
        const db = await this.getProjectDb();
        await db.collection<ProjectDocument>('projects').updateOne(
            { _id: id } as Filter<ProjectDocument>,
            { $set: data },
            { upsert: true }
        );
    }

    async getProject(id: string): Promise<WithId<ProjectDocument> | null> {
        const db = await this.getProjectDb();
        return db.collection<ProjectDocument>('projects').findOne({ _id: id } as Filter<ProjectDocument>);
    }

    async getTasks(projectId: string): Promise<WithId<TaskDocument>[]> {
        const db = await this.getProjectDb();
        return db.collection<TaskDocument>('tasks').find({ project_id: projectId }).sort({ order_index: 1 }).toArray();
    }

    async getProjectWithTree(projectId: string): Promise<ProjectDataResponse> {
        const project = await this.getProject(projectId);
        let tree: TreeTask[] = [];
        const tasks = await this.getTasks(projectId);

        if (tasks && tasks.length > 0) {
            const flatTasks = tasks.map((t) => ({
                id: t._id,
                name: t.name,
                outlineLevel: t.indent_level,
                wbsId: t.wbs_id,
                orderIndex: t.order_index,
                metadata: t.metadata ?? {}
            }));
            tree = reconstructTree(flatTasks);
        }

        const response: ProjectDataResponse = { tree };

        if (project?.model_results) {
            response.modelResults = project.model_results;
        }
        if (project?.comparison_result) {
            response.comparison = project.comparison_result;
        }

        return response;
    }

    async replaceTasks(projectId: string, tasks: Omit<TaskDocument, 'project_id'>[]) {
        const db = await this.getProjectDb();
        await db.collection<TaskDocument>('tasks').deleteMany({ project_id: projectId });
        if (tasks.length > 0) {
            const tasksWithProject = tasks.map(t => ({ ...t, project_id: projectId }));
            await db.collection<TaskDocument>('tasks').insertMany(tasksWithProject);
        }
        return tasks.length;
    }

    async upsertModelResult(projectId: string, result: ModelResults<TreeTask[]>) {
        const db = await this.getProjectDb();
        const project = await this.getProject(projectId);

        if (!project) return;

        const modelResults = project.model_results ?? [];
        const existingIndex = modelResults.findIndex(r => r.model === result.model);

        if (existingIndex >= 0) {
            modelResults[existingIndex] = result;
        } else {
            modelResults.push(result);
        }

        return db.collection<ProjectDocument>('projects').updateOne(
            { _id: projectId } as Filter<ProjectDocument>,
            { $set: { model_results: modelResults, last_updated: new Date() } }
        );
    }

    async updateModelResults(projectId: string, results: ModelResults<TreeTask[]>[]) {
        const db = await this.getProjectDb();
        return db.collection<ProjectDocument>('projects').updateOne(
            { _id: projectId } as Filter<ProjectDocument>,
            {
                $set: {
                    model_results: results,
                    last_updated: new Date()
                }
            }
        );
    }

    async updateComparison(projectId: string, comparison?: ComparisonResult) {
        const db = await this.getProjectDb();
        return db.collection<ProjectDocument>('projects').updateOne(
            { _id: projectId } as Filter<ProjectDocument>,
            {
                $set: {
                    comparison_result: comparison,
                    last_updated: new Date()
                }
            }
        );
    }

    async deleteModelResult(projectId: string, modelId: string) {
        const project = await this.getProject(projectId);
        if (!project?.model_results) throw new Error('Project or model results not found');

        const filteredResults = project.model_results.filter(r => r.model !== modelId);
        await this.updateModelResults(projectId, filteredResults);

        return { success: true };
    }
}
