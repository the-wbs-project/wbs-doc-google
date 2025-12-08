import { AiTask } from "./ai-task";

export interface TreeTask extends AiTask {
    parentId?: string;
    siblingIndex: number;
}