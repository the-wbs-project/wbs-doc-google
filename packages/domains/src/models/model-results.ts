export interface ModelResults<T> {
    model: string;
    results: T;
    error?: string;
}
