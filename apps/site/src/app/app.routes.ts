import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home';
import { ProjectComponent } from './components/project/project';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'project', component: ProjectComponent },
    { path: '**', redirectTo: '' }
];
