import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../core/auth/session.store';
import { ConnectivityService } from '../../core/connectivity.service';
import { LocalData, LocalDataState } from '../../core/db/local-data';
import { SyncService } from '../../core/sync/sync.service';

/**
 * Signing out of a shared phone. Patient records leave the phone with the account,
 * but only once the server has every one of them: nothing is lost by signing out.
 */
@Component({
  selector: 'app-sign-out-page',
  imports: [RouterLink],
  template: `
    <h1>Salir</h1>

    @if (local(); as data) {
      @if (data.unsent > 0) {
        <section class="card blocked" aria-labelledby="blocked-title">
          <h2 id="blocked-title">
            {{
              data.unsent === 1
                ? 'Queda 1 cambio sin enviar'
                : 'Quedan ' + data.unsent + ' cambios sin enviar'
            }}
          </h2>
          <p>
            Para salir, el servidor tiene que recibirlos primero. Así ningún registro se pierde
            cuando se borren de este teléfono.
          </p>
          @if (session.needsRenewal()) {
            <p>Tu sesión venció: ingresa de nuevo y se enviarán solos.</p>
            <a class="button" routerLink="/login">Ingresar de nuevo</a>
          } @else if (connectivity.online()) {
            <button type="button" (click)="syncThenCheck()" [disabled]="sync.isBusy()">
              {{ sync.isBusy() ? 'Enviando…' : 'Enviar ahora' }}
            </button>
          } @else {
            <p class="muted">Estás sin señal. Cuando vuelva, se envían solos.</p>
          }
          <a routerLink="/today">Volver sin salir</a>
        </section>
      } @else {
        <section class="card" aria-labelledby="ready-title">
          <h2 id="ready-title">Todo está en el servidor</h2>
          @if (data.patients > 0) {
            <p>
              Al salir se borran de este teléfono los
              {{
                data.patients === 1
                  ? 'datos de 1 paciente'
                  : 'datos de ' + data.patients + ' pacientes'
              }}. Siguen guardados en el servidor, donde la coordinación les hace seguimiento.
            </p>
          } @else {
            <p>En este teléfono no hay registros de pacientes.</p>
          }
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <div class="actions">
            <a class="button secondary" routerLink="/">Cancelar</a>
            <button type="button" (click)="signOut()" [disabled]="leaving()">
              {{ leaving() ? 'Saliendo…' : exitLabel() }}
            </button>
          </div>
        </section>
      }
    } @else {
      <p class="muted">Revisando qué hay en este teléfono…</p>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 560px;
      margin: 0 auto;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1.25rem;
    }
    .card h2,
    .card p {
      margin: 0;
    }
    .blocked {
      border-left: 6px solid var(--priority-medium);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .muted {
      color: var(--color-muted);
    }
    .error {
      color: var(--color-danger);
      font-weight: 600;
    }
  `,
})
export class SignOutPage {
  readonly session = inject(SessionStore);
  readonly connectivity = inject(ConnectivityService);
  readonly sync = inject(SyncService);
  private readonly data = inject(LocalData);
  private readonly router = inject(Router);

  readonly local = signal<LocalDataState | null>(null);
  readonly leaving = signal(false);
  readonly error = signal<string | null>(null);
  readonly exitLabel = computed(() =>
    (this.local()?.patients ?? 0) > 0 ? 'Salir y borrar del teléfono' : 'Salir',
  );

  constructor() {
    void this.check();
  }

  async syncThenCheck(): Promise<void> {
    await this.sync.syncNow();
    await this.check();
  }

  async signOut(): Promise<void> {
    this.leaving.set(true);
    this.error.set(null);
    try {
      await this.data.clearSynced();
      this.session.end();
      await this.router.navigateByUrl('/login');
    } catch {
      // Something arrived meanwhile (another tab, a late edit): show it instead.
      this.error.set('Hay cambios nuevos sin enviar. Revisa antes de salir.');
      await this.check();
    } finally {
      this.leaving.set(false);
    }
  }

  private async check(): Promise<void> {
    this.local.set(await this.data.state());
  }
}
