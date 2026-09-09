# SIDC Road Defect Liability & Compliance Ledger

**PS1 — Smart Pothole Detection & Repair.** Client: SIDC (State Industrial Development
Corporation), modelled on MIDC Maharashtra.

SIDC does not have a pothole *detection* problem. It has an **attribution and closure**
problem: when a defect appears on an estate road, who is contractually liable, is the road
still inside a Defect Liability Period, who owes the repair, and can we prove it was fixed in
time? This repo is the ledger that answers those questions and enforces the 48-hour clock.

> This is an operational compliance tool, not legal advice. Every liability verdict is worded
> as a **probable match, to be verified against the tender documents**.

## The staged-notice model

A continuous detector is a liability generator, so defects move through three states with
different legal weight. Only the last one starts the statutory clock.

| State | Created by | 48h clock |
|---|---|---|
| `SIGHTING` | opportunistic capture from any vehicle | no |
| `CONFIRMED` | repeat sightings in a geofence, a survey pass, or a worker report | no |
| `NOTICED` | engineer accepts into the queue, or the published policy threshold is crossed | **yes** |

Sightings are never deleted, ageing unpromoted sightings are surfaced on the engineer screen,
the promotion policy is published config rather than a per-user choice, and every transition is
written to `audit_log`.

## Stack

Single FastAPI service + Postgres, and a Vite/React frontend. Two roles (`SURVEYOR`,
`ENGINEER`) carried on an `X-Role` header. Monolith, one repo.

```
backend/    FastAPI. routes -> controllers -> services -> schemas (SQLAlchemy + Pydantic)
frontend/   Vite + React + Tailwind
```

## Running it

**Backend**

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env          # set DATABASE_URL, GEMINI_API_KEY
docker compose up -d          # Postgres on 5434, from the repo root

.venv/bin/python src/scripts/migrate_v2_schema.py   # create/patch tables
.venv/bin/python src/scripts/load_segments.py       # 30-segment gazetteer
.venv/bin/python src/scripts/seed_tenders.py        # tender + DLP register
.venv/bin/python src/scripts/seed_slag.py           # slag ledger
.venv/bin/python src/scripts/seed_demo_scenarios.py # demo defects

.venv/bin/uvicorn main:app --reload
```

**Frontend**

```bash
cd frontend
npm install
npm run dev      # set VITE_API_URL if the API is not same-origin
```

**Tests**

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```

Tests run against a disposable SQLite database created fresh each session, never your dev
Postgres. Point them elsewhere with `TEST_DATABASE_URL`.

## Modules

| | |
|---|---|
| **M1** Intake | Opportunistic capture (`/drive`), scheduled survey runs, worker reports (`/report`) |
| **M2** Detector | Off-the-shelf YOLO server-side; sightings deduped within 15 m |
| **M3** Gazetteer | 30 GeoJSON segments; nearest-linestring matching in UTM 43N |
| **M4** Tender & DLP register | `/admin` — tenders, DLP expiry, clause source, segment mapping |
| **M5** Liability + SLA | Verdicts, config-driven promotion policy, 48h clock, before/after evidence |
| **M6** Slag ledger | Tenant unit → stockpile → draw → repaired segment, on `/analytics` |
| **M7** Engineer dashboard | `/review` queue + ageing sightings, `/work-orders` repair queue, `/map`, `/analytics` contractor rollup |

## Notes

- The detector is deliberately not tuned. Humans gate promotion, so the system is designed to
  be correct under a mediocre detector.
- Tender records are hand-curated from MahaTenders. DLP terms usually live inside the tender
  PDF rather than the award record — `data/extracted_dlp_samples.json` demonstrates LLM
  extraction on sample documents.
- `NOTIFY_CONTRACTORS_LIVE=False` keeps contractor notices in simulated mode. Notices are only
  dispatched automatically when an **engineer** accepts a defect; policy-driven promotions
  start the clock but leave dispatch to a human.
