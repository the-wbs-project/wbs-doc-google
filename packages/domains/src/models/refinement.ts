import { TreeTask } from './tree-task';

export interface RefinementRequest {
    tasks: TreeTask[];
    instruction: string;
}

export interface RefinementResponse {
    tasks: TreeTask[];
    changes?: string; // Optional explanation of changes
}
