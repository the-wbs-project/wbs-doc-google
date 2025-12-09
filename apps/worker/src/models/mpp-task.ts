export interface MppTask {
    id: string;
    levelText: string;
    title: string;
    resources: string[];
    metadata: Record<string, unknown>;
}
