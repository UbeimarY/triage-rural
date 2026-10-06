import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { NO_ALARMS } from '../triage/alarm-signs';
import { EncounterRepository, NewVisitInput } from './encounter.repository';
import { TriageResult } from './models';
import { TRIAGE_DB, TriageDatabase } from './triage-db';

const visitInput: NewVisitInput = {
  birthYear: 1980,
  sex: 'female',
  community: 'Vereda El Encano',
  symptoms: 'Fiebre y dolor de cabeza desde ayer',
  alarms: NO_ALARMS,
  consentGiven: true,
};

const sampleResult: TriageResult = {
  priority: 'medium',
  source: 'rules',
  triggeredAlarms: [],
  reasonCodes: ['NO_ALARM_SIGNS'],
  modelVersion: null,
  elapsedMs: 1,
};

describe('EncounterRepository', () => {
  let db: TriageDatabase;
  let repository: EncounterRepository;

  beforeEach(() => {
    db = new TriageDatabase(`test-${Math.random()}`);
    TestBed.configureTestingModule({ providers: [{ provide: TRIAGE_DB, useValue: db }] });
    repository = TestBed.inject(EncounterRepository);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('should store the patient, the encounter and two pending operations together', async () => {
    const { patient, encounter } = await repository.registerVisit(visitInput);

    expect(await db.patients.get(patient.id)).toBeDefined();
    const stored = await db.encounters.get(encounter.id);
    expect(stored?.version).toBe(1);
    expect(stored?.syncStatus).toBe('pending');

    const operations = await db.outbox.toArray();
    expect(operations.map((o) => `${o.entity}:${o.type}`).sort()).toEqual([
      'encounter:create',
      'patient:create',
    ]);
    expect(operations.every((o) => !('syncStatus' in o.payload))).toBe(true);
  });

  it('should roll back everything if the outbox write fails', async () => {
    vi.spyOn(db.outbox, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));

    await expect(repository.registerVisit(visitInput)).rejects.toThrow('disk full');
    expect(await db.patients.count()).toBe(0);
    expect(await db.encounters.count()).toBe(0);
  });

  it('should increment the version and record the base version when editing', async () => {
    const { encounter } = await repository.registerVisit(visitInput);

    const updated = await repository.updateEncounter(encounter.id, {
      symptoms: 'Fiebre alta y escalofríos',
      alarms: NO_ALARMS,
    });

    expect(updated.version).toBe(2);
    const update = (await db.outbox.toArray()).find((o) => o.type === 'update');
    expect(update?.baseVersion).toBe(1);
  });

  it('should refuse to save without consent', async () => {
    await expect(repository.registerVisit({ ...visitInput, consentGiven: false })).rejects.toThrow(
      'CONSENT_REQUIRED',
    );
    expect(await db.patients.count()).toBe(0);
  });

    it('should store an assessment and queue it for sync', async () => {
    const { encounter } = await repository.registerVisit(visitInput);

    const saved = await repository.saveAssessment(encounter.id, encounter.version, sampleResult);

    expect(saved).toBe(true);
    expect((await db.assessments.get(encounter.id))?.priority).toBe('medium');
    expect((await db.outbox.toArray()).some((o) => o.entity === 'assessment')).toBe(true);
  });

  it('should discard a stale assessment when the visit was edited meanwhile', async () => {
    const { encounter } = await repository.registerVisit(visitInput);
    await repository.updateEncounter(encounter.id, {
      symptoms: 'Fiebre alta y escalofríos',
      alarms: NO_ALARMS,
    });

    // The classification started with version 1, but the visit is now at version 2
    const saved = await repository.saveAssessment(encounter.id, 1, sampleResult);

    expect(saved).toBe(false);
    expect(await db.assessments.get(encounter.id)).toBeUndefined();
  });
});
