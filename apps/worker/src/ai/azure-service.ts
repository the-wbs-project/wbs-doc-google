
import { NonRetryableError } from "cloudflare:workflows";

export class AzureService {
    private readonly env: Env;

    constructor(env: Env) {
        this.env = env;
    }

    async extractMarkdown(fileKey: string, fileName?: string): Promise<unknown> {
        // Use fileName for caching if available (stable across runs), otherwise fallback to fileKey
        const cacheIdentifier = fileName || fileKey;
        const cacheKey = `azure-pdf-md:${cacheIdentifier}`;

        // Step 0: Check KV Cache
        const cached = await this.env.KV_DATA.get(cacheKey);
        if (cached) {
            console.log("Returning cached Azure PDF result for " + fileKey);
            return cached;
        }

        // Step 1: Get file from R2
        const fileObj = await this.env.FILES_BUCKET.get(fileKey);
        if (!fileObj) {
            console.error(`File not found in R2: ${fileKey}`);
            throw new NonRetryableError(`File not found: ${fileKey}`);
        }

        // Step 2: Prepare FormData
        const formData = new FormData();
        formData.append('file', await fileObj.blob(), fileKey.split('/').pop() || 'file.pdf');

        const azureServiceUrl = 'https://markdown-micro.thewbsproject.workers.dev/api/process';

        // Step 3: Call Azure Service
        try {
            const response = await fetch(azureServiceUrl, {
                method: 'POST',
                body: formData,
            });

            console.log("AZURE PDF SERVICE RESPONSE: " + response.status);

            if (!response.ok) {
                const txt = await response.text();
                throw new Error(`Azure PDF Service failed: ${response.status} ${txt}`);
            }

            // The service returns the markdown content directly
            const markdown: { content?: string } = await response.json();

            delete markdown.content;

            // Step 4: Cache result (TTL 7 days = 604800 seconds)
            await this.env.KV_DATA.put(cacheKey, JSON.stringify(markdown), { expirationTtl: 604800 });

            return markdown;

        } catch (e: any) {
            console.error("Azure Service Fetch Error", e);
            throw e;
        }
    }
}
