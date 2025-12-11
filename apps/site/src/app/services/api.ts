import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ProjectDocument, WorkflowStatusResponse } from '@wbs/domains';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  uploadFile(file: File): Observable<{ workflowId: string, projectId?: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ workflowId: string, projectId?: string }>('/api/workflow/start', formData);
  }

  getWorkflowStatus(workflowId: string): Observable<WorkflowStatusResponse> {
    return this.http.get<WorkflowStatusResponse>(`/api/workflow/status/${workflowId}`);
  }

  getProject(projectId: string): Observable<ProjectDocument> {
    return this.http.get<ProjectDocument>(`/api/projects/${projectId}`);
  }

  refineProject(projectId: string, modelId: string, instructions: string): Observable<{ workflowId: string }> {
    return this.http.post<{ workflowId: string }>(`/api/projects/${projectId}/models/${encodeURIComponent(modelId)}/refine`, { instructions });
  }

  rerunModel(projectId: string, modelId: string): Observable<{ workflowId: string }> {
    return this.http.post<{ workflowId: string }>(`/api/projects/${projectId}/models/${encodeURIComponent(modelId)}/rerun`, {});
  }

  promoteModel(projectId: string, modelId: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`/api/projects/${projectId}/models/${encodeURIComponent(modelId)}/promote`, {});
  }

  deleteModelResult(projectId: string, modelId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/projects/${projectId}/models/${encodeURIComponent(modelId)}`);
  }

  updateProject(projectId: string, data: Partial<ProjectDocument>): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`/api/projects/${projectId}`, data);
  }
  getModelInfo(modelId: string): Observable<{ id: string, name: string }> {
    return this.http.get<{ id: string, name: string }>(`/api/models/${encodeURIComponent(modelId)}`);
  }
}
