import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'patients' },
  {
    path: 'patients',
    title: 'Pacientes · Triage Rural',
    loadComponent: () => import('./pages/patients/patients-page').then((m) => m.PatientsPage),
  },
  {
    path: 'encounters/new',
    title: 'Nuevo registro · Triage Rural',
    loadComponent: () =>
      import('./pages/new-encounter/new-encounter-page').then((m) => m.NewEncounterPage),
  },
  {
    path: '**',
    title: 'Página no encontrada · Triage Rural',
    loadComponent: () => import('./pages/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
