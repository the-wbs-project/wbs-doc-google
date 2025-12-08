import { generateId } from "../utils/generate-id";

export interface FlatTask {
    id?: string;
    name: string;
    outlineLevel: number; // 1-based
    metadata?: any;
}

export interface TreeTask extends FlatTask {
    id: string; // Internal UUID
    wbsId: string; // "1.1", "1.2.1" etc from parsing
    parentId: string | null; // Internal UUID of parent
    children: TreeTask[];
    orderIndex: number;
}

export function reconstructTree(flatTasks: FlatTask[]): TreeTask[] {
    const rootTasks: TreeTask[] = [];
    // Map wbsId -> TreeTask to find parents
    const taskMap = new Map<string, TreeTask>();

    // 1. Create TreeTask instances and map them
    // We accumulate everything in a temporary list or just iterate the map?
    // Iterating flatTasks again is safer to preserve order if we just push to roots/children.

    // Let's rewrite step 1 to be robust.
    const allTreeTasks: TreeTask[] = [];

    for (let i = 0; i < flatTasks.length; i++) {
        const task = flatTasks[i];
        const wbsId = task.id || "";
        const internalId = generateId();

        const treeTask: TreeTask = {
            ...task,
            id: internalId,
            wbsId: wbsId,
            parentId: null,
            children: [],
            orderIndex: i
        };

        allTreeTasks.push(treeTask);
        if (wbsId) {
            taskMap.set(wbsId, treeTask);
        }
    }

    // 2. Build the tree
    for (const task of allTreeTasks) {
        const wbsId = task.wbsId;

        if (!wbsId) {
            // No WBS ID -> Root
            rootTasks.push(task);
            continue;
        }

        // Determine parent WBS ID: "1.2.3" -> "1.2"
        const lastDotIndex = wbsId.lastIndexOf('.');
        let parentWbsId = null;

        if (lastDotIndex !== -1) {
            parentWbsId = wbsId.substring(0, lastDotIndex);
        } else {
            // "1" -> parent null
            parentWbsId = null;
        }

        if (parentWbsId && taskMap.has(parentWbsId)) {
            const parent = taskMap.get(parentWbsId)!;
            task.parentId = parent.id; // Link using INTERNAL ID
            parent.children.push(task);
        } else {
            // Root
            rootTasks.push(task);
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
                wbs_id: task.wbsId, // Persist the WBS ID too
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
