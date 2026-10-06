import { TestBed } from '@angular/core/testing';
import { NO_ALARMS } from './alarm-signs';
import { TriageService } from './triage.service';

describe('TriageService', () => {
  it('should classify using the main-thread fallback when workers are unavailable', async () => {
    // The test environment (jsdom) has no Worker, so the fallback path is used
    const service = TestBed.inject(TriageService);

    const result = await service.classify({
      symptoms: 'Convulsiones hace una hora',
      alarms: { ...NO_ALARMS, seizures: true },
    });

    expect(result.priority).toBe('high');
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
