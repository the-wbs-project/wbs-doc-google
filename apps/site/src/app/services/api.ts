import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface WorkflowOutput {
  success: boolean;
  results?: any[];
  comparison?: any;
  tree?: any[];
}

export interface WorkflowStatusResponse {
  status: 'queued' | 'running' | 'complete' | 'failed' | 'success' | 'succeeded' | 'error' | 'errored' | 'unknown';
  output?: WorkflowOutput;
}

export interface ProjectData {
  _id: string;
  name: string;
  tree?: any[];
  comparison?: any;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  constructor(private http: HttpClient) { }

  uploadFile(file: File): Observable<{ workflowId: string, projectId?: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ workflowId: string, projectId?: string }>('/api/upload', formData);
  }

  getWorkflowStatus(workflowId: string): Observable<WorkflowStatusResponse> {
    return this.http.get<WorkflowStatusResponse>(`/api/status/${workflowId}`);
  }

  getProject(projectId: string): Observable<ProjectData> {
    return this.http.get<ProjectData>(`/api/projects/${projectId}`);
  }
}
