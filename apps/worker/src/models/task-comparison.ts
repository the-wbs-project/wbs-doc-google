export type ComparisonStatus = 'pass' | 'needs_review';

export interface ComparedTask {
    wbsId: string;
    name: string;
    status: ComparisonStatus;
    sources: string[]; // List of models that included this task (e.g., ["Gemini", "OpenAI"])
    discrepancies?: string; // Explanation of why it needs review, if applicable
}

export interface ComparisonResult {
    tasks: ComparedTask[];
    summary: string; // Overall summary of the comparison
}
