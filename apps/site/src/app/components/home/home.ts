import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class HomeComponent {
  status: string = '';
  statusClass: string = '';
  isLoading = false;

  constructor(private api: ApiService, private router: Router) { }

  async onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.uploadFile(file);
    }
  }

  async uploadFile(file: File) {
    this.status = 'Uploading file...';
    this.statusClass = 'loading';
    this.isLoading = true;

    this.api.uploadFile(file).subscribe({
      next: (res) => {
        this.status = 'File uploaded. AI Workflow triggered. Analyzing...';
        if (res.workflowId && res.projectId) {
          this.pollStatus(res.workflowId, res.projectId);
        } else if (res.workflowId) {
          // Fallback if projectId not returned (should satisfy type, but API returns it)
          this.pollStatus(res.workflowId, '');
        }
      },
      error: (err) => {
        this.status = `Error: ${err.message}`;
        this.statusClass = 'error';
        this.isLoading = false;
      }
    });
  }

  pollStatus(workflowId: string, projectId: string) {
    const interval = setInterval(() => {
      this.api.getWorkflowStatus(workflowId).subscribe({
        next: (res) => {
          if (res.status === 'complete' || res.status === 'success' || res.status === 'succeeded') {
            clearInterval(interval);
            if (res.output && res.output.success) {
              this.status = 'Analysis Complete! Redirecting...';
              this.statusClass = 'success';
              // If projectId was passed, use it. Otherwise try to find it?
              // The API /upload returns projectId.
              if (projectId) {
                this.router.navigate(['/project'], { queryParams: { id: projectId } });
              } else {
                this.status = "Analysis complete, but Project ID missing.";
              }
            } else {
              this.status = 'Workflow finished with errors.';
              this.statusClass = 'error';
              this.isLoading = false;
            }
          } else if (res.status === 'failed' || res.status === 'error' || res.status === 'errored') {
            clearInterval(interval);
            this.status = 'Workflow Failed.';
            this.statusClass = 'error';
            this.isLoading = false;
          } else {
            this.status = `Analyzing... Status: ${res.status}`;
          }
        },
        error: (e) => {
          console.error(e);
          // Don't stop polling on transient errors immediately?
        }
      });
    }, 5000);
  }
}
