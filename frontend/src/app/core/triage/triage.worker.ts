/// <reference lib="webworker" />

import { runClassification } from './triage-engine';
import { TriageRequest, TriageResponse } from './triage-protocol';

// Runs in a separate thread: it can never freeze the user interface.
addEventListener('message', ({ data }: MessageEvent<TriageRequest>) => {
  let response: TriageResponse;
  try {
    response = { requestId: data.requestId, ok: true, result: runClassification(data) };
  } catch (error) {
    response = {
      requestId: data.requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'TRIAGE_UNKNOWN_ERROR',
    };
  }
  postMessage(response);
});
