import { TestBed } from '@angular/core/testing';
import { LoginResponse, SessionStore } from './session.store';

const LOGIN: LoginResponse = {
  accessToken: 'token-1',
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  user: { id: 'u1', email: 'ana@vereda.co', fullName: 'Ana Pantoja', role: 'promoter' },
};

describe('SessionStore', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the account when the server refuses the token, so work continues offline', () => {
    const session = TestBed.inject(SessionStore);
    session.start(LOGIN);

    session.expire();

    expect(session.isSignedIn()).toBe(true);
    expect(session.token()).toBeNull();
    expect(session.needsRenewal()).toBe(true);
    expect(session.user()?.fullName).toBe('Ana Pantoja');
  });

  it('restores an expired session without its token', () => {
    localStorage.setItem(
      'triage.session',
      JSON.stringify({ token: 'old', expiresAt: Date.now() - 1000, user: LOGIN.user }),
    );

    const session = TestBed.inject(SessionStore);

    expect(session.isSignedIn()).toBe(true);
    expect(session.token()).toBeNull();
  });

  it('forgets the account on sign out', () => {
    const session = TestBed.inject(SessionStore);
    session.start(LOGIN);

    session.end();

    expect(session.isSignedIn()).toBe(false);
    expect(localStorage.getItem('triage.session')).toBeNull();
  });
});
