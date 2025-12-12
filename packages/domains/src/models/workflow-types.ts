import { ComparisonResult } from './task-comparison';
import { TreeTask } from './tree-task';

export interface WorkflowOutput {
    success: boolean;
    results?: any[];
    comparison?: ComparisonResult;
    tree?: TreeTask[];
}

export interface WorkflowStatusResponse {
    status: 'queued' | 'running' | 'complete' | 'failed' | 'success' | 'succeeded' | 'error' | 'errored' | 'unknown';
    output?: WorkflowOutput;
}
