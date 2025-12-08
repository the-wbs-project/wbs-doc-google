export interface TreeTask {
    wbsId: string;
    name: string;
    metadata: Record<string, string | number>;
    children?: TreeTask[];
}
