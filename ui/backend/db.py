"""Abstract storage backend + SQLite implementation for EvalMonkey UI.

Swap to a different backend (Postgres, Redis, etc.) by implementing
StorageBackend and passing your instance to set_backend().
"""
from __future__ import annotations

import json
import sqlite3
from abc import ABC, abstractmethod
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from .schemas import RunRecord, SampleResult

DB_PATH = Path.home() / ".evalmonkey" / "ui.db"


class StorageBackend(ABC):
    """Abstract interface — implement this to swap storage layers."""

    @abstractmethod
    def save_run(self, run: RunRecord) -> None: ...

    @abstractmethod
    def update_run(self, run_id: str, **kwargs) -> None: ...

    @abstractmethod
    def get_run(self, run_id: str) -> Optional[RunRecord]: ...

    @abstractmethod
    def get_all_runs(self, limit: int = 100) -> List[RunRecord]: ...

    @abstractmethod
    def save_sample(self, sample: SampleResult) -> None: ...

    @abstractmethod
    def get_samples(self, run_id: str) -> List[SampleResult]: ...


class SQLiteBackend(StorageBackend):
    """SQLite-backed storage. Data lives at ~/.evalmonkey/ui.db — zero setup."""

    def __init__(self, db_path: Path = DB_PATH) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    scenario TEXT NOT NULL,
                    run_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'running',
                    target_url TEXT NOT NULL,
                    eval_model TEXT NOT NULL,
                    request_key TEXT NOT NULL DEFAULT 'question',
                    response_path TEXT NOT NULL DEFAULT 'data',
                    chaos_profile TEXT,
                    score INTEGER,
                    sample_count INTEGER DEFAULT 0,
                    completed_samples INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    completed_at TEXT,
                    details TEXT DEFAULT '{}'
                );
                CREATE TABLE IF NOT EXISTS sample_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    sample_index INTEGER NOT NULL,
                    eval_id TEXT NOT NULL,
                    question TEXT NOT NULL,
                    agent_output TEXT,
                    expected_rubric TEXT,
                    score INTEGER,
                    reasoning TEXT,
                    chaos_profile TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (run_id) REFERENCES runs(id)
                );
            """)

    def save_run(self, run: RunRecord) -> None:
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO runs
                   (id, scenario, run_type, status, target_url, eval_model,
                    request_key, response_path, chaos_profile, score, sample_count,
                    completed_samples, created_at, completed_at, details)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    run.id, run.scenario, run.run_type, run.status, run.target_url,
                    run.eval_model, run.request_key, run.response_path, run.chaos_profile,
                    run.score, run.sample_count, run.completed_samples,
                    run.created_at, run.completed_at, json.dumps(run.details),
                ),
            )

    def update_run(self, run_id: str, **kwargs) -> None:
        if not kwargs:
            return
        if "details" in kwargs:
            kwargs["details"] = json.dumps(kwargs["details"])
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        values = list(kwargs.values()) + [run_id]
        with self._conn() as conn:
            conn.execute(f"UPDATE runs SET {sets} WHERE id = ?", values)

    def get_run(self, run_id: str) -> Optional[RunRecord]:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        return self._row_to_run(dict(row)) if row else None

    def get_all_runs(self, limit: int = 100) -> List[RunRecord]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [self._row_to_run(dict(r)) for r in rows]

    def save_sample(self, sample: SampleResult) -> None:
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO sample_results
                   (run_id, sample_index, eval_id, question, agent_output,
                    expected_rubric, score, reasoning, chaos_profile, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    sample.run_id, sample.sample_index, sample.eval_id,
                    sample.question, sample.agent_output, sample.expected_rubric,
                    sample.score, sample.reasoning, sample.chaos_profile, sample.created_at,
                ),
            )

    def get_samples(self, run_id: str) -> List[SampleResult]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM sample_results WHERE run_id = ? ORDER BY sample_index",
                (run_id,),
            ).fetchall()
        return [SampleResult(**dict(r)) for r in rows]

    def _row_to_run(self, d: dict) -> RunRecord:
        d["details"] = json.loads(d.get("details") or "{}")
        return RunRecord(**d)


# ── Singleton accessor ───────────────────────────────────────────────────────
_backend: Optional[StorageBackend] = None


def get_backend() -> StorageBackend:
    global _backend
    if _backend is None:
        _backend = SQLiteBackend()
    return _backend


def set_backend(backend: StorageBackend) -> None:
    """Replace the default SQLite backend (e.g. for tests or Postgres)."""
    global _backend
    _backend = backend
