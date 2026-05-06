
# EvalMonkey UI

A professional web interface for running benchmarks, chaos tests, and tracking agent reliability over time.

## Quick Start

**Terminal 1 — Backend (FastAPI)**
```bash
cd <path-to-evalmonkey>
cp .env.example .env  # add EVAL_MODEL + your LLM API key
uvicorn ui.backend.main:app --reload --port 8080
```

**Terminal 2 — Frontend (Next.js)**
```bash
cd <path-to-evalmonkey>/ui/frontend
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Features

| Page | Description |
|---|---|
| **Dashboard** | Production Reliability hero, live runs, recent results grid |
| **New Run** | 3-step wizard: agent URL → benchmark → configure & launch |
| **Live Run** | SSE-streamed real-time sample results with score rings |
| **History** | Recharts trend lines, reliability per scenario, all-runs table |

## Architecture

```
FastAPI backend  →  SQLite (~/.evalmonkey/ui.db)
     ↕ REST + SSE
Next.js frontend  →  http://localhost:3000
```

The `StorageBackend` ABC in `ui/backend/db.py` makes the storage layer swappable — replace `SQLiteBackend` with `PostgresBackend` in a single line.

## Extending Storage
```python
# In ui/backend/db.py — implement this ABC:
class MyBackend(StorageBackend):
    def save_run(self, run: RunRecord) -> None: ...
    # ... 5 other methods

# Then in your app startup:
from ui.backend.db import set_backend
set_backend(MyBackend())
```

## CLI — No Impact
The existing `evalmonkey` CLI continues to work exactly as before. The UI is a completely additive layer — it imports from the same `evalmonkey.*` packages but adds no changes to them.
