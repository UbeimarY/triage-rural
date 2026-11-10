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
  /** Null once it expired: the promoter keeps working, only syncing waits. */
  token: string | null;
  expiresAt: number;
  user: SessionUser;
}

const STORAGE_KEY = 'triage.session';

/**
 * Signed-in account. Every screen asks for one: the phone holds patient data, so
 * nobody browses it without signing in. Signing in needs signal once; after that
 * the session lives on the phone.
 *
 * When the token expires in the field (it lasts days, but promoters can spend
 * longer without signal) the promoter is not locked out of their own records:
 * the account stays, only the token goes, and syncing asks to sign in again.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly session = signal<StoredSession | null>(readStored());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  /** An account is on this phone, with or without a valid token. */
  readonly isSignedIn = computed(() => this.session() !== null);
  /** Signed in, but the token expired: sign in again to sync or open the dashboard. */
  readonly needsRenewal = computed(() => this.isSignedIn() && this.token() === null);
  readonly isCoordinator = computed(() => this.user()?.role === 'coordinator');
  readonly isPromoter = computed(() => this.user()?.role === 'promoter');
  readonly expiredNotice = computed(() => this.needsRenewal());

  start(response: LoginResponse): void {
    const session = {
      token: response.accessToken,
      expiresAt: Date.parse(response.expiresAt),
      user: response.user,
    };
    this.session.set(session);
    write(session);
  }

  end(): void {
    this.session.set(null);
    write(null);
  }

  /** The server refused the token: keep the account, drop the token. */
  expire(): void {
    const current = this.session();
    if (!current) return;
    const expired = { ...current, token: null };
    this.session.set(expired);
    write(expired);
  }
}

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredSession;
    if (!stored.user || typeof stored.user.id !== 'string') return null;
    const valid = typeof stored.token === 'string' && stored.expiresAt > Date.now();
    return valid ? stored : { ...stored, token: null };
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
