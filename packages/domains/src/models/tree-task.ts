export interface FlatTask {
    id?: string;
    name: string;
    outlineLevel: number;
    wbsId?: string;
    metadata?: Record<string, string | number>;
}

export interface TreeTask extends FlatTask {
    id: string;
    wbsId: string;
    parentId: string | null;
    children: TreeTask[];
    orderIndex: number;
}
