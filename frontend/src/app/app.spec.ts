import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { App } from './app';
import { SessionStore } from './core/auth/session.store';
import { SyncService } from './core/sync/sync.service';

/** The shell test isolates the layout from the real sync engine and its timers. */
const syncStub = {
  state: signal('idle'),
  pending: signal(0),
  lastSyncAt: signal<string | null>(null),
  isBusy: computed(() => false),
  syncNow: () => Promise.resolve(),
};

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideServiceWorker('ngsw-worker.js', { enabled: false }),
        { provide: SyncService, useValue: syncStub },
      ],
    }).compileComponents();
  });

  it('should create the app shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should always show the safety notice', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('no es un diagnóstico');
  });

  it('shows the synchronization state and the navigation once signed in', async () => {
    TestBed.inject(SessionStore).start({
      accessToken: 't',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: { id: 'u1', email: 'ana@vereda.co', fullName: 'Ana Pantoja', role: 'promoter' },
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Al día');
    expect(text).toContain('Salir (Ana)');
  });

  it('shows no navigation before signing in', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('nav')).toBeNull();
  });
});
