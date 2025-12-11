import { ComparisonResult, ModelResults, ProjectDocument, TreeTask } from '@wbs/domains';
import { Db, Filter, WithId } from 'mongodb';
import { getDb, getMongoClient } from '../utils/mongo';

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
