import { ComparisonResult } from './task-comparison';
import { ModelResults } from './model-results';
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

/**
 * Database document shape (snake_case from MongoDB)
 * Note: Uses string _id instead of ObjectId
 */
export interface ProjectDocument {
    _id: string;
    name: string;
    file_key: string;
    markdown_content?: string;
    model_results?: ModelResults<TreeTask[]>[];
    comparison_result?: ComparisonResult;
    last_updated?: Date;
}

/**
 * Task document stored in tasks collection
 */
export interface TaskDocument {
    _id: string;
    project_id: string;
    name: string;
    indent_level: number;
    wbs_id: string;
    order_index: number;
    parent_id: string | null;
    metadata?: Record<string, string | number>;
}

/**
 * API response DTO for getProjectWithTree (camelCase for frontend)
 */
export interface ProjectDataResponse {
    tree: TreeTask[];
    modelResults?: ModelResults<TreeTask[]>[];
    comparison?: ComparisonResult;
}
