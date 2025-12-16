
import { Component, ChangeDetectionStrategy, input, output, signal, inject, ViewChild, effect, computed, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule, DialogUtility } from '@syncfusion/ej2-angular-popups';
import { TreeGridModule, EditService, ToolbarService, TreeGridComponent, RowDDService } from '@syncfusion/ej2-angular-treegrid';
import { ApiService } from '../../services/api';

@Component({
    selector: 'app-task-tree-grid',
    imports: [TreeGridModule, DialogModule, FormsModule],
    providers: [EditService, ToolbarService, RowDDService],
    templateUrl: './task-tree-grid.html',
    styleUrls: ['./task-tree-grid.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskTreeGridComponent { // trigger build
    tasks = input<any[]>([]);
    tasksChange = output<any[]>();
    save = output<any[]>();
    hasUnsavedChanges = model.required<boolean>();

    dynamicColumns = signal<string[]>([]);

    @ViewChild('treegrid') treegrid: TreeGridComponent | undefined;

    private apiService = inject(ApiService);

    public editSettings: Object = { allowEditing: true, allowAdding: true, allowDeleting: true, mode: 'Row' };
    public toolbar: string[] = ['Add', 'Edit', 'Delete', 'Update', 'Cancel', 'ExpandAll', 'CollapseAll'];

    public showRefineDialog = signal(false);
    public refineInstructions = signal('');
    public isRefining = signal(false);

    gridDataSource = computed(() => {
        const tasks = this.tasks();
        return this.transformTasksForGrid(tasks);
    });

    constructor() {
        effect(() => {
            const tasks = this.tasks();
            this.updateDynamicColumns(tasks);
        });
    }

    private transformTasksForGrid(tasks: any[]): any[] {
        return tasks.map(task => {
            const newTask = { ...task };
            if (newTask.children) {
                newTask.children = this.transformTasksForGrid(newTask.children);
            }
            if (Array.isArray(newTask.metadata)) {
                const metaObj: any = {};
                newTask.metadata.forEach((m: any) => {
                    metaObj[m.key] = m.value;
                });
                newTask.metadata = metaObj;
            }
            return newTask;
        });
    }

    private updateDynamicColumns(tasks: any[]) {
        const keyCounts = new Map<string, number>();

        const traverse = (nodes: any[]) => {
            for (const node of nodes) {
                if (node.metadata) {
                    if (Array.isArray(node.metadata)) {
                        node.metadata.forEach((m: any) => {
                            keyCounts.set(m.key, (keyCounts.get(m.key) || 0) + 1);
                        });
                    } else if (typeof node.metadata === 'object') {
                        Object.keys(node.metadata).forEach(key => {
                            keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
                        });
                    }
                }
                if (node.children) {
                    traverse(node.children);
                }
            }
        };

        if (tasks) traverse(tasks);

        // Sort by frequency and take top 3
        const sortedKeys = Array.from(keyCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(entry => entry[0])
            .slice(0, 3);

        this.dynamicColumns.set(sortedKeys);
    }

    openRefineDialog() {
        this.showRefineDialog.set(true);
        this.refineInstructions.set('');
    }

    closeRefineDialog() {
        this.showRefineDialog.set(false);
    }

    public history = signal<any[][]>([]);

    async submitRefinement() {
        const instructions = this.refineInstructions();

        if (!instructions) return;

        this.isRefining.set(true);

        try {
            const currentTasks = this.tasks(); // this.getTasksFromGrid();

            // Save state to history before refining
            this.history.update(h => [...h, JSON.parse(JSON.stringify(currentTasks))]);

            // Transformations might be needed here too if we send to API, 
            // but for now let's assume we just want to emit/handle locally or the API handles it.
            // Actually, if we are refining, we might want to send the transformed (Array-based) tasks.

            const modelId = 'gpt-5.2';
            this.apiService.refine(modelId, instructions, currentTasks).subscribe({
                next: (response) => {
                    // Rebuild hierarchy from WBS IDs because AI often returns flat lists without parentIds
                    // or with detached parentIds but valid WBS structure.
                    //const treeStructure = this.rebuildHierarchyFromWbs(response);
                    //const finalTasks = this.flattenTree(treeStructure);

                    // Update external state
                    this.tasksChange.emit(response);

                    // Since we are OnPush and tasks is an input, the parent should update the input which will update the grid.
                    // However, Syncfusion might need explicit refresh if the reference changes?
                    // The standard input binding [dataSource]="tasks" should handle it when parent updates binding.

                    this.closeRefineDialog();
                    this.isRefining.set(false);
                },
                error: (err) => {
                    console.error("Refinement failed", err);
                    this.isRefining.set(false);
                    alert("Refinement failed: " + err.message);
                }
            });

        } catch (e) {
            console.error(e);
            this.isRefining.set(false);
        }
    }

    private rebuildHierarchyFromWbs(tasks: any[]): any[] {
        // deep clone to avoid mutating original array if needed, though here we probably want to mutate structure
        const clns = tasks.map(t => ({ ...t, children: [] }));

        // Sort by WBS ID length and then numeric value to ensure parents process before children? 
        // Actually just a simple string sort usually works for 1, 1.1, 1.1.1, 
        // but 1.10 comes after 1.1 which is correct.
        // Let's sort to be safe that we process top-down or create map first.

        const map = new Map<string, any>();
        clns.forEach(t => {
            if (t.wbsId) map.set(t.wbsId, t);
        });

        const roots: any[] = [];

        clns.forEach(task => {
            if (!task.wbsId) {
                roots.push(task);
                return;
            }

            const wbsParts = task.wbsId.split('.');
            if (wbsParts.length === 1) {
                // It's a root (e.g. "1", "2")
                roots.push(task);
            } else {
                // Find parent (e.g. "1.1.1" -> "1.1")
                const parentWbs = wbsParts.slice(0, -1).join('.');
                const parent = map.get(parentWbs);

                if (parent) {
                    parent.children.push(task);
                    task.parentId = parent.id; // Ensure parentId is linked for consistency
                } else {
                    // Orphan with WBS? Treat as root or it's missing context.
                    roots.push(task);
                }
            }
        });

        // Optional: Sort children by WBS inside each parent?
        // The loop order depends on `clns` order.
        return roots;
    }

    undo() {
        const history = this.history();
        if (history.length === 0) return;

        const previousState = history[history.length - 1];

        // Remove the state we just restored
        this.history.update(h => h.slice(0, -1));

        // Restore state
        this.tasksChange.emit(previousState);
        this.hasUnsavedChanges.set(true);
    }

    saveChanges() {
        if (this.treegrid) {
            this.treegrid.endEdit();
        }

        const currentTasks = this.tasks(); // this.getTasksFromGrid();
        this.save.emit(currentTasks);
        this.hasUnsavedChanges.set(false);
    }

    private transformTasksFromGrid(tasks: any[]): any[] {
        return tasks.map(task => {
            const newTask = { ...task };

            // Allow children recursion
            if (newTask.children) {
                newTask.children = this.transformTasksFromGrid(newTask.children);
            }

            if (newTask.metadata && !Array.isArray(newTask.metadata) && typeof newTask.metadata === 'object') {
                const metaArray: { key: string, value: any }[] = [];
                Object.keys(newTask.metadata).forEach(key => {
                    if (newTask.metadata[key] !== undefined && newTask.metadata[key] !== null) {
                        metaArray.push({ key: key, value: newTask.metadata[key] });
                    }
                });
                newTask.metadata = metaArray;
            }
            return newTask;
        });
    }

    public showDeleteDialog = signal(false);
    public taskToDelete = signal<any>(null);

    actionComplete(args: any) {
        if (args.requestType === 'save' || args.requestType === 'delete') {
            // Note: delete is handled by custom logic, but if we used standard delete, we'd trap it here.
            // For 'save' (row edit save), we mark as unsaved global changes
            this.hasUnsavedChanges.set(true);
        }
    }

    async onActionBegin(args: any) {
        if (args.requestType === 'add') {
            args.cancel = true; // Cancel default add

            // Generate a temporary ID (Syncfusion needs a unique ID)
            const newId = crypto.randomUUID();
            const newTask = {
                id: newId,
                name: 'New Task',
                metadata: [],
                children: []
            };

            const selectedRecord = this.treegrid?.getSelectedRecords()[0];

            let currentTasks = this.tasks(); // this.getTasksFromGrid();
            const isFlatStructure = this.isFlat(currentTasks);
            if (isFlatStructure) {
                currentTasks = this.buildTree(currentTasks);
            }

            if (!selectedRecord) {
                // No selection: Append to root
                currentTasks.push(newTask);
            } else {
                // Selection exists: Add as SIBLING (immediately after)
                const result = this.findTaskAndParent(currentTasks, (selectedRecord as any).id);
                if (result) {
                    const { list } = result;
                    const index = list.findIndex(t => t.id === (selectedRecord as any).id);
                    if (index !== -1) {
                        list.splice(index + 1, 0, newTask);
                        // Inherit parentId if explicit (for flat structure consistency)
                        if (isFlatStructure) {
                            (newTask as any).parentId = (selectedRecord as any).parentId;
                        }
                    } else {
                        // Should not happen if findTaskAndParent returned true, but safe fallback
                        currentTasks.push(newTask);
                    }
                } else {
                    // Fallback
                    currentTasks.push(newTask);
                }
            }

            // Renumber WBS
            this.renumberWbs(currentTasks);

            // Convert back if needed
            const finalTasks = this.flattenTree(currentTasks);

            // Update Grid
            this.tasksChange.emit(finalTasks);
            this.hasUnsavedChanges.set(true);
            return;
        }

        if (args.requestType === 'delete') {
            args.cancel = true; // Cancel default delete
            const data = args.data[0];

            if (!data) return;

            // Check if task has children
            const hasChildren = data.hasChildRecords || (data.children && data.children.length > 0);

            if (!hasChildren) {
                if (await this.confirmDelete('Are you sure you want to delete this task?')) {
                    this.executeDelete(data, false);
                }
                return;
            }

            // Show custom dialog for children decision
            this.taskToDelete.set(data);
            this.showDeleteDialog.set(true);
        }
    }

    rowDrop(args: any) {
        // Let Syncfusion handle the move internally first
        setTimeout(() => {
            // Get updated flat list from grid
            let currentTasks = this.tasks(); // this.getTasksFromGrid();

            // Check if flat (likely yes if using parentIdMapping)
            const isFlatStructure = this.isFlat(currentTasks);
            if (isFlatStructure) {
                currentTasks = this.buildTree(currentTasks);
            }

            // Renumber WBS IDs based on new structure
            this.renumberWbs(currentTasks);

            // Convert back to flat
            const finalTasks = this.flattenTree(currentTasks);

            // Update Input Signal (to keep consistency) and emit
            this.tasksChange.emit(finalTasks);
            this.hasUnsavedChanges.set(true);
        }, 50);
    }

    deleteTaskWithChildren() {
        const task = this.taskToDelete();
        if (task) {
            this.executeDelete(task, false);
        }
        this.closeDeleteDialog();
    }

    deleteTaskKeepChildren() {
        const task = this.taskToDelete();
        if (task) {
            this.executeDelete(task, true);
        }
        this.closeDeleteDialog();
    }

    closeDeleteDialog() {
        this.showDeleteDialog.set(false);
        this.taskToDelete.set(null);
    }

    private async confirmDelete(message: string): Promise<boolean> {
        return new Promise((resolve) => {
            const dialog = DialogUtility.confirm({
                title: 'Delete Task',
                content: message,
                okButton: { text: 'Delete', click: () => { dialog.hide(); resolve(true); } },
                cancelButton: { text: 'Cancel', click: () => { dialog.hide(); resolve(false); } },
                showCloseIcon: true,
                closeOnEscape: true,
                animationSettings: { effect: 'Zoom' }
            });
        });
    }

    private executeDelete(taskToDelete: any, keepChildren: boolean) {
        let currentTasks = this.tasks(); //this.getTasksFromGrid();
        let isFlatStructure = this.isFlat(currentTasks);

        // Ensure we are working with a tree for manipulation
        if (isFlatStructure) {
            currentTasks = this.buildTree(currentTasks);
        }

        if (keepChildren) {
            // Find path to parent
            const result = this.findTaskAndParent(currentTasks, taskToDelete.id);
            if (!result) return;

            const { parent, list } = result;
            const taskIndex = list.findIndex(t => t.id === taskToDelete.id);
            if (taskIndex === -1) return;

            // Get children to promote
            // Use the children from the TREE structure we just built/verified
            const childrenToPromote = result.task.children || [];

            // Remove the task
            list.splice(taskIndex, 1);

            // Insert children at the same location
            if (childrenToPromote.length > 0) {
                list.splice(taskIndex, 0, ...childrenToPromote);
            }

        } else {
            // Standard Recursive Delete
            currentTasks = this.removeTaskRecursively(currentTasks, taskToDelete.id);
        }

        // Renumber WBS and fix parentIds
        this.renumberWbs(currentTasks);

        // Convert back to flat structure if that's what we started with (or what the grid expects)
        // The grid uses parentIdMapping, so it expects a flat list.
        const finalTasks = this.flattenTree(currentTasks);

        // Update Grid
        this.tasksChange.emit(finalTasks);
        this.hasUnsavedChanges.set(true);
        // this.save.emit(finalTasks); // Removed to prevent autosave. User must click Save button.
    }

    private isFlat(tasks: any[]): boolean {
        if (tasks.length === 0) return false;
        // If items have children array populated with items, it is a tree.
        const hasChildren = tasks.some(t => t.children && t.children.length > 0);
        // If items share parentIds that are not null, it might be flat
        const hasParentIds = tasks.some(t => t.parentId);

        // Default to true if parentIds are present and no children are active
        return !hasChildren && hasParentIds;
    }

    private buildTree(flatTasks: any[]): any[] {
        const roots: any[] = [];
        const map = new Map<string, any>();

        // Clone and map
        flatTasks.forEach(t => {
            // Clone task but ensure children array exists and is empty for reconstruction
            // We want to preserve other properties
            const task = { ...t, children: [] };
            map.set(task.id, task);
        });

        flatTasks.forEach(t => {
            const task = map.get(t.id);
            if (task.parentId && map.has(task.parentId)) {
                map.get(task.parentId).children.push(task);
            } else {
                roots.push(task);
            }
        });

        return roots;
    }

    private flattenTree(tasks: any[]): any[] {
        const flatList: any[] = [];
        const traverse = (nodes: any[]) => {
            for (const node of nodes) {
                // Clone to unlink from tree structure if needed, but keeping ref is okay for simple flattening
                // We mainly want to ensure children property is not confusing the grid if it expects flat, 
                // but usually Syncfusion ignores 'children' if parentIdMapping is set. 
                // However, let's keep it clean.
                const { children, ...flatNode } = node;
                flatList.push(flatNode);
                if (children && children.length > 0) {
                    traverse(children);
                }
            }
        };
        traverse(tasks);
        return flatList;
    }

    private findTaskAndParent(tasks: any[], id: string, parent: any = null): { task: any, parent: any, list: any[] } | null {
        for (let i = 0; i < tasks.length; i++) {
            if (tasks[i].id === id) {
                return { task: tasks[i], parent, list: tasks };
            }
            if (tasks[i].children) {
                const found = this.findTaskAndParent(tasks[i].children, id, tasks[i]);
                if (found) return found;
            }
        }
        return null;
    }

    private removeTaskRecursively(tasks: any[], id: string): any[] {
        return tasks.filter(t => {
            if (t.id === id) return false;
            if (t.children) {
                t.children = this.removeTaskRecursively(t.children, id);
            }
            return true;
        });
    }

    private renumberWbs(tasks: any[], parentWbs: string = '', parentId: string | null = null) {
        tasks.forEach((task, index) => {
            const currentWbs = parentWbs ? `${parentWbs}.${index + 1}` : `${index + 1}`;
            task.wbsId = currentWbs;
            // Update parentId to match structure (if we reparented)
            task.parentId = parentId;

            if (task.children && task.children.length > 0) {
                this.renumberWbs(task.children, currentWbs, task.id);
            }
        });
    }
}
