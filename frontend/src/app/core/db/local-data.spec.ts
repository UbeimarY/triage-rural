import { TestBed } from '@angular/core/testing';
import { EncounterRepository } from './encounter.repository';
import { LocalData, UnsentRecordsError } from './local-data';
import { TRIAGE_DB, TriageDatabase } from './triage-db';

describe('LocalData', () => {
  let db: TriageDatabase;
  let local: LocalData;

  beforeEach(async () => {
    db = new TriageDatabase(`local-${Math.random()}`);
    TestBed.configureTestingModule({ providers: [{ provide: TRIAGE_DB, useValue: db }] });
    local = TestBed.inject(LocalData);
    await TestBed.inject(EncounterRepository).registerVisit({
      birthYear: 1980,
      sex: 'female',
      community: 'Genoy',
      symptoms: 'Tos y fiebre desde ayer',
      alarms: {
        breathingDifficulty: false,
        lossOfConsciousness: false,
        chestPain: false,
        severeBleeding: false,
        seizures: false,
      },
      consentGiven: true,
    });
  });

  afterEach(() => db.delete());

  it('refuses to erase records the server does not have yet', async () => {
    expect((await local.state()).unsent).toBeGreaterThan(0);
    await expect(local.clearSynced()).rejects.toBeInstanceOf(UnsentRecordsError);
    expect((await local.state()).patients).toBe(1);
  });

  it('erases the phone once everything was sent', async () => {
    await db.outbox.clear();

    await local.clearSynced();

    expect(await local.state()).toEqual({ unsent: 0, patients: 0 });
  });
});
