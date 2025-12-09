import { Db, MongoClient } from 'mongodb';

export async function getMongoClient(env: any): Promise<MongoClient> {
    try {
        // Cloudflare Workers connect via TCP so standard driver works 
        // but connection pooling logic might be slightly different in serverless.
        // However, for standard driver in a worker, we just connect.
        // Note: It's good practice to set maxPoolSize to a small number for serverless.
        const client = new MongoClient(env.MONGO_URI);

        await client.connect();

        return client;
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        throw err;
    }
}

export function getDb(client: MongoClient, dbName: string = 'wbs-ingestion'): Db {
    return client.db(dbName);
}

export function saveTasksToDb(ctx: ExecutionContext, db: Db, projectId: string, dbRows: any[]) {
    const docs = dbRows.map(row => ({
        _id: row.id,
        project_id: projectId,
        name: row.name,
        indent_level: row.indent_level, // Ensure casing matches what you want in Mongo
        parent_id: row.parent_id,
        order_index: row.order_index,
        wbs_id: row.wbs_id,
        metadata: JSON.parse(row.metadata || '{}') // Store as real JSON in Mongo
    }));

    if (docs.length > 0) {
        const BATCH_SIZE = 25;
        const batches = [];

        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            batches.push(docs.slice(i, i + BATCH_SIZE));
        }

        // Process batches sequentially to avoid overwhelming the connection/timeout

        for (const batch of batches) {
            const operations = batch.map(doc => ({
                replaceOne: {
                    filter: { _id: doc._id },
                    replacement: doc,
                    upsert: true
                }
            }));
            ctx.waitUntil(db.collection('tasks').bulkWrite(operations));
        }
    }
}
