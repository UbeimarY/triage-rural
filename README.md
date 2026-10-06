# Rural Triage (Offline-First)

Progressive Web App that helps rural health promoters register and prioritize patients in areas without reliable internet. Records are stored on the device, classified by an on-device AI model, and synchronized automatically when connectivity returns.

> **Safety notice:** this is an academic prototype that uses **fictitious data only**. The AI suggests a priority to support triage; it does **not** provide a diagnosis. Final decisions always belong to health personnel.

## MVP scope

- Patient and symptom registration with validated forms.
- Full offline operation: create and edit records without internet.
- Automatic synchronization of pending records when the connection returns.
- On-device urgency classification (alarm-sign rules + text classifier in a Web Worker).
- Patient list ordered by priority.
- Basic follow-up dashboard.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Angular (standalone, signals), PWA, IndexedDB, Web Workers |
| Backend | FastAPI, SQLAlchemy 2, Alembic, JWT |
| Database | PostgreSQL (Docker Compose for local development) |
| AI | scikit-learn (TF-IDF + logistic regression), exported to JSON for in-browser inference |

## Project status

🚧 In development. Course project for *Web-Oriented Programming*.