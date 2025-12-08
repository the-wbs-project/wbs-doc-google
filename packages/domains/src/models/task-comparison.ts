export interface ComparisonResult {
    tasks: ComparedTask[];
    summary: string;
}

export interface ComparedTask {
    wbsId: string;
    name: string;
    status: 'pass' | 'needs_review';
    sources: string[];
    discrepancies?: string;
}
