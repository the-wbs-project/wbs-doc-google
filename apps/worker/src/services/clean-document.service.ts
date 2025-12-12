import type { CleanDocument, AnalyzeResultData } from "@wbs/domains";

export function toCleanDocument(document: AnalyzeResultData): CleanDocument {
    return {
        ...document,
        pages: document.pages.map(p => ({
            pageNumber: p.pageNumber,
            spans: p.spans,
            lines: p.lines,
            selectionMarks: p.selectionMarks?.map(sm => ({
                state: sm.state,
                polygon: sm.polygon,
                span: sm.span
            })),
        }))
    }
}