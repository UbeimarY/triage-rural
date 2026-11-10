import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { liveQuery } from 'dexie';

import { ApiClient, ApiError } from '../api/api-client';
import { SessionStore } from '../auth/session.store';
import { ConnectivityService } from '../connectivity.service';
import { OutboxOperation, SyncConflict } from '../db/models';
import { TRIAGE_DB } from '../db/triage-db';

const BATCH_SIZE = 50;
const PERIODIC_MS = 60_000;
export const OWNER_KEY = 'triage.device-owner';

type ResultStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected' | 'retry';

interface OperationResult {
  operationId: string;
  status: ResultStatus;
  code: string | null;
  serverVersion: number | null;
  serverRecord: SyncConflict['serverRecord'] | null;
}

export type SyncState =
  'idle' | 'syncing' | 'offline' | 'needs-login' | 'other-account' | 'server-unreachable';

/**
 * Sends the outbox to the server and applies each answer.
 *
 * When it runs: on start, when the network comes back, when the app becomes
 * visible, every minute while open, and shortly after any local change.
 * Background Sync only exists in Chromium browsers, so these triggers are the
 * reliable plan for every browser; nothing runs while the app is closed.
 *
 * What each answer means:
 *  applied / duplicate -> the server has it: delete the operation.
 *  retry               -> a dependency has not arrived yet: keep it for next time.
 *  conflict            -> keep both copies and ask the promoter.
 *  rejected            -> the server will never accept it: stop sending it, show an error.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly db = inject(TRIAGE_DB);
  private readonly api = inject(ApiClient);
  private readonly session = inject(SessionStore);
  private readonly connectivity = inject(ConnectivityService);

  readonly state = signal<SyncState>('idle');
  readonly lastSyncAt = signal<string | null>(readLastSync());
  readonly pending = signal(0);
  readonly isBusy = computed(() => this.state() === 'syncing');

  private running: Promise<void> | null = null;
  private debounce: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Any local change (new visit, edit, review) schedules a sync a moment later.
    const subscription = liveQuery(() => this.countSendable()).subscribe((count) => {
      const grew = count > this.pending();
      this.pending.set(count);
      if (grew) this.schedule(2000);
    });

    const onVisible = () => document.visibilityState === 'visible' && this.schedule(0);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => this.schedule(0), PERIODIC_MS);

    // Network lost: say so at once. Back online or freshly signed in: try right away.
    effect(() => {
      const online = this.connectivity.online();
      const signedIn = this.session.token() !== null;
      if (!online) {
        if (untracked(this.state) !== 'syncing') this.state.set('offline');
      } else if (signedIn) {
        this.schedule(0);
      } else {
        this.state.set('needs-login');
      }
    });

    destroyRef.onDestroy(() => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
      clearTimeout(this.debounce);
    });
  }

  /** Runs a sync now; concurrent calls share the same run. */
  syncNow(): Promise<void> {
    this.running ??= this.run().finally(() => (this.running = null));
    return this.running;
  }

  private schedule(delayMs: number): void {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.syncNow(), delayMs);
  }

  private async run(): Promise<void> {
    if (!this.connectivity.online()) return this.state.set('offline');
    const user = this.session.user();
    if (!user || !this.session.token()) return this.state.set('needs-login');

    // Records on this phone belong to whoever synchronized first. Uploading them
    // under another account would assign patients to the wrong promoter.
    const owner = readOwner();
    if (owner && owner !== user.id && (await this.countSendable()) > 0) {
      return this.state.set('other-account');
    }

    this.state.set('syncing');
    try {
      for (;;) {
        const batch = await this.nextBatch();
        if (batch.length === 0) break;
        const { results } = await this.api.post<{ results: OperationResult[] }>('/sync/push', {
          operations: batch,
        });
        writeOwner(user.id);
        const progressed = await this.applyResults(batch, results);
        if (!progressed) break; // only retries left: wait for the next trigger
      }
      const now = new Date().toISOString();
      this.lastSyncAt.set(now);
      writeLastSync(now);
      this.state.set('idle');
    } catch (error) {
      // The outbox stays intact: the next trigger retries from where it stopped.
      const expired = error instanceof ApiError && error.status === 401;
      this.state.set(expired ? 'needs-login' : 'server-unreachable');
    }
  }

  private async nextBatch(): Promise<OutboxOperation[]> {
    const operations = await this.db.outbox.orderBy('createdAt').toArray();
    return operations.filter((operation) => !operation.rejectedCode).slice(0, BATCH_SIZE);
  }

  private countSendable(): Promise<number> {
    return this.db.outbox.filter((operation) => !operation.rejectedCode).count();
  }

  /** Applies the server's answers atomically. Returns true if anything left the outbox. */
  async applyResults(batch: OutboxOperation[], results: OperationResult[]): Promise<boolean> {
    const byId = new Map(batch.map((operation) => [operation.id, operation]));
    let progressed = false;

    await this.db.transaction(
      'rw',
      [this.db.outbox, this.db.patients, this.db.encounters, this.db.conflicts],
      async () => {
        const touched = new Set<OutboxOperation>();
        for (const result of results) {
          const operation = byId.get(result.operationId);
          if (!operation) continue;
          touched.add(operation);

          switch (result.status) {
            case 'applied':
            case 'duplicate':
              await this.db.outbox.delete(operation.id);
              progressed = true;
              break;
            case 'retry':
              await this.db.outbox.update(operation.id, { attempts: operation.attempts + 1 });
              break;
            case 'conflict':
              await this.db.outbox.delete(operation.id);
              await this.db.conflicts.put({
                encounterId: operation.entityId,
                serverVersion: result.serverVersion ?? 0,
                serverRecord: result.serverRecord!,
                detectedAt: new Date().toISOString(),
              });
              progressed = true;
              break;
            case 'rejected':
              await this.db.outbox.update(operation.id, {
                attempts: operation.attempts + 1,
                rejectedCode: result.code ?? 'REJECTED',
              });
              break;
          }
        }
        for (const operation of touched) await this.refreshStatus(operation);
      },
    );
    return progressed;
  }

  /**
   * A record is synced once none of its operations is waiting, failed or in conflict.
   * An assessment belongs to its visit (same id), so it updates the visit's status:
   * the visit is not "synced" until its priority and review are on the server too.
   */
  private async refreshStatus(operation: OutboxOperation): Promise<void> {
    const remaining = await this.db.outbox.where('entityId').equals(operation.entityId).toArray();
    const conflict =
      operation.entity === 'patient' ? undefined : await this.db.conflicts.get(operation.entityId);
    const status =
      conflict || remaining.some((pending) => pending.rejectedCode)
        ? 'error'
        : remaining.length > 0
          ? 'pending'
          : 'synced';
    if (operation.entity === 'patient') {
      await this.db.patients.update(operation.entityId, { syncStatus: status });
    } else {
      await this.db.encounters.update(operation.entityId, { syncStatus: status });
    }
  }
}

/** The account whose records are on this phone, once it synchronized. */
export function deviceOwner(): string | null {
  return readOwner();
}

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(userId: string): void {
  try {
    localStorage.setItem(OWNER_KEY, userId);
  } catch {
    // Storage unavailable: nothing else to do.
  }
}

function readLastSync(): string | null {
  try {
    return localStorage.getItem('triage.last-sync');
  } catch {
    return null;
  }
}

function writeLastSync(value: string): void {
  try {
    localStorage.setItem('triage.last-sync', value);
  } catch {
    // Storage unavailable.
  }
}
