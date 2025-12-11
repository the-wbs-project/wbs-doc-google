
import { Component, ChangeDetectionStrategy, input, output, signal, inject, ViewChild, effect } from '@angular/core';
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

    constructor() {
        effect(() => {
            const tasks = this.tasks();
            this.updateDynamicColumns(tasks);
        });
    }

    private updateDynamicColumns(tasks: any[]) {
        const keyCounts = new Map<string, number>();

        const traverse = (nodes: any[]) => {
            for (const node of nodes) {
                if (node.metadata) {
                    // Handle if metadata is string (JSON) or object
                    let meta = node.metadata;
                    if (typeof meta === 'string') {
                        try { meta = JSON.parse(meta); } catch { meta = {}; }
                    }

                    Object.keys(meta).forEach(key => {
                        keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
                    });
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
            const currentTasks = this.treegrid?.dataSource as any[] || this.tasks();

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

        // Fallback to initial input if grid data retrieval failed or empty (though empty might be valid, usually not if we started with data)
        if (currentTasks.length === 0 && this.tasks().length > 0) {
            console.warn('TreeGrid dataSource was empty, falling back to initial tasks (changes might be lost)');
            currentTasks = this.tasks();
        }

        this.save.emit(currentTasks);
    }
}
