import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ApiClient, describeApiError } from '../../core/api/api-client';
import { LoginResponse, SessionStore } from '../../core/auth/session.store';
import { ConnectivityService } from '../../core/connectivity.service';
import { LocalData } from '../../core/db/local-data';
import { deviceOwner } from '../../core/sync/sync.service';

/**
 * The first screen. Signing in needs signal once; after that the app works offline.
 * When the token expired in the field it greets the same promoter and lets them
 * keep working without signing in, since only syncing needs the server.
 */
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="welcome" aria-labelledby="login-title">
      <svg class="ridge" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 96 L46 70 L82 84 L130 40 L168 66 L214 22 L262 62 L300 48 L346 76 L400 58" />
        <path d="M0 112 L60 92 L112 102 L170 76 L228 96 L284 80 L340 98 L400 86" />
      </svg>
      @if (returning(); as name) {
        <h1 id="login-title">Hola de nuevo, {{ name }}</h1>
        <p>
          Tu sesión venció. Ingresa otra vez para enviar tus registros al servidor. Mientras tanto
          siguen guardados en este teléfono.
        </p>
      } @else {
        <h1 id="login-title">Ingresa para empezar</h1>
        <p>
          Registra y prioriza pacientes en la vereda, con o sin señal. Solo necesitas internet la
          primera vez que ingresas.
        </p>
      }
    </section>

    @if (!connectivity.online()) {
      <p class="notice" role="status">Estás sin conexión. Para ingresar necesitas señal una vez.</p>
    }

    <form class="card form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <label for="email">Correo electrónico</label>
      <input id="email" type="email" formControlName="email" autocomplete="username" />

      <label for="password">Contraseña</label>
      <div class="password">
        <input
          id="password"
          [type]="showPassword() ? 'text' : 'password'"
          formControlName="password"
          autocomplete="current-password"
        />
        <button
          type="button"
          class="secondary"
          [attr.aria-pressed]="showPassword()"
          (click)="showPassword.set(!showPassword())"
        >
          {{ showPassword() ? 'Ocultar' : 'Mostrar' }}
        </button>
      </div>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      <button type="submit" [disabled]="submitting() || !connectivity.online()">
        {{ submitting() ? 'Ingresando…' : 'Ingresar' }}
      </button>
    </form>

    @if (returning() && session.isPromoter()) {
      <p class="later">
        <a routerLink="/today">Seguir sin sincronizar</a>
      </p>
    }

    <p class="hint">
      Las cuentas las crea la coordinación de salud: este sistema maneja datos sensibles y no tiene
      registro público.
    </p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-width: 480px;
      margin: 0 auto;
    }
    .welcome {
      position: relative;
      overflow: hidden;
      padding: 1.5rem 1.25rem 2.5rem;
      border-radius: calc(var(--radius) + 6px);
      background: var(--color-primary-dark);
      color: #fff;
    }
    .welcome h1 {
      position: relative;
      margin: 0 0 0.5rem;
      font-size: clamp(1.5rem, 6vw, 2rem);
    }
    .welcome p {
      position: relative;
      margin: 0;
      opacity: 0.92;
    }
    .ridge {
      position: absolute;
      inset: auto 0 0 0;
      width: 100%;
      height: 45%;
      pointer-events: none;
    }
    .ridge path {
      fill: none;
      stroke: rgb(255 255 255 / 0.16);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .form > button {
      margin-top: 0.75rem;
    }
    .password {
      display: flex;
      gap: 0.5rem;
    }
    .password input {
      flex: 1;
      min-width: 0;
    }
    .notice {
      margin: 0;
      padding: 0.7rem 1rem;
      border-radius: var(--radius);
      background: var(--priority-medium-bg);
      color: var(--priority-medium);
      font-weight: 600;
    }
    .error {
      color: var(--color-danger);
      font-weight: 600;
      margin: 0.25rem 0 0;
    }
    .later {
      margin: 0;
      text-align: center;
    }
    .hint {
      margin: 0;
      color: var(--color-muted);
      font-size: 0.9rem;
    }
  `,
})
export class LoginPage {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly local = inject(LocalData);
  readonly session = inject(SessionStore);
  readonly connectivity = inject(ConnectivityService);

  readonly form = inject(NonNullableFormBuilder).group({
    email: [this.session.user()?.email ?? '', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly error = signal<string | null>(null);
  /** First name of the account whose token expired, to greet them by name. */
  readonly returning = computed(() =>
    this.session.needsRenewal() ? this.session.user()!.fullName.split(' ')[0] : null,
  );

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.error.set('Escribe tu correo y tu contraseña.');
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      const response = await this.api.post<LoginResponse>('/auth/login', this.form.getRawValue());
      if (!(await this.makeRoomFor(response.user.id))) return;
      this.session.start(response);
      await this.router.navigateByUrl(this.destination(response.user.role));
    } catch (caught) {
      this.error.set(describeApiError(caught));
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * A different person signing in on this phone must not see the previous
   * account's patients, nor upload them under their own name.
   */
  private async makeRoomFor(userId: string): Promise<boolean> {
    const previous = this.session.user()?.id ?? deviceOwner();
    if (!previous || previous === userId) return true;
    const { unsent } = await this.local.state();
    if (unsent > 0) {
      this.error.set(
        `Este teléfono tiene ${unsent} cambios de otra cuenta sin enviar. Esa persona debe ` +
          'ingresar y sincronizarlos antes de que otra cuenta use el teléfono.',
      );
      return false;
    }
    await this.local.clearSynced();
    this.session.end();
    return true;
  }

  private destination(role: 'promoter' | 'coordinator'): string {
    const back = this.route.snapshot.queryParamMap.get('volver');
    // Only paths inside the app, never an address somewhere else.
    if (back?.startsWith('/') && !back.startsWith('//') && role === 'promoter') return back;
    return role === 'coordinator' ? '/dashboard' : '/today';
  }
}
