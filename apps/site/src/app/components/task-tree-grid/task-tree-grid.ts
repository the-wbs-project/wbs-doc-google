
import { Component, ChangeDetectionStrategy, input, output, signal, inject, ViewChild } from '@angular/core';
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

    @ViewChild('treegrid') treegrid: TreeGridComponent | undefined;

    private apiService = inject(ApiService);

    public editSettings: Object = { allowEditing: true, allowAdding: true, allowDeleting: true, mode: 'Row' };
    public toolbar: string[] = ['Add', 'Edit', 'Delete', 'Update', 'Cancel', 'ExpandAll', 'CollapseAll'];

    public showRefineDialog = signal(false);
    public refineInstructions = signal('');
    public isRefining = signal(false);

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

            this.apiService.refineProject(currentTasks, instructions).subscribe({
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
            });

        } catch (e) {
            console.error(e);
            this.isRefining.set(false);
        }
    }
}
