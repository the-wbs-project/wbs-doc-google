import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ProjectDocument } from '@wbs/domains';
// @ts-ignore
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import { ApiService } from '../../services/api';
import { MessageService } from '../../services/message.service';
import { TaskComparisonComponent } from '../task-comparison/task-comparison';
import { TaskTreeGridComponent } from '../task-tree-grid/task-tree-grid';

@Component({
  selector: 'app-project',
  imports: [CommonModule, RouterModule, TaskComparisonComponent, TaskTreeGridComponent],
  templateUrl: './project.html',
  styleUrl: './project.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectComponent implements OnInit { // trigger build
  @ViewChild('tableDiv') tableDiv!: ElementRef;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private messageService = inject(MessageService);

  readonly projectId = signal<string | null>(null);

  status = signal('Loading project data...');
  statusClass = signal('loading');
  tabulator: any;

  projectData = signal<ProjectDocument | undefined>(undefined);
  activeTab = signal<'editor' | 'comparison' | 'legacy'>('comparison');

  constructor() {
    // Effect to handle basic consistency if needed, but logic is mostly event driven.
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const id = params['id'];
      const tab = params['tab'];

      this.projectId.set(id);

      if (tab && (tab === 'editor' || tab === 'comparison' || tab === 'legacy')) {
        this.activeTab.set(tab);
      }

      if (id) {
        this.loadProject();
      } else {
        this.status.set('Error: No Project ID provided.');
        this.statusClass.set('error');
      }
    });
  }

  loadProject() {
    const id = this.projectId();

    if (!id) return;

    this.api.getProject(id).subscribe({
      next: (data) => {
        this.projectData.set(data);

        if (data.model_results) {
          this.status.set('Project loaded successfully.');
          this.statusClass.set('success');

          // Determine starting tab ONLY if not already set via URL
          if (!this.route.snapshot.queryParams['tab']) {
            // If we have AI model results, default to comparison
            if (data.model_results && data.model_results.length > 0) {
              this.switchTab('comparison');
            }
            // If we have no model results but we have a tree (e.g. MPP file), default to editor
            else if (data.tree && data.tree.length > 0) {
              this.switchTab('editor');
            }
          }

          // Fallback or existing logic for legacy tab
          if (this.activeTab() === 'legacy' && data.tree) {
            setTimeout(() => this.renderTable(data.tree!), 0);
          }
        } else {
          this.status.set('Project loaded, but no tree data found.');
          this.statusClass.set('error');
        }
      },
      error: (err) => {
        this.status.set(`Error: ${err.message}`);
        this.statusClass.set('error');
      }
    });
  }

  switchTab(tab: 'editor' | 'comparison' | 'legacy') {
    this.activeTab.set(tab);

    // Update URL without reloading
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab },
      queryParamsHandling: 'merge', // Merge with existing params (like id)
      replaceUrl: true // Don't create new history entry for every tab switch? Maybe prefer push? User requirement implies bookmarking, usually push is better for navigation habits, but for tabs often replace. Let's use replaceUrl: false (default) to allow back button.
    });

    if (tab === 'legacy' && this.projectData()?.tree) {
      setTimeout(() => {
        if (this.tableDiv) this.renderTable(this.projectData()!.tree!);
      }, 0);
    }
  }

  // Handle updates from Tree Grid
  onTasksUpdate(tasks: any[]) {
    const current = this.projectData();
    if (current) {
      // Create shallow copy to trigger signal update if necessary, or just update nested?
      // Signals should be immutable best practice.
      this.projectData.set({ ...current, tree: tasks });
    }
  }

  onSaveProject(tasks: any[]) {
    const id = this.projectId();
    if (!id) return;

    this.projectData.update(current => current ? { ...current, tree: tasks } : current);

    this.api.updateProject(id, { tree: tasks }).subscribe({
      next: () => {
        this.messageService.alert('Project saved successfully!', 'Success', 'success');
      },
      error: (err) => {
        console.error(err);
        this.messageService.alert(`Failed to save project: ${err.message}`, 'Error', 'error');
      }
    });
  }

  async promoteModel(modelName: string) {
    if (!await this.messageService.confirm(`Are you sure you want to promote the results from ${modelName} to the main grid? This will overwrite the current main grid data.`)) return;

    const id = this.projectId();
    if (!id) return;

    this.api.promoteModel(id, modelName).subscribe({
      next: () => {
        this.messageService.alert(`Successfully promoted ${modelName} to the main grid.`, 'Success', 'success');
        this.projectData.update(current => {
          // We can optimistically update or reload.
          // Since backend logic will update the tree, reloading is safer to get the correct tree structure.
          return current;
        });
        this.loadProject(); // Reload to get the new tree
        this.switchTab('editor'); // Switch to editor view
      },
      error: (err) => this.messageService.alert(`Failed to promote model: ${err.message}`, 'Error', 'error')
    });
  }

  renderTable(treeData: any[]) {
    if (!this.tableDiv) return;

    const rename = (row: any) => {
      row.title = `${row.wbsId || ''} - ${row.name}`;
      if (row.children) {
        row.children.forEach(rename);
      }
    };
    const dataClone = JSON.parse(JSON.stringify(treeData));
    dataClone.forEach(rename);

    this.tabulator = new Tabulator(this.tableDiv.nativeElement, {
      data: dataClone,
      dataTree: true,
      dataTreeStartExpanded: true,
      dataTreeChildField: "children",
      layout: "fitColumns",
      placeholder: "No Data Available",
      columns: [
        { title: "Task Name", field: "title", widthGrow: 3 },
        { title: "ID", field: "id", width: 100, visible: false },
      ],
    });
  }
}
