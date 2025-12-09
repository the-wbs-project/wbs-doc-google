import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WorkflowStatusResponse, ProjectData } from '@wbs/domains';

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

  refineProject(tasks: any[], instructions: string): Observable<{ tasks: any[] }> {
    return this.http.post<{ tasks: any[] }>('/api/ai/refine', { tasks, instructions });
  }

  deleteModelResult(projectId: string, modelId: string): Observable<any> {
    return this.http.delete(`/api/projects/${projectId}/models/${modelId}`);
  }

  rerunModel(projectId: string, modelId: string): Observable<any> {
    return this.http.post(`/api/projects/${projectId}/models/${modelId}/rerun`, {});
  }

  promoteModel(projectId: string, modelId: string): Observable<any> {
    return this.http.post(`/api/projects/${projectId}/models/${modelId}/promote`, {});
  }
}
