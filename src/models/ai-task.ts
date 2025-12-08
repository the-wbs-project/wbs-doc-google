export interface AiTask {
    wbsId: string; // "1.1", "1.2.1" etc from parsing
    name: string;
    metadata: Record<string, string | number | Date>;
}
