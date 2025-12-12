import { CleanDocument } from "./clean-document";
import { ModelResults } from "./model-results";
import { ComparisonResult } from "./task-comparison";
import { TreeTask } from "./tree-task";

/**
 * Database document shape (snake_case from MongoDB)
 * Note: Uses string _id instead of ObjectId
 */
export interface ProjectDocument {
    _id: string;
    name: string;
    file_key: string;
    markdown_content?: CleanDocument;
    model_results?: ModelResults<TreeTask[]>[];
    comparison_result?: ComparisonResult;
    last_updated?: Date;
    tree?: TreeTask[];
}