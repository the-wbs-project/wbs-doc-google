export interface BoundingRegion {
  pageNumber: number;
  polygon: number[];
}

export interface DocumentSpan {
  offset: number;
  length: number;
}

export interface DocumentStyle {
  isHandwritten?: boolean;
  similarFontFamily?: string;
  fontStyle?: string;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  spans: DocumentSpan[];
  confidence: number;
}

export interface DocumentLanguage {
  locale: string;
  spans: DocumentSpan[];
  confidence: number;
}

export interface DocumentWord {
  content: string;
  polygon?: number[];
  span: DocumentSpan;
  confidence: number;
}

export interface DocumentSelectionMark {
  state: "selected" | "unselected";
  polygon?: number[];
  span: DocumentSpan;
  confidence: number;
}

export interface DocumentLine {
  content: string;
  polygon?: number[];
  spans: DocumentSpan[];
}

export interface DocumentParagraph {
  spans: DocumentSpan[];
  boundingRegions?: BoundingRegion[];
  role?: string;
  content: string;
}

export interface DocumentTable {
  rowCount: number;
  columnCount: number;
  cells: DocumentTableCell[];
  boundingRegions?: BoundingRegion[];
  spans: DocumentSpan[];
  caption?: DocumentCaption;
}

export interface DocumentTableCell {
  rowIndex: number;
  columnIndex: number;
  rowSpan?: number;
  columnSpan?: number;
  content: string;
  boundingRegions?: BoundingRegion[];
  spans: DocumentSpan[];
  elements?: string[];
  kind?: "content" | "rowHeader" | "columnHeader" | "stubHead" | "description";
}

export interface DocumentCaption {
  content: string;
  boundingRegions?: BoundingRegion[];
  spans: DocumentSpan[];
  elements?: string[];
}

export interface DocumentFigure {
  boundingRegions?: BoundingRegion[];
  spans: DocumentSpan[];
  elements?: string[];
  caption?: DocumentCaption;
}

export interface DocumentListItem {
  level: number;
  content: string;
  boundingRegions?: BoundingRegion[];
  spans: DocumentSpan[];
  elements?: string[];
}

export interface DocumentSection {
  spans: DocumentSpan[];
  elements?: string[];
}

export interface DocumentPage {
  pageNumber: number;
  angle?: number;
  width?: number;
  height?: number;
  unit?: "pixel" | "inch" | "mm";
  spans: DocumentSpan[];
  words?: DocumentWord[];
  selectionMarks?: DocumentSelectionMark[];
  lines?: DocumentLine[];
  images?: DocumentImage[];
  formulas?: DocumentFormula[];
  barcodes?: DocumentBarcode[];
}

export interface DocumentImage {
  boundingRegions?: BoundingRegion[];
  spans: DocumentSpan[];
}

export interface DocumentFormula {
  kind: "inline" | "display";
  value: string;
  polygon?: number[];
  span: DocumentSpan;
  confidence: number;
}

export interface DocumentBarcode {
  kind: string;
  value: string;
  polygon?: number[];
  span: DocumentSpan;
  confidence: number;
}

export interface DocumentKeyValuePair {
  key: DocumentKeyValueElement;
  value?: DocumentKeyValueElement;
  confidence: number;
}

export interface DocumentKeyValueElement {
  content: string;
  boundingRegions?: BoundingRegion[];
  spans: DocumentSpan[];
}

export interface AnalyzeResultData {
  apiVersion: string;
  modelId: string;
  stringIndexType?: "textElements" | "unicodeCodePoint" | "utf16CodeUnit";
  content: string;
  pages: DocumentPage[];
  paragraphs?: DocumentParagraph[];
  tables?: DocumentTable[];
  figures?: DocumentFigure[];
  lists?: DocumentListItem[];
  sections?: DocumentSection[];
  keyValuePairs?: DocumentKeyValuePair[];
  styles?: DocumentStyle[];
  languages?: DocumentLanguage[];
  contentFormat?: "text" | "markdown";
}

export interface AnalyzeResultError {
  code: string;
  message: string;
  target?: string;
  details?: AnalyzeResultError[];
  innererror?: {
    code?: string;
    message?: string;
  };
}

export interface AnalyzeResult {
  status: "notStarted" | "running" | "succeeded" | "failed";
  createdDateTime: string;
  lastUpdatedDateTime: string;
  error?: AnalyzeResultError;
  analyzeResult?: AnalyzeResultData;
}