import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
// @ts-ignore
import { TabulatorFull as Tabulator } from 'tabulator-tables';

@Component({
  selector: 'app-project',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './project.html',
  styleUrl: './project.scss'
})
export class ProjectComponent implements OnInit {
  @ViewChild('tableDiv') tableDiv!: ElementRef;

  status = 'Loading project data...';
  statusClass = 'loading';
  tabulator: any;

  constructor(private route: ActivatedRoute, private api: ApiService) { }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.loadProject(id);
      } else {
        this.status = 'Error: No Project ID provided.';
        this.statusClass = 'error';
      }
    });
  }

  loadProject(id: string) {
    this.api.getProject(id).subscribe({
      next: (data) => {
        if (data.tree) {
          this.status = 'Project loaded successfully.';
          this.statusClass = 'success';
          this.renderTable(data.tree);
        } else {
          this.status = 'Project loaded, but no tree data found.';
          this.statusClass = 'error';
        }
      },
      error: (err) => {
        this.status = `Error: ${err.message}`;
        this.statusClass = 'error';
      }
    });
  }

  renderTable(treeData: any[]) {
    // Helper to rename name -> title for Tabulator tree if needed, or configure tabulator
    // Tabulator uses 'children' field by default.

    const rename = (row: any) => {
      row.title = `${row.wbsId || ''} - ${row.name}`;
      if (row.children) {
        row.children.forEach(rename);
      }
    };
    treeData.forEach(rename);

    this.tabulator = new Tabulator(this.tableDiv.nativeElement, {
      data: treeData,
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
