import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppUpdateService } from './core/app-update.service';
import { SessionStore } from './core/auth/session.store';
import { ConnectivityService } from './core/connectivity.service';
import { DisplayService } from './core/display.service';
import { NavigationIssue } from './core/navigation-issue';
import { SyncService } from './core/sync/sync.service';
import { Icon } from './shared/icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  template: `
    <a class="skip-link" href="#main">Saltar al contenido</a>

    <header class="app-header">
      <span class="brand">
        <span class="brand__mark"><app-icon name="cross" /></span>
        <span>Triage Rural <small>Nariño</small></span>
      </span>
      <span class="header-tools">
        <span class="status" [class.offline]="!connectivity.online()" role="status">
          @if (connectivity.online()) {
            <span aria-hidden="true">●</span> En línea
          } @else {
            <span aria-hidden="true">○</span> Sin conexión
          }
        </span>
        <button
          type="button"
          class="sun-toggle"
          [attr.aria-pressed]="display.sun()"
          (click)="display.toggleSun()"
          title="Más contraste y letra más grande para leer al sol"
        >
          <app-icon name="sun" />
          <span>Modo sol</span>
        </button>
      </span>
    </header>

    @if (!connectivity.online()) {
      <p class="offline-banner" role="status">
        Estás sin conexión. La aplicación sigue funcionando.
      </p>
    }

    @if (session.isSignedIn()) {
      <div class="sync-bar" role="status" [attr.data-state]="sync.state()">
        <span>{{ syncText() }}</span>
        @if (sync.state() === 'needs-login') {
          <a routerLink="/login">Ingresar</a>
        } @else if (session.isSignedIn() && connectivity.online()) {
          <button type="button" class="link" (click)="sync.syncNow()" [disabled]="sync.isBusy()">
            Sincronizar ahora
          </button>
        }
      </div>
    }

    @if (navigation.missingScreen()) {
      <div class="update-banner" role="alert">
        <span
          >Esta pantalla aún no está guardada en el teléfono. Conéctate a internet una vez y
          recarga.</span
        >
        <button type="button" (click)="navigation.missingScreen.set(false)">Entendido</button>
      </div>
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

    @if (session.isSignedIn()) {
      <nav class="bottom-nav" aria-label="Navegación principal">
        @if (!session.isCoordinator()) {
          <a routerLink="/today" routerLinkActive="active" ariaCurrentWhenActive="page">
            <app-icon class="nav-icon" name="today" />
            Hoy
          </a>
          <a routerLink="/patients" routerLinkActive="active" ariaCurrentWhenActive="page">
            <app-icon class="nav-icon" name="patients" />
            Pacientes
          </a>
          <a routerLink="/encounters/new" routerLinkActive="active" ariaCurrentWhenActive="page">
            <app-icon class="nav-icon" name="register" />
            Registrar
          </a>
        } @else {
          <a routerLink="/dashboard" routerLinkActive="active" ariaCurrentWhenActive="page">
            <app-icon class="nav-icon" name="panel" />
            Panel
          </a>
        }
        @if (session.user(); as user) {
          <a routerLink="/salir" routerLinkActive="active" ariaCurrentWhenActive="page">
            <app-icon class="nav-icon" name="logout" />
            Salir ({{ user.fullName.split(' ')[0] }})
          </a>
        }
      </nav>
    }
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
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 1.2rem;
      font-weight: 700;
    }
    .brand {
      white-space: nowrap;
    }
    .brand small {
      display: block;
      font-size: 0.75rem;
      font-weight: 400;
      opacity: 0.8;
      line-height: 1;
    }
    .brand__mark {
      display: grid;
      place-items: center;
      width: 2.1rem;
      height: 2.1rem;
      border-radius: 10px;
      background: #fff;
      color: var(--color-primary);
    }
    .brand__mark app-icon ::ng-deep svg {
      width: 1.3rem;
      height: 1.3rem;
      fill: currentColor;
    }

    .header-tools {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    .sun-toggle {
      min-height: 40px;
      padding: 0.3rem 0.7rem;
      gap: 0.35rem;
      border: 1px solid rgb(255 255 255 / 0.5);
      background: transparent;
      font-size: 0.85rem;
    }
    .sun-toggle app-icon ::ng-deep svg {
      width: 1.2rem;
      height: 1.2rem;
    }
    .sun-toggle[aria-pressed='true'] {
      background: #fff;
      color: #000;
      border-color: #fff;
    }
    @media (max-width: 420px) {
      .sun-toggle span {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
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

    .sync-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin: 0;
      padding: 0.5rem 1rem;
      font-size: 0.9rem;
      font-weight: 600;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      color: var(--color-muted);
    }
    .sync-bar[data-state='needs-login'],
    .sync-bar[data-state='other-account'],
    .sync-bar[data-state='server-unreachable'] {
      background: var(--priority-medium-bg);
      color: var(--priority-medium);
    }
    .link {
      min-height: 40px;
      padding: 0.25rem 0.75rem;
      background: transparent;
      color: var(--color-primary-dark);
      border: 1px solid var(--color-primary);
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
      max-width: 1120px;
      margin: 0 auto;
      padding: 1.25rem 1rem 6rem; // bottom space so the nav never hides content
    }
    .app-main:focus {
      outline: none;
    }

    .bottom-nav {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 5;
      display: flex;
      background: var(--color-surface);
      border-top: 1px solid var(--color-border);
      box-shadow: 0 -4px 16px -8px rgb(27 38 33 / 0.18);
      padding-bottom: env(safe-area-inset-bottom);
    }
    @media (min-width: 900px) {
      .bottom-nav {
        left: 50%;
        right: auto;
        bottom: 1rem;
        width: 560px;
        transform: translateX(-50%);
        border: 1px solid var(--color-border);
        border-radius: 18px;
        overflow: hidden;
      }
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
    .bottom-nav .nav-button {
      flex: 1;
      flex-direction: column;
      min-height: 64px;
      border-radius: 0;
      background: transparent;
      color: var(--color-muted);
      font-weight: 600;
      font-size: 0.9rem;
    }
    .bottom-nav a.active {
      color: var(--color-primary-dark);
      box-shadow: inset 0 3px 0 var(--color-primary);
    }
    .nav-icon {
      margin-bottom: 0.15rem;
    }
  `,
})
export class App {
  readonly connectivity = inject(ConnectivityService);
  readonly updates = inject(AppUpdateService);
  readonly navigation = inject(NavigationIssue);
  readonly session = inject(SessionStore);
  readonly display = inject(DisplayService);
  // Injecting the sync service starts its triggers (network back, app visible, changes).
  readonly sync = inject(SyncService);
  private readonly dates = new DatePipe('es-CO');

  readonly syncText = computed(() => {
    const pending = this.sync.pending();
    const last = this.sync.lastSyncAt();
    switch (this.sync.state()) {
      case 'syncing':
        return 'Sincronizando…';
      case 'offline':
        return pending > 0
          ? `${pending} cambios se enviarán al volver la señal`
          : 'Sin señal: todo queda guardado aquí';
      case 'needs-login':
        return pending > 0
          ? `${pending} cambios esperan: ingresa para sincronizar`
          : 'Ingresa para sincronizar';
      case 'other-account':
        return 'Hay registros de otra cuenta en este equipo: no se envían con la tuya';
      case 'server-unreachable':
        return `No se pudo llegar al servidor · ${pending} pendientes, se reintentará`;
      default:
        if (pending > 0) return `${pending} cambios por sincronizar`;
        return last ? `✓ Todo sincronizado · ${this.dates.transform(last, 'h:mm a')}` : '✓ Al día';
    }
  });
}
