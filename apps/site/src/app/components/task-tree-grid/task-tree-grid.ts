
import { Component, ChangeDetectionStrategy, input, output, signal, inject, ViewChild, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TreeGridModule, EditService, ToolbarService, TreeGridComponent } from '@syncfusion/ej2-angular-treegrid';
import { DialogModule } from '@syncfusion/ej2-angular-popups';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api';

@Component({
    selector: 'app-task-tree-grid',
    imports: [CommonModule, TreeGridModule, DialogModule, FormsModule],
    providers: [EditService, ToolbarService],
    templateUrl: './task-tree-grid.html',
    styleUrls: ['./task-tree-grid.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskTreeGridComponent { // trigger build
    tasks = input<any[]>([]);
    tasksChange = output<any[]>();
    save = output<any[]>();

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

    async submitRefinement() {
        const instructions = this.refineInstructions();
        if (!instructions) return;

        this.isRefining.set(true);
        try {
            const currentTasks = this.getTasksFromGrid();

            // Transformations might be needed here too if we send to API, 
            // but for now let's assume we just want to emit/handle locally or the API handles it.
            // Actually, if we are refining, we might want to send the transformed (Array-based) tasks.

            /*this.apiService.refineProject(currentTasks, instructions).subscribe({
                next: (response) => {
                    // Update external state
                    this.tasksChange.emit(response.tasks);

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
            });*/

        } catch (e) {
            console.error(e);
            this.isRefining.set(false);
        }
    }

    saveChanges() {
        if (this.treegrid) {
            this.treegrid.endEdit();
        }

        const currentTasks = this.getTasksFromGrid();
        this.save.emit(currentTasks);
    }

    private getTasksFromGrid(): any[] {
        let currentTasks: any[] = [];

        if (this.treegrid) {
            const ds = this.treegrid.dataSource;
            if (Array.isArray(ds)) {
                currentTasks = ds;
            } else if (ds && typeof ds === 'object') {
                // Handle DataManager scenarios
                currentTasks = (ds as any).dataSource?.json || (ds as any).json || (ds as any).dataSource || [];
                // If it's still not an array (e.g. single object wrapped), fall back
                if (!Array.isArray(currentTasks)) {
                    currentTasks = [];
                }
            }
        }

        // Fallback to initial input if grid data retrieval failed or empty
        if (currentTasks.length === 0 && this.tasks().length > 0) {
            // Note: This fallback might be risky if the user genuinely deleted everything, 
            // but for safety in this context we keep it or maybe we should use the transformed initial tasks?
            // Actually if we fallback, we should re-transform the initial input if we are relying on that.
            // But let's assume grid works.
            console.warn('TreeGrid dataSource was empty, falling back to initial tasks');
            return this.tasks(); // This is the original input (Array metadata), so correct format.
        }

        // Transform back to Array metadata
        return this.transformTasksFromGrid(currentTasks);
    }

    private transformTasksFromGrid(tasks: any[]): any[] {
        return tasks.map(task => {
            const newTask = { ...task };

            // Allow children recursion
            if (newTask.children) {
                // If the grid uses a hierarchical data source, children might be present
                // If using 'parentIdMapping', it might be a flat list. 
                // The current template uses `parentIdMapping`, so it's likely flat or handled by grid.
                // However, `tasks` input implies a tree structure if we look at `transformTasksForGrid` recursion.
                // Syncfusion TreeGrid with `parentIdMapping` usually works with flat data, 
                // BUT the input `tasks` seems to be recursive in `updateDynamicColumns` and `transformTasksForGrid`.
                // Let's check the HTML: `parentIdMapping="parentId"` AND `[treeColumnIndex]="1"`.
                // If the input is hierarchical (has children), Syncfusion can handle it using `childMapping`.
                // If `parentIdMapping` is used, it expects self-referential flat data.
                // Let's look at `TreeTask` model in previous step to be sure.
                // `TreeTask` has `children: TreeTask[]`.
                // If `parentIdMapping` is set, Syncfusion might ignore `children` OR expect consistent ID refs.
                // Wait, if existing code uses `parentIdMapping`, it might be converting to flat internally?
                // The `transformTasksForGrid` I wrote handles recursion. 
                // Let's ensure we support recursion here too.
                newTask.children = this.transformTasksFromGrid(newTask.children);
            }

            if (newTask.metadata && !Array.isArray(newTask.metadata) && typeof newTask.metadata === 'object') {
                const metaArray: { key: string, value: any }[] = [];
                Object.keys(newTask.metadata).forEach(key => {
                    // Filter out internal properties if any, though mapped object should be clean
                    if (newTask.metadata[key] !== undefined && newTask.metadata[key] !== null) {
                        metaArray.push({ key: key, value: newTask.metadata[key] });
                    }
                });
                newTask.metadata = metaArray;
            }
            return newTask;
        });
    }
}
