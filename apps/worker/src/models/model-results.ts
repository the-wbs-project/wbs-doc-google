import { AiTask } from "./ai-task";

export interface ModelResults {
    model: string;
    tasks: AiTask[];
}
