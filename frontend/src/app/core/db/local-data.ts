import { inject, Injectable } from '@angular/core';
import { OWNER_KEY } from '../sync/sync.service';
import { TRIAGE_DB } from './triage-db';

export interface LocalDataState {
  /** Changes not yet accepted by the server, including ones waiting for a decision. */
  unsent: number;
  /** Patients stored on this phone. */
  patients: number;
}

/**
 * What the phone holds, and wiping it when an account leaves. Records are only
 * erased once the server has them, so signing out never loses a visit.
 */
@Injectable({ providedIn: 'root' })
export class LocalData {
  private readonly db = inject(TRIAGE_DB);

  async state(): Promise<LocalDataState> {
    const [outbox, conflicts, patients] = await Promise.all([
      this.db.outbox.count(),
      this.db.conflicts.count(),
      this.db.patients.count(),
    ]);
    return { unsent: outbox + conflicts, patients };
  }

  /** Erases every record on the phone. Refuses while anything is still unsent. */
  async clearSynced(): Promise<void> {
    const { db } = this;
    await db.transaction(
      'rw',
      [db.patients, db.encounters, db.assessments, db.outbox, db.conflicts],
      async () => {
        const unsent = (await db.outbox.count()) + (await db.conflicts.count());
        if (unsent > 0) throw new UnsentRecordsError(unsent);
        await Promise.all([db.patients.clear(), db.encounters.clear(), db.assessments.clear()]);
      },
    );
    try {
      localStorage.removeItem(OWNER_KEY);
    } catch {
      // Storage blocked: the owner check simply finds nothing to compare.
    }
  }
}

export class UnsentRecordsError extends Error {
  constructor(readonly unsent: number) {
    super(`${unsent} records have not reached the server`);
  }
}
