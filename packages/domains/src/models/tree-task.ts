export interface AiTask {
    wbsId: string;
    name: string;
    description?: string;
    metadata?: { key: string, value: string | number }[];
}
export interface FlatTask {
    id?: string;
    name: string;
    outlineLevel: number;
    wbsId?: string;
    description?: string;
    metadata?: { key: string, value: string | number }[];
}
export interface TreeTask extends FlatTask {
    id: string;
    wbsId: string;
    parentId: string | null;
    children: TreeTask[];
    orderIndex: number;
}
