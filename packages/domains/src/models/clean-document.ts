import type { AnalyzeResultData, DocumentSpan } from "./analyze-result";

export interface CleanSelectionMark {
    state: unknown;
    polygon?: number[];
    span: DocumentSpan;
}

export interface CleanPage {
    pageNumber: number;
    spans: DocumentSpan[];
    selectionMarks?: CleanSelectionMark[];
    lines?: unknown[];
}

export interface CleanDocument extends Omit<AnalyzeResultData, "pages"> {
    pages: CleanPage[];
}