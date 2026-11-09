import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { ApiClient, describeApiError } from '../../core/api/api-client';
import { LoginResponse, SessionStore } from '../../core/auth/session.store';
import { ConnectivityService } from '../../core/connectivity.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  template: `
    <h1>Ingresar</h1>
    <p class="lede">
      Puedes registrar pacientes sin cuenta y sin señal. Ingresa para sincronizar los registros con
      el servidor o, si eres coordinador, para ver el panel de seguimiento.
    </p>

    @if (session.expiredNotice()) {
      <p class="notice" role="status">Tu sesión terminó. Ingresa de nuevo para sincronizar.</p>
    }
    @if (!connectivity.online()) {
      <p class="notice" role="status">
        Necesitas conexión para ingresar. Tus registros siguen guardados.
      </p>
    }

    <form class="card form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <label for="email">Correo electrónico</label>
      <input id="email" type="email" formControlName="email" autocomplete="username" />

      <label for="password">Contraseña</label>
      <input
        id="password"
        type="password"
        formControlName="password"
        autocomplete="current-password"
      />

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      <button type="submit" [disabled]="submitting() || !connectivity.online()">
        {{ submitting() ? 'Ingresando…' : 'Ingresar' }}
      </button>
    </form>

    <p class="hint">
      Las cuentas las crea la organización de salud: este sistema maneja datos sensibles y no tiene
      registro público.
    </p>
  `,
  styles: `
    :host {
      display: block;
      max-width: 720px;
      margin: 0 auto;
    }
    .lede,
    .hint {
      color: var(--color-muted);
    }
    .hint {
      font-size: 0.9rem;
      margin-top: 1rem;
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .form button {
      margin-top: 0.75rem;
    }
    .notice {
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
  `,
})
export class LoginPage {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  readonly session = inject(SessionStore);
  readonly connectivity = inject(ConnectivityService);

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.error.set('Escribe tu correo y tu contraseña.');
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      const response = await this.api.post<LoginResponse>('/auth/login', this.form.getRawValue());
      this.session.start(response);
      await this.router.navigateByUrl(
        response.user.role === 'coordinator' ? '/dashboard' : '/patients',
      );
    } catch (caught) {
      this.error.set(describeApiError(caught));
    } finally {
      this.submitting.set(false);
    }
  }
}
