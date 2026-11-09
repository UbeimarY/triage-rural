import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { SessionStore } from './core/auth/session.store';

/** Only coordinators see the dashboard. The API enforces the same rule on every request. */
const coordinatorGuard: CanActivateFn = () =>
  inject(SessionStore).isCoordinator() || inject(Router).createUrlTree(['/login']);

/**
 * Registering visits is the promoters' job; coordinators follow them on the dashboard.
 * Without a session the screens stay open: a promoter can work before signing in.
 */
const promoterAreaGuard: CanActivateFn = () =>
  !inject(SessionStore).isCoordinator() || inject(Router).createUrlTree(['/dashboard']);

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'patients' },
  {
    path: 'patients',
    canActivate: [promoterAreaGuard],
    title: 'Pacientes · Triage Rural',
    loadComponent: () => import('./pages/patients/patients-page').then((m) => m.PatientsPage),
  },
  {
    path: 'encounters/new',
    canActivate: [promoterAreaGuard],
    title: 'Nuevo registro · Triage Rural',
    loadComponent: () =>
      import('./pages/encounter-form/encounter-form-page').then((m) => m.EncounterFormPage),
  },

  {
    path: 'encounters/:id/edit',
    canActivate: [promoterAreaGuard],
    title: 'Editar registro · Triage Rural',
    loadComponent: () =>
      import('./pages/encounter-form/encounter-form-page').then((m) => m.EncounterFormPage),
  },

  {
    path: 'login',
    title: 'Ingresar · Triage Rural',
    loadComponent: () => import('./pages/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'dashboard',
    title: 'Panel de seguimiento · Triage Rural',
    canActivate: [coordinatorGuard],
    loadComponent: () => import('./pages/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: '**',
    title: 'Página no encontrada · Triage Rural',
    loadComponent: () => import('./pages/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
