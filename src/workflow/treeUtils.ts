export interface FlatTask {
    id?: string;
    name: string;
    outlineLevel: number; // 1-based
    start?: string;
    finish?: string;
    metadata?: any;
}

export interface TreeTask extends FlatTask {
    id: string;
    parentId: string | null;
    children: TreeTask[];
    orderIndex: number;
}

export function reconstructTree(flatTasks: FlatTask[]): TreeTask[] {
    const rootTasks: TreeTask[] = [];
    const stack: TreeTask[] = []; // Stack to keep track of parents. stack[0] is level 1, stack[1] is level 2...

    for (let i = 0; i < flatTasks.length; i++) {
        const task = flatTasks[i];
        const treeTask: TreeTask = {
            ...task,
            id: task.id || crypto.randomUUID(),
            parentId: null,
            children: [],
            orderIndex: i
        };

        // Level 1 is root
        if (task.outlineLevel === 1) {
            rootTasks.push(treeTask);
            stack.length = 0; // Clear stack
            stack.push(treeTask);
        } else {
            // Find parent
            // If current level is N, parent is at stack[N-2] (since stack is 0-indexed and levels are 1-indexed)
            // Example: Level 2 task. Parent should be Level 1 (stack[0]).
            // We need to pop from stack until we find the parent (level < current level)

            while (stack.length > 0 && stack[stack.length - 1].outlineLevel >= task.outlineLevel) {
                stack.pop();
            }

            if (stack.length > 0) {
                const parent = stack[stack.length - 1];
                treeTask.parentId = parent.id;
                parent.children.push(treeTask);
            } else {
                // Fallback: if indentation is messed up, treat as root or attach to last root
                // For now, treat as root
                rootTasks.push(treeTask);
            }

            stack.push(treeTask);
        }
    }

    return rootTasks;
}

export function flattenTreeForDb(treeTasks: TreeTask[]): any[] {
    const result: any[] = [];

    function traverse(tasks: TreeTask[]) {
        for (const task of tasks) {
            result.push({
                id: task.id,
                name: task.name,
                indent_level: task.outlineLevel,
                parent_id: task.parentId,
                order_index: task.orderIndex,
                metadata: JSON.stringify(task.metadata || {})
            });
            if (task.children.length > 0) {
                traverse(task.children);
            }
        }
    }

    traverse(treeTasks);
    return result;
}
