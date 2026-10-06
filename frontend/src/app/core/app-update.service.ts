import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * Detects when the service worker has downloaded a new app version.
 * The new version is only applied after a reload, so we let the user decide when.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  readonly updateAvailable = signal(false);

  constructor() {
    if (!this.swUpdate.isEnabled) {
      return; // dev mode: the service worker is disabled
    }

    this.swUpdate.versionUpdates
      .pipe(
        filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.updateAvailable.set(true));

    // If the cached version is broken and cannot be recovered, reload to get a clean one
    this.swUpdate.unrecoverable.pipe(takeUntilDestroyed()).subscribe(() => document.location.reload());
  }

  applyUpdate(): void {
    document.location.reload();
  }
}
