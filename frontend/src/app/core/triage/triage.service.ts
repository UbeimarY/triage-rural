import { Injectable } from '@angular/core';
import { AlarmAnswers, TriageResult } from '../db/models';
import { newId } from '../ids';
import { runClassification } from './triage-engine';
import { TriageRequest, TriageResponse } from './triage-protocol';

const TIMEOUT_MS = 10_000;

interface PendingRequest {
  resolve: (result: TriageResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Sends classification requests to the triage web worker and matches the replies. */
@Injectable({ providedIn: 'root' })
export class TriageService {
  private worker: Worker | null = null;
  private readonly pending = new Map<string, PendingRequest>();

  classify(input: { symptoms: string; alarms: AlarmAnswers }): Promise<TriageResult> {
    const request: TriageRequest = {
      requestId: newId(),
      symptoms: input.symptoms,
      alarms: input.alarms,
      simulatedWorkMs: readDemoSetting('triage:demo-load-ms'),
    };

    const worker = this.getWorker();
    if (!worker) {
      // Fallback: same engine on the main thread (unit tests, very old browsers, or the demo)
      return Promise.resolve(runClassification(request));
    }

    return new Promise<TriageResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        reject(new Error('TRIAGE_TIMEOUT'));
      }, TIMEOUT_MS);
      this.pending.set(request.requestId, { resolve, reject, timer });
      worker.postMessage(request);
    });
  }

  private getWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined' || readDemoSetting('triage:demo-main-thread') === 1) {
      return null;
    }

    this.worker = new Worker(new URL('./triage.worker', import.meta.url), { type: 'module' });

    this.worker.onmessage = ({ data }: MessageEvent<TriageResponse>) => {
      const entry = this.pending.get(data.requestId);
      if (!entry) return; // late reply after a timeout
      clearTimeout(entry.timer);
      this.pending.delete(data.requestId);
      if (data.ok) {
        entry.resolve(data.result);
      } else {
        entry.reject(new Error(data.error));
      }
    };

    this.worker.onerror = () => {
      // If the worker crashes, fail all pending requests and create a fresh worker next time
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('TRIAGE_WORKER_ERROR'));
      }
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };

    return this.worker;
  }
}

/** Demo switches stored in localStorage (only used during the presentation). */
function readDemoSetting(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}
