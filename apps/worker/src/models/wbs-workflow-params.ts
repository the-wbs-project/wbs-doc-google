export interface WbsWorkflowParams {
    fileKey?: string;
    projectId: string; // The ID of the project in D1
    fileName: string;
    models?: string[]; // Optional: List of models to run (for partial runs)
}