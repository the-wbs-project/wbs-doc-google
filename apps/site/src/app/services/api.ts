import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ProjectDocument, TreeTask, WorkflowStatusResponse } from '@wbs/domains';
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

  refine(modelId: string, instructions: string, tasks: TreeTask[]): Observable<TreeTask[]> {
    return this.http.post<TreeTask[]>(`/api/refine`, { model: modelId, instructions, tasks });
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
}
