import { Injectable, inject } from '@angular/core';
import { EncounterRepository } from '../db/encounter.repository';
import { Encounter } from '../db/models';
import { TriageService } from './triage.service';

/** Classifies visits in the background and stores the result. It never blocks the caller. */
@Injectable({ providedIn: 'root' })
export class TriageRunner {
  private readonly triage = inject(TriageService);
  private readonly repository = inject(EncounterRepository);
  private readonly running = new Set<string>();

  /** Fire and forget: the user can keep working while the worker classifies. */
  run(encounter: Encounter): void {
    void this.classifyAndStore(encounter);
  }

  /** Recovers visits left without a result (for example, if the app was closed too early). */
  async classifyMissing(): Promise<void> {
    const encounters = await this.repository.encountersNeedingTriage();
    encounters.forEach((encounter) => this.run(encounter));
  }

  private async classifyAndStore(encounter: Encounter): Promise<void> {
    const key = `${encounter.id}@${encounter.version}`;
    if (this.running.has(key)) return;
    this.running.add(key);

    try {
      const result = await this.triage.classify({ symptoms: encounter.symptoms, alarms: encounter.alarms });
      await this.repository.saveAssessment(encounter.id, encounter.version, result);
    } catch (error) {
      // The visit stays "Clasificando..." and will be retried next time the list opens
      console.error('Triage classification failed', error);
    } finally {
      this.running.delete(key);
    }
  }
}
