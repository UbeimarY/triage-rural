import { Injectable, inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { SessionStore } from '../auth/session.store';

/** A failed request. `status` 0 means the server could not be reached at all. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

/**
 * Minimal JSON client for the triage API. Uses fetch directly: no extra
 * dependencies, and it works the same inside tests.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly session = inject(SessionStore);

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = this.session.token();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetch(`${environment.apiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // No signal, DNS failure or server down: navigator.onLine cannot tell them apart.
      throw new ApiError(0, 'NETWORK_UNAVAILABLE');
    }

    if (!response.ok) {
      const code = await response
        .json()
        .then((data: { code?: string }) => data.code ?? 'UNKNOWN_ERROR')
        .catch(() => 'UNKNOWN_ERROR');
      if (response.status === 401 && token) this.session.expire();
      throw new ApiError(response.status, code);
    }
    return (await response.json()) as T;
  }
}

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'El correo o la contraseña no son correctos.',
  SESSION_EXPIRED: 'Tu sesión terminó. Vuelve a ingresar para sincronizar.',
  AUTHENTICATION_REQUIRED: 'Ingresa con tu cuenta para continuar.',
  FORBIDDEN: 'Tu cuenta no tiene permiso para esta acción.',
  VALIDATION_FAILED: 'Revisa los datos del formulario.',
  NETWORK_UNAVAILABLE: 'No hay conexión con el servidor. Inténtalo cuando tengas señal.',
};

/** The backend sends stable codes; the interface owns the Spanish wording. */
export function describeApiError(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'UNKNOWN_ERROR';
  return MESSAGES[code] ?? 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}
