import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppUpdateService } from './core/app-update.service';
import { ConnectivityService } from './core/connectivity.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a class="skip-link" href="#main">Saltar al contenido</a>

    <header class="app-header">
      <span class="brand"><span aria-hidden="true">✚</span> Triage Rural</span>
      <span class="status" [class.offline]="!connectivity.online()" role="status">
        @if (connectivity.online()) {
          <span aria-hidden="true">●</span> En línea
        } @else {
          <span aria-hidden="true">○</span> Sin conexión
        }
      </span>
    </header>

    @if (!connectivity.online()) {
      <p class="offline-banner" role="status">
        Estás sin conexión. La aplicación sigue funcionando.
      </p>
    }

    @if (updates.updateAvailable()) {
      <div class="update-banner" role="status">
        <span>Hay una nueva versión disponible.</span>
        <button type="button" (click)="updates.applyUpdate()">Actualizar</button>
      </div>
    }

    <p class="safety-notice" role="note">
      <span aria-hidden="true">⚕</span>
      Apoyo a la priorización: no es un diagnóstico. La decisión final es del personal de salud.
    </p>

    <main id="main" class="app-main" tabindex="-1">
      <router-outlet />
    </main>

    <nav class="bottom-nav" aria-label="Navegación principal">
      <a routerLink="/patients" routerLinkActive="active" ariaCurrentWhenActive="page">
        <span class="nav-icon" aria-hidden="true">👥</span>
        Pacientes
      </a>
      <a routerLink="/encounters/new" routerLinkActive="active" ariaCurrentWhenActive="page">
        <span class="nav-icon" aria-hidden="true">＋</span>
        Registrar
      </a>
    </nav>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }

    .skip-link {
      position: absolute;
      left: -9999px;
      top: 0.5rem;
      z-index: 10;
      padding: 0.75rem 1rem;
      background: var(--color-surface);
      border-radius: var(--radius);
    }
    .skip-link:focus {
      left: 0.5rem;
    }

    .app-header {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding: 0.9rem 1rem;
      padding-top: calc(0.9rem + env(safe-area-inset-top));
      background: var(--color-primary);
      color: #fff;
    }
    .brand {
      font-size: 1.2rem;
      font-weight: 700;
    }

    .status {
      padding: 0.25rem 0.7rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.18);
      font-size: 0.85rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .status.offline {
      background: #fff;
      color: var(--priority-medium);
    }

    .offline-banner,
    .update-banner {
      margin: 0;
      padding: 0.7rem 1rem;
      font-weight: 600;
    }
    .offline-banner {
      background: var(--priority-medium-bg);
      color: var(--priority-medium);
    }
    .update-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      background: #e3ecfb;
      color: #173d7a;
    }

    .safety-notice {
      margin: 0;
      padding: 0.6rem 1rem;
      background: #e8f1ee;
      border-bottom: 1px solid var(--color-border);
      color: var(--color-muted);
      font-size: 0.9rem;
    }

    .app-main {
      flex: 1;
      width: 100%;
      max-width: 720px;
      margin: 0 auto;
      padding: 1.25rem 1rem 6rem; // bottom space so the nav never hides content
    }
    .app-main:focus {
      outline: none;
    }

    .bottom-nav {
      position: fixed;
      inset: auto 0 0 0;
      display: flex;
      background: var(--color-surface);
      border-top: 1px solid var(--color-border);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .bottom-nav a {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 64px;
      color: var(--color-muted);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .bottom-nav a.active {
      color: var(--color-primary-dark);
      box-shadow: inset 0 3px 0 var(--color-primary);
    }
    .nav-icon {
      font-size: 1.4rem;
      line-height: 1;
    }
  `,
})
export class App {
  readonly connectivity = inject(ConnectivityService);
  readonly updates = inject(AppUpdateService);
}
