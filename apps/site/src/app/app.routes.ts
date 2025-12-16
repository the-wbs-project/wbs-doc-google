import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home';
import { ProjectComponent } from './components/project/project';
import { unsavedChangesGuard } from './guards/unsaved-changes.guard';

import { ProjectsComponent } from './components/projects/projects';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'projects', component: ProjectsComponent },
    { path: 'project', component: ProjectComponent, canDeactivate: [unsavedChangesGuard] },
    { path: '**', redirectTo: '' }
];
