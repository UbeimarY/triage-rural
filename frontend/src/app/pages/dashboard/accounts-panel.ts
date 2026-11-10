import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiClient, ApiError, describeApiError } from '../../core/api/api-client';

interface Account {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  visits: number;
}

/** Coordinators open promoter accounts here; the password is handed over in person. */
@Component({
  selector: 'app-accounts-panel',
  imports: [DatePipe, ReactiveFormsModule],
  template: `
    <section class="card" aria-labelledby="accounts-title">
      <h2 id="accounts-title">Promotores</h2>

      @if (accounts().length) {
        <ul class="accounts">
          @for (account of accounts(); track account.id) {
            <li>
              <span>
                <strong>{{ account.fullName }}</strong>
                <small>{{ account.email }} · desde {{ account.createdAt | date: 'd MMM y' }}</small>
              </span>
              <span class="num">{{ account.visits }} visitas</span>
            </li>
          }
        </ul>
      } @else if (!loading()) {
        <p class="muted">Aún no hay cuentas de promotor.</p>
      }

      @if (created(); as done) {
        <p class="created" role="status">
          Cuenta creada para {{ done.fullName }}. Entrégale en persona el correo
          <strong>{{ done.email }}</strong> y la contraseña <code>{{ done.password }}</code
          >: no se volverá a mostrar.
        </p>
      }

      @if (open()) {
        <form [formGroup]="form" (ngSubmit)="create()" novalidate class="new">
          <label for="fullName">Nombre completo</label>
          <input id="fullName" formControlName="fullName" autocomplete="off" />
          <label for="email">Correo</label>
          <input id="email" type="email" formControlName="email" autocomplete="off" />
          <label for="password">Contraseña inicial (12 caracteres o más)</label>
          <div class="password">
            <input id="password" formControlName="password" autocomplete="new-password" />
            <button type="button" class="secondary" (click)="suggestPassword()">Generar</button>
          </div>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <div class="actions">
            <button type="button" class="secondary" (click)="open.set(false)">Cancelar</button>
            <button type="submit" [disabled]="saving()">
              {{ saving() ? 'Creando…' : 'Crear cuenta' }}
            </button>
          </div>
        </form>
      } @else {
        <button type="button" (click)="start()">Crear cuenta de promotor</button>
      }
    </section>
  `,
  styles: `
    h2 {
      font-size: 1.05rem;
      margin-bottom: 0.5rem;
    }
    .accounts {
      margin: 0 0 0.75rem;
      padding: 0;
      list-style: none;
    }
    .accounts li {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.45rem 0;
      border-bottom: 1px solid var(--color-border);
    }
    .accounts small {
      display: block;
      color: var(--color-muted);
      overflow-wrap: anywhere;
    }
    .num {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      color: var(--color-muted);
    }
    .new {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    label {
      font-weight: 600;
      margin-top: 0.35rem;
    }
    .password {
      display: flex;
      gap: 0.5rem;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
    .secondary {
      background: var(--color-surface);
      color: var(--color-primary-dark);
      border: 1px solid var(--color-primary);
    }
    .created {
      padding: 0.6rem 0.75rem;
      border-radius: var(--radius);
      background: var(--priority-low-bg);
      color: var(--priority-low);
    }
    code {
      font-size: 1rem;
      font-weight: 700;
      user-select: all;
    }
    .error {
      margin: 0;
      color: var(--color-danger);
      font-weight: 600;
    }
    .muted {
      color: var(--color-muted);
    }
  `,
})
export class AccountsPanel {
  private readonly api = inject(ApiClient);
  private readonly fb = inject(FormBuilder);

  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(true);
  readonly open = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly created = signal<{ fullName: string; email: string; password: string } | null>(null);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
  });

  constructor() {
    void this.load();
  }

  start(): void {
    this.created.set(null);
    this.error.set(null);
    this.form.reset();
    this.suggestPassword();
    this.open.set(true);
  }

  /** Easy to dictate: lowercase words of letters and digits, without look-alike characters. */
  suggestPassword(): void {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(15));
    const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
    this.form.controls.password.setValue(
      `${chars.slice(0, 5).join('')}-${chars.slice(5, 10).join('')}-${chars.slice(10).join('')}`,
    );
  }

  async create(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa el nombre, el correo y que la contraseña tenga 12 caracteres.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();
    try {
      const account = await this.api.post<Account>('/accounts', value);
      this.created.set({
        fullName: account.fullName,
        email: account.email,
        password: value.password,
      });
      this.open.set(false);
      await this.load();
    } catch (caught) {
      this.error.set(
        caught instanceof ApiError && caught.code === 'EMAIL_TAKEN'
          ? 'Ya existe una cuenta con ese correo.'
          : describeApiError(caught),
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      this.accounts.set(await this.api.get<Account[]>('/accounts'));
    } catch {
      // The dashboard already explains connection problems.
    } finally {
      this.loading.set(false);
    }
  }
}
