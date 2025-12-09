import { Component, OnInit, ElementRef, ViewChild, ChangeDetectionStrategy, inject, signal, effect, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
import { ProjectData, ComparisonResult, ModelResults } from '@wbs/domains';
import { TaskComparisonComponent } from '../task-comparison/task-comparison';
import { TaskTreeGridComponent } from '../task-tree-grid/task-tree-grid';
// @ts-ignore
import { TabulatorFull as Tabulator } from 'tabulator-tables';

@Component({
  selector: 'app-project',
  imports: [CommonModule, RouterModule, TaskComparisonComponent, TaskTreeGridComponent],
  templateUrl: './project.html',
  styleUrl: './project.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectComponent implements OnInit {
  @ViewChild('tableDiv') tableDiv!: ElementRef;

  private route = inject(ActivatedRoute);
  private api = inject(ApiService);

  readonly projectId = signal<string | null>(null);

  status = signal('Loading project data...');
  statusClass = signal('loading');
  tabulator: any;

  projectData = signal<ProjectData | undefined>(undefined);
  activeTab = signal<'editor' | 'comparison' | 'legacy'>('comparison');

  constructor() {
    // Effect to handle basic consistency if needed, but logic is mostly event driven.
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const id = params['id'];

      this.projectId.set(id);

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

        if (data.tree || data.modelResults) {
          this.status.set('Project loaded successfully.');
          this.statusClass.set('success');

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

  promoteModel(modelName: string) {
    if (!confirm(`Are you sure you want to promote the results from ${modelName} to the main grid? This will overwrite the current main grid data.`)) return;

    const id = this.projectId();
    if (!id) return;

    this.api.promoteModel(id, modelName).subscribe({
      next: () => {
        alert(`Successfully promoted ${modelName} to the main grid.`);
        this.projectData.update(current => {
          // We can optimistically update or reload.
          // Since backend logic will update the tree, reloading is safer to get the correct tree structure.
          return current;
        });
        this.loadProject(); // Reload to get the new tree
        this.switchTab('editor'); // Switch to editor view
      },
      error: (err) => alert(`Failed to promote model: ${err.message}`)
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
