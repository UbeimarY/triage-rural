import { Injectable, computed, signal } from '@angular/core';

export type UserRole = 'promoter' | 'coordinator';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface LoginResponse {
  accessToken: string;
  expiresAt: string;
  user: SessionUser;
}

interface StoredSession {
  token: string;
  expiresAt: number;
  user: SessionUser;
}

const STORAGE_KEY = 'triage.session';

/**
 * Signed-in account. Registering patients works without a session (offline
 * first); a session is only needed to synchronize or to open the dashboard.
 * The token lasts days because promoters spend days in the field without signal.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly session = signal<StoredSession | null>(readStored());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isSignedIn = computed(() => this.session() !== null);
  readonly isCoordinator = computed(() => this.user()?.role === 'coordinator');
  readonly isPromoter = computed(() => this.user()?.role === 'promoter');
  readonly expiredNotice = signal(false);

  start(response: LoginResponse): void {
    const session = {
      token: response.accessToken,
      expiresAt: Date.parse(response.expiresAt),
      user: response.user,
    };
    this.session.set(session);
    this.expiredNotice.set(false);
    write(session);
  }

  end(): void {
    this.session.set(null);
    write(null);
  }

  expire(): void {
    if (!this.session()) return;
    this.end();
    this.expiredNotice.set(true);
  }
}

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredSession;
    if (typeof stored.token !== 'string' || stored.expiresAt <= Date.now()) return null;
    return stored;
  } catch {
    return null;
  }
}

function write(value: StoredSession | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the session does not survive a reload.
  }
}
