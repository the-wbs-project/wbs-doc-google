
import { Component, ChangeDetectionStrategy, input, output, inject, computed, signal, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComparisonResult, ModelResults, TreeTask } from '@wbs/domains';
import { ApiService } from '../../services/api';
import { MessageService } from '../../services/message.service';

interface ComparisonRow {
    wbsId: string;
    name: string; // Consolidated or Consensus name
    status: 'pass' | 'needs_review';
    models: { [modelName: string]: any }; // The task object from the specific model
    discrepancies?: string;
    level: number;
}

@Component({
    standalone: true,
    selector: 'app-task-comparison',
    templateUrl: './task-comparison.html',
    styleUrls: ['./task-comparison.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskComparisonComponent { // trigger build
    private readonly api = inject(ApiService);
    private readonly messageService = inject(MessageService);

    readonly comparison = input<ComparisonResult | undefined>(undefined);
    readonly modelResults = input<ModelResults<TreeTask[]>[]>([]);
    readonly projectId = input.required<string>();

    readonly refresh = output<void>();
    readonly promote = output<string>();

    readonly activeMenu = signal<string | null>(null);
    readonly isRerunning = signal(false);
    readonly modelNameMapping = signal<Record<string, string>>({});

    constructor() {
        effect(() => {
            const results = this.modelResults();
            const currentMapping = untracked(this.modelNameMapping);
            const missingModels = results
                .map(r => r.model)
                .filter(m => !currentMapping[m]);

            if (missingModels.length > 0) {
                missingModels.forEach(modelId => {
                    this.api.getModelInfo(modelId).subscribe({
                        next: (info) => {
                            this.modelNameMapping.update(mapping => ({ ...mapping, [modelId]: info.name }));
                        },
                        error: () => {
                            // fallback to ID if fetch fails, or just leave it
                        }
                    });
                });
            }
        }, { allowSignalWrites: true });
    }

    toggleMenu(modelName: string) {
        if (this.activeMenu() === modelName) {
            this.activeMenu.set(null);
        } else {
            this.activeMenu.set(modelName);
        }
    }

    closeMenu() {
        this.activeMenu.set(null);
    }


    modelNames = computed(() => this.modelResults()?.map(r => r.model) || []);

    rows = computed(() => {
        const comp = this.comparison();
        const results = this.modelResults();
        const names = this.modelNames();

        if (!comp) return [];

        return comp.tasks.map(comparedTask => {
            // Calculate level based on WBS ID dots (e.g. 1.1 = level 1, 1.1.1 = level 2)
            const level = (comparedTask.wbsId.match(/\./g) || []).length;

            const row: ComparisonRow = {
                wbsId: comparedTask.wbsId,
                name: comparedTask.name,
                status: comparedTask.status,
                models: {},
                discrepancies: comparedTask.discrepancies,
                level: level
            };

            names.forEach(modelName => {
                const result = results?.find(r => r.model === modelName);
                if (result) {
                    const task = result.results.find(t => t.wbsId === comparedTask.wbsId);
                    if (task) {
                        row.models[modelName] = task;
                    } else {
                        const fuzzy = result.results.find(t => t.name === comparedTask.name);
                        if (fuzzy) {
                            row.models[modelName] = fuzzy;
                        }
                    }
                }
            });
            return row;
        });
    });

    async deleteModel(modelName: string) {
        if (!await this.messageService.confirm(`Are you sure you want to remove the results for ${modelName}?`)) return;

        this.api.deleteModelResult(this.projectId(), modelName).subscribe({
            next: () => {
                this.refresh.emit(); // Reload project data
            },
            error: (err) => this.messageService.alert(`Failed to delete model: ${err.message}`, 'Error', 'error')
        });
    }

    async rerunModel(modelName: string) {
        if (!await this.messageService.confirm(`Are you sure you want to re-run the analysis for ${modelName}? This will overwrite existing results.`)) return;

        this.isRerunning.set(true);

        this.api.rerunModel(this.projectId(), modelName).subscribe({
            next: (res) => {
                this.pollWorkflowStatus(res.workflowId);
            },
            error: (err) => {
                this.messageService.alert(`Failed to rerun model: ${err.message}`, 'Error', 'error');
                this.isRerunning.set(false);
            }
        });
    }

    private pollWorkflowStatus(workflowId: string) {
        const pollInterval = 2000; // 2 seconds

        const checkStatus = () => {
            if (!this.isRerunning()) return; // Stop if cancelled or handled elsewhere

            this.api.getWorkflowStatus(workflowId).subscribe({
                next: (res) => {
                    const status = res.status;
                    if (['complete', 'success', 'succeeded'].includes(status)) {
                        this.isRerunning.set(false);
                        this.refresh.emit();
                        // Optional: alert('Analysis completed');
                    } else if (['failed', 'error', 'errored'].includes(status)) {
                        this.isRerunning.set(false);
                        this.messageService.alert('Analysis failed during rerun.', 'Error', 'error');
                    } else {
                        // Continue polling
                        setTimeout(checkStatus, pollInterval);
                    }
                },
                error: (err) => {
                    console.error('Polling error', err);
                    this.isRerunning.set(false);
                    this.messageService.alert('Error checking status. Please refresh manually.', 'Error', 'error');
                }
            });
        };

        // Start polling
        setTimeout(checkStatus, pollInterval);
    }

    refineComparison() {
        const instruction = prompt("Enter instructions to refine the comparison (e.g. 'Use consensus names for all tasks'):");
        if (!instruction) return;

        // existing logic commented out in original file, keeping unrelated parts as is
    }
}
