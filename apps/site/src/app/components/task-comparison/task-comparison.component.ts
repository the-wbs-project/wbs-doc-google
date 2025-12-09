
import { Component, ChangeDetectionStrategy, input, output, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComparisonResult, ModelResults } from '@wbs/domains';
import { ApiService } from '../../services/api';

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
    templateUrl: './task-comparison.component.html',
    styleUrls: ['./task-comparison.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskComparisonComponent {
    private readonly api = inject(ApiService);

    readonly comparison = input<ComparisonResult | undefined>(undefined);
    readonly modelResults = input<ModelResults[]>([]);
    readonly projectId = input.required<string>();

    readonly refresh = output<void>();
    readonly promote = output<string>();


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
                    const task = result.tasks.find(t => t.wbsId === comparedTask.wbsId);
                    if (task) {
                        row.models[modelName] = task;
                    } else {
                        const fuzzy = result.tasks.find(t => t.name === comparedTask.name);
                        if (fuzzy) {
                            row.models[modelName] = fuzzy;
                        }
                    }
                }
            });
            return row;
        });
    });

    deleteModel(modelName: string) {
        if (!confirm(`Are you sure you want to remove the results for ${modelName}?`)) return;

        this.api.deleteModelResult(this.projectId(), modelName).subscribe({
            next: () => {
                this.refresh.emit(); // Reload project data
            },
            error: (err) => alert(`Failed to delete model: ${err.message}`)
        });
    }

    rerunModel(modelName: string) {
        if (!confirm(`Are you sure you want to re-run the analysis for ${modelName}? This will overwrite existing results.`)) return;

        this.api.rerunModel(this.projectId(), modelName).subscribe({
            next: () => {
                alert(`Analysis started for ${modelName}. It may take a minute to complete.`);
                // We might want to poll or just let the user refresh manually
            },
            error: (err) => alert(`Failed to rerun model: ${err.message}`)
        });
    }

    refineComparison() {
        const instruction = prompt("Enter instructions to refine the comparison (e.g. 'Use consensus names for all tasks'):");
        if (!instruction) return;

        const currentComparison = this.comparison();

        if (currentComparison) {
            this.api.refineProject(currentComparison.tasks, instruction).subscribe({
                next: (res) => {
                    // Ideally we would update the parent state or re-fetch.
                    // Since we are using OnPush and Signals, we can't just mutate the input.
                    // We should probably emit an event or rely on the parent to refresh.
                    // But for now, we'll confirm success.
                    // To update the view immediately without refresh, we'd need a way to override the input locally 
                    // OR the parent handles the state.
                    // Given the "Refresh" architecture, let's emit refresh for now or alert.

                    // Actually, the previous implementation mutated the comparison object.
                    // We can't do that easily with signals.
                    // We will emit 'refresh' and let parent reload, OR alert user to refresh.
                    alert("Refinement submitted. Please refresh to see changes or wait for update.");
                    this.refresh.emit();
                },
                error: (err) => alert(`Failed to refine: ${err.message}`)
            });
        }
    }
}
