# Rural Triage (Offline-First)

[![CI](https://github.com/UbeimarY/triage-rural/actions/workflows/ci.yml/badge.svg)](https://github.com/UbeimarY/triage-rural/actions/workflows/ci.yml)

Progressive Web App that helps rural health promoters register and prioritize patients where
there is no reliable internet. Records are stored on the phone, classified by an on-device AI
model, and synchronized automatically when the signal returns.

> **Safety notice:** academic prototype with **fictitious data only**. The AI suggests a priority
> to support triage; it does **not** diagnose. Final decisions always belong to health personnel.

The API lives in [`triage-rural-backend`](https://github.com/UbeimarY/triage-rural-backend).

## How it works offline

```
 Form ──▶ IndexedDB (patient + visit + outbox, one atomic transaction)
              │
              ├──▶ Web Worker: alarm rules ▶ text model ▶ suggested priority
              │
              └──▶ Sync engine ──HTTPS──▶ API (when there is signal)
```

| Piece | Role |
|---|---|
| Service Worker | Serves the app, and the AI model inside its bundle, from cache: it opens without internet. |
| IndexedDB (Dexie) | Every record and every pending change (outbox) is saved before anything else, online or not. |
| Web Worker | Runs the classifier on another thread: typing never freezes, even on slow phones. |
| Sync engine | Uploads the outbox on start, when the network returns, when the app becomes visible, every minute and after each change. Background Sync is Chromium-only, so these triggers are the plan for every browser. |

### Synchronization guarantees

- **Client-generated UUIDs** and one id per outbox operation: a retried upload is acknowledged as
  `duplicate`, never stored twice (idempotency).
- **No silent overwrites of health data:** every edit carries the version it was based on. If the
  server has a newer one, both copies are kept and the promoter chooses.
- Each operation gets its own answer (`applied`, `duplicate`, `retry`, `conflict`, `rejected`), so
  one bad record never blocks the rest.
- Records synced by one account are never uploaded under another account on the same phone.

## What the promoter sees

- **Sign in first:** no screen with patient data opens without an account. Signing in needs
  signal once; if the session expires in the field, the promoter keeps working and is asked to
  sign in again only to sync. **Salir** erases the phone's records, and only once the server has
  every one of them; another account cannot sign in while someone else's changes are unsent.
- **Hoy:** who to attend first (high priority not yet reviewed, with waiting time), today's
  visits, and what is left to review or send. One tap registers the next visit.
- **Three-step registration** (Paciente → Síntomas → Confirmar) with large touch targets.
- **How the AI read the note:** words that weighed for the suggestion are highlighted, findings
  written as absent ("sin fiebre") are struck through.
- **Follow-up questions:** "La nota menciona dolor en el pecho, ¿lo presenta?" marks the alarm
  question with one tap. Free text never raises the priority on its own.
- **Modo sol:** black on white, larger text and thicker borders for reading at noon.
- **Coordinators:** daily trend by priority, how often promoters keep the AI's suggestion, time
  from registration to sync, a CSV export without the symptoms note, and promoter accounts.

## AI module

Three safety layers, in order:

1. **Alarm-sign rules** asked as explicit yes/no questions. Any alarm means **high**.
2. **On-device text model** (`triage-text-v2`) for visits without alarms: TF-IDF over
   negation-aware words, word pairs and four-letter pieces (for typos), multinomial logistic
   regression with **temperature scaling** for calibrated certainty. Trained in Python with
   scikit-learn, executed in TypeScript inside a web worker, offline.
3. **Promoter review:** every suggestion can be confirmed or changed; lowering it requires a
   written reason.

**Python ↔ TypeScript equivalence:** a unit test runs 49 texts (accents, capitals, `ñ`, typos,
denials, an empty text) through the TypeScript code and checks it builds the same features and
reproduces the probabilities Python computed, within 10⁻⁶.

### Metrics (same synthetic data, scenarios never seen in training)

| | v1: words + word pairs | **v2** |
|---|---|---|
| Recall of urgent cases | 0.986 | **1.000** |
| Recall of urgent cases, with typos | 0.955 | **1.000** |
| Denied urgent findings wrongly called urgent | 41.4 % | **5.7 %** |
| Expected calibration error | 0.060 | **0.004** |

Decision rule: **high** if `P(high) ≥ 0.70`, chosen by grouped cross-validation to keep the
recall of high at 0.95 or more, because missing an urgent case is worse than a false alarm. A
note with no word the model knows stays **medium**.

**Limitations, stated plainly:** the dataset is synthetic and written by the developer (generator
and model card in the backend repository), so near-perfect scores are expected and do **not**
predict performance on real notes. Denial is handled by rules, not understanding. It was not
validated by health professionals, and the three-level scale is not an official triage scale.

## Privacy (Ley 1581 de 2012)

Data minimization (no names, documents or phone numbers: a code, birth year, sex and community),
explicit consent required to save a visit (also enforced by the server), adults only, accounts
created by the organization (no public sign-up), and role-based access: promoters upload their own
records; coordinators read the dashboard.

## Tech stack

Angular 21 (standalone, signals) · PWA (Angular Service Worker) · IndexedDB (Dexie) · Web Workers ·
Vitest · FastAPI + PostgreSQL backend · Netlify.

## Run locally

Requirements: Node 22+, and the backend on `http://localhost:8001`.

```bash
cd frontend
npm ci
npm start           # http://localhost:4200
npm run test:ci     # unit tests, including the model equivalence test
```

Testing offline: `npm run build`, serve `dist/frontend/browser` (for example `npx serve -s`), open
it once, then DevTools → Network → **Offline** and reload. Check **Application → Service workers**
and **IndexedDB → triage-rural**.

## Project status

Course project for *Programación Orientada a la Web*, Universidad Cooperativa de Colombia, Pasto.
