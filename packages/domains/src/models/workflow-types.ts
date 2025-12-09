import { ComparisonResult } from './task-comparison';

export interface WorkflowOutput {
    success: boolean;
    results?: any[];
    comparison?: ComparisonResult;
    tree?: any[];
}

export interface WorkflowStatusResponse {
    status: 'queued' | 'running' | 'complete' | 'failed' | 'success' | 'succeeded' | 'error' | 'errored' | 'unknown';
    output?: WorkflowOutput;
}

export interface ProjectData {
    _id: string;
    name: string;
    tree?: any[];
    comparison?: ComparisonResult;
    modelResults?: any[]; // ModelResults[]
}
