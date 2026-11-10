import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'triage.display';

/**
 * "Modo sol": black on white, larger text and thicker borders, for reading the
 * phone outdoors at noon. It is remembered on this phone only.
 */
@Injectable({ providedIn: 'root' })
export class DisplayService {
  readonly sun = signal(readStored());

  constructor() {
    this.apply(this.sun());
  }

  toggleSun(): void {
    const next = !this.sun();
    this.sun.set(next);
    this.apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'sun' : 'normal');
    } catch {
      // Private mode or blocked storage: the choice lasts until the page closes.
    }
  }

  private apply(sun: boolean): void {
    if (typeof document === 'undefined') return;
    if (sun) document.documentElement.dataset['display'] = 'sun';
    else delete document.documentElement.dataset['display'];
  }
}

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'sun';
  } catch {
    return false;
  }
}
