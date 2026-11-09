import { Injectable, signal } from '@angular/core';

/**
 * Screens are separate files loaded on demand. Without signal, one that was never
 * downloaded cannot open: instead of a button that does nothing, the app says why.
 */
@Injectable({ providedIn: 'root' })
export class NavigationIssue {
  readonly missingScreen = signal(false);

  report(error: unknown): void {
    const text = String((error as Error)?.message ?? error);
    if (/dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(text)) {
      this.missingScreen.set(true);
    }
  }
}
