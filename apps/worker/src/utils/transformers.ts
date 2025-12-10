export function transformTasks(data: { tasks: any[] }): any[] {
    // Transform metadata array back to Record object (matching OpenAIService logic)
    const transformedTasks = data.tasks.map((task: any) => {
        const metadataRecord: Record<string, string | number> = {};
        if (Array.isArray(task.metadata)) {
            task.metadata.forEach((item: any) => {
                const num = Number(item.value);
                metadataRecord[item.key] = !isNaN(num) ? num : item.value;
            });
        }
        return {
            wbsId: task.wbsId,
            name: task.name,
            metadata: metadataRecord
        };
    });
    return transformedTasks;
}