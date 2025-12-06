import { MongoClient, MongoClientOptions } from 'mongodb';

let client: MongoClient | null = null;

export async function getMongoClient(env: any): Promise<MongoClient> {
    if (client) {
        return client;
    }

    const uri = env.MONGO_URI;
    if (!uri) {
        throw new Error('MONGO_URI is not defined in environment variables');
    }

    try {
        // Cloudflare Workers connect via TCP so standard driver works 
        // but connection pooling logic might be slightly different in serverless.
        // However, for standard driver in a worker, we just connect.
        // Note: It's good practice to set maxPoolSize to a small number for serverless.
        client = new MongoClient(uri, {
            maxPoolSize: 1
        } as MongoClientOptions);

        await client.connect();
        return client;
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        throw err;
    }
}

export function getDb(client: MongoClient, dbName: string = 'wbs-ingestion') {
    return client.db(dbName);
}
