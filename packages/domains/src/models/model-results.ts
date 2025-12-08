import { TreeTask } from './tree-task';

export interface ModelResults {
    model: string;
    tasks: TreeTask[];
    error?: string;
}
