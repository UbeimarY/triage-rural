import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/**
 * Tracks the browser's network status.
 * Note: navigator.onLine only means the device has a network connection,
 * not that our backend is reachable. The sync engine (step 11) will verify that.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  readonly online = signal(navigator.onLine);

  constructor() {
    const update = () => this.online.set(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    });
  }
}
