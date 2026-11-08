import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { App } from './app';
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

  it('should always show the synchronization state', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Al día');
  });
});
