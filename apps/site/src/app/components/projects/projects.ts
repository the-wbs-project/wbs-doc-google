import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
    selector: 'app-projects',
    standalone: true,
    imports: [CommonModule, RouterModule, DatePipe],
    templateUrl: './projects.html',
    styleUrl: './projects.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsComponent {
    private api = inject(ApiService);

    projects = toSignal(this.api.getProjects(), { initialValue: [] });
}
