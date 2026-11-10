import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { SessionStore } from './core/auth/session.store';

/**
 * Every screen with patient data needs an account on the phone. The account stays
 * after its token expires, so a promoter without signal keeps working.
 */
const signedInGuard: CanActivateFn = (_route, state) =>
  inject(SessionStore).isSignedIn() ||
  inject(Router).createUrlTree(['/login'], { queryParams: { volver: state.url } });

/** Only coordinators see the dashboard, and it needs a valid token: it reads the server. */
const coordinatorGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  return (
    (session.isCoordinator() && !session.needsRenewal()) || inject(Router).createUrlTree(['/login'])
  );
};

/** Registering visits is the promoters' job; coordinators follow them on the dashboard. */
const promoterAreaGuard: CanActivateFn = () =>
  !inject(SessionStore).isCoordinator() || inject(Router).createUrlTree(['/dashboard']);

/** Signed in with a valid token: nothing to do on the sign-in screen. */
const signedOutGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  if (!session.isSignedIn() || session.needsRenewal()) return true;
  return inject(Router).createUrlTree([session.isCoordinator() ? '/dashboard' : '/today']);
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  {
    path: 'today',
    canActivate: [signedInGuard, promoterAreaGuard],
    title: 'Hoy · Triage Rural',
    loadComponent: () => import('./pages/today/today-page').then((m) => m.TodayPage),
  },
  {
    path: 'patients',
    canActivate: [signedInGuard, promoterAreaGuard],
    title: 'Pacientes · Triage Rural',
    loadComponent: () => import('./pages/patients/patients-page').then((m) => m.PatientsPage),
  },
  {
    path: 'encounters/new',
    canActivate: [signedInGuard, promoterAreaGuard],
    title: 'Nuevo registro · Triage Rural',
    loadComponent: () =>
      import('./pages/encounter-form/encounter-form-page').then((m) => m.EncounterFormPage),
  },

  {
    path: 'encounters/:id/edit',
    canActivate: [signedInGuard, promoterAreaGuard],
    title: 'Editar registro · Triage Rural',
    loadComponent: () =>
      import('./pages/encounter-form/encounter-form-page').then((m) => m.EncounterFormPage),
  },

  {
    path: 'login',
    canActivate: [signedOutGuard],
    title: 'Ingresar · Triage Rural',
    loadComponent: () => import('./pages/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'salir',
    canActivate: [signedInGuard],
    title: 'Salir · Triage Rural',
    loadComponent: () => import('./pages/sign-out/sign-out-page').then((m) => m.SignOutPage),
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
