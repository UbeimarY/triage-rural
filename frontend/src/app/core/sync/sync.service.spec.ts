import { TestBed } from '@angular/core/testing';

import { ApiClient, ApiError } from '../api/api-client';
import { SessionStore } from '../auth/session.store';
import { EncounterRepository } from '../db/encounter.repository';
import { TRIAGE_DB, TriageDatabase } from '../db/triage-db';
import { NO_ALARMS } from '../triage/alarm-signs';
import { SyncService } from './sync.service';

type Push = (body: { operations: { id: string; entity: string }[] }) => unknown;

describe('SyncService', () => {
  let db: TriageDatabase;
  let push: Push;

  beforeEach(() => {
    localStorage.clear();
    db = new TriageDatabase(`sync-${Math.random()}`);
    push = () => ({ results: [] });
    TestBed.configureTestingModule({
      providers: [
        { provide: TRIAGE_DB, useValue: db },
        {
          provide: ApiClient,
          useValue: {
            post: (_path: string, body: Parameters<Push>[0]) =>
              Promise.resolve().then(() => push(body)),
          },
        },
      ],
    });
    TestBed.inject(SessionStore).start({
      accessToken: 'token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: { id: 'promoter-1', email: 'ana@test.co', fullName: 'Ana', role: 'promoter' },
    });
  });

  afterEach(async () => {
    await db.delete();
  });

  async function registerVisit() {
    return TestBed.inject(EncounterRepository).registerVisit({
      birthYear: 1980,
      sex: 'female',
      community: 'Vereda El Encano',
      symptoms: 'Fiebre desde ayer',
      alarms: NO_ALARMS,
      consentGiven: true,
    });
  }

  const answer =
    (status: string, extra: Record<string, unknown> = {}): Push =>
    (body) => ({
      results: body.operations.map((operation) => ({
        operationId: operation.id,
        status,
        code: null,
        serverVersion: null,
        serverRecord: null,
        ...extra,
      })),
    });

  it('empties the outbox and marks records as synced when the server applies them', async () => {
    const { patient, encounter } = await registerVisit();
    push = answer('applied');

    await TestBed.inject(SyncService).syncNow();

    expect(await db.outbox.count()).toBe(0);
    expect((await db.patients.get(patient.id))?.syncStatus).toBe('synced');
    expect((await db.encounters.get(encounter.id))?.syncStatus).toBe('synced');
  });

  it('marks a visit synced only once its priority and review reach the server', async () => {
    const repository = TestBed.inject(EncounterRepository);
    const { encounter } = await registerVisit();
    await repository.saveAssessment(encounter.id, encounter.version, {
      priority: 'medium',
      source: 'model',
      triggeredAlarms: [],
      reasonCodes: ['MODEL_PREDICTION'],
      modelVersion: 'triage-text-v1',
      elapsedMs: 3,
    });
    await repository.reviewAssessment(encounter.id, encounter.version, 'medium', '');

    // First upload: the visit arrives, the assessment operations must wait.
    push = (body) => ({
      results: body.operations.map((operation) => ({
        operationId: operation.id,
        status: operation.entity === 'assessment' ? 'retry' : 'applied',
        code: null,
        serverVersion: null,
        serverRecord: null,
      })),
    });
    const sync = TestBed.inject(SyncService);
    await sync.syncNow();
    expect((await db.encounters.get(encounter.id))?.syncStatus).toBe('pending');

    // Second upload: they arrive too, so the visit is now synced.
    push = answer('applied');
    await sync.syncNow();
    expect(await db.outbox.count()).toBe(0);
    expect((await db.encounters.get(encounter.id))?.syncStatus).toBe('synced');

    // A later review makes it pending again until it is uploaded.
    await repository.reviewAssessment(encounter.id, encounter.version, 'high', '');
    expect((await db.encounters.get(encounter.id))?.syncStatus).toBe('pending');
  });

  it('keeps operations the server asks to retry', async () => {
    await registerVisit();
    push = answer('retry', { code: 'PATIENT_NOT_FOUND' });

    await TestBed.inject(SyncService).syncNow();

    const operations = await db.outbox.toArray();
    expect(operations).toHaveLength(2);
    expect(operations.every((operation) => operation.attempts === 1)).toBe(true);
  });

  it('stores a conflict for the promoter instead of overwriting', async () => {
    const { encounter } = await registerVisit();
    const serverRecord = {
      symptoms: 'Versión del servidor',
      alarms: NO_ALARMS,
      updatedAt: new Date().toISOString(),
      version: 2,
    };
    push = answer('conflict', { code: 'VERSION_CONFLICT', serverVersion: 2, serverRecord });

    await TestBed.inject(SyncService).syncNow();

    expect((await db.conflicts.get(encounter.id))?.serverRecord.symptoms).toBe(
      'Versión del servidor',
    );
    expect((await db.encounters.get(encounter.id))?.syncStatus).toBe('error');
  });

  it('stops resending an operation the server rejected for good', async () => {
    await registerVisit();
    push = answer('rejected', { code: 'VALIDATION_FAILED' });
    const sync = TestBed.inject(SyncService);
    await sync.syncNow();

    let calls = 0;
    push = (body) => {
      calls++;
      return answer('applied')(body);
    };
    await sync.syncNow();

    expect(calls).toBe(0);
    expect(
      (await db.outbox.toArray()).every(
        (operation) => operation.rejectedCode === 'VALIDATION_FAILED',
      ),
    ).toBe(true);
  });

  it('keeps everything when the server cannot be reached', async () => {
    await registerVisit();
    push = () => {
      throw new ApiError(0, 'NETWORK_UNAVAILABLE');
    };
    const sync = TestBed.inject(SyncService);

    await sync.syncNow();

    expect(await db.outbox.count()).toBe(2);
    expect(sync.state()).toBe('server-unreachable');
  });

  it("refuses to upload another account's pending records", async () => {
    localStorage.setItem('triage.device-owner', 'someone-else');
    await registerVisit();
    const sync = TestBed.inject(SyncService);

    await sync.syncNow();

    expect(sync.state()).toBe('other-account');
    expect(await db.outbox.count()).toBe(2);
  });

  it('resolves a conflict by resending the local version on top of the server one', async () => {
    const { encounter } = await registerVisit();
    const serverRecord = {
      symptoms: 'Servidor',
      alarms: NO_ALARMS,
      updatedAt: new Date().toISOString(),
      version: 3,
    };
    // The patient is applied; only the visit conflicts, as the real server does.
    push = (body) => ({
      results: body.operations.map((operation) =>
        operation.entity === 'encounter'
          ? {
              operationId: operation.id,
              status: 'conflict',
              code: 'VERSION_CONFLICT',
              serverVersion: 3,
              serverRecord,
            }
          : {
              operationId: operation.id,
              status: 'applied',
              code: null,
              serverVersion: null,
              serverRecord: null,
            },
      ),
    });
    await TestBed.inject(SyncService).syncNow();

    const kept = await TestBed.inject(EncounterRepository).resolveKeepMine(encounter.id);

    expect(kept.version).toBe(4);
    const [update] = await db.outbox.toArray();
    expect(update.baseVersion).toBe(3);
    expect(await db.conflicts.count()).toBe(0);
  });
});
