"""SQLite-backed store for LLM interaction logs."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Any, Callable, TypeVar

_DEFAULT_DB_PATH = Path.home() / ".vibe-trading" / "sessions.db"
_DB_PATH_ENV = "VIBE_TRADING_LLM_LOG_DB_PATH"

F = TypeVar("F", bound=Callable)


def _synchronized(method: F) -> F:
    @wraps(method)
    def wrapper(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        with self._lock:
            return method(self, *args, **kwargs)
    return wrapper  # type: ignore[return-value]


def _default_db_path() -> Path:
    raw = os.getenv(_DB_PATH_ENV, "").strip()
    if raw:
        return Path(raw).expanduser()
    return _DEFAULT_DB_PATH


def _now_iso() -> str:
    return datetime.now().isoformat()


class LLMLogStore:
    """SQLite-backed store for LLM interaction logs."""

    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = Path(db_path) if db_path is not None else _default_db_path()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA busy_timeout=5000")
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._lock = threading.RLock()
        self._init_db()

    def _init_db(self) -> None:
        with self._lock:
            self._conn.executescript("""
                CREATE TABLE IF NOT EXISTS llm_logs (
                    log_id            TEXT PRIMARY KEY,
                    session_id        TEXT NOT NULL DEFAULT '',
                    timestamp         TEXT NOT NULL,
                    user_input        TEXT NOT NULL DEFAULT '',
                    model_name        TEXT NOT NULL DEFAULT '',
                    total_duration_ms INTEGER NOT NULL DEFAULT 0,
                    total_tokens      INTEGER NOT NULL DEFAULT 0,
                    status            TEXT NOT NULL DEFAULT 'ok',
                    rounds            TEXT NOT NULL DEFAULT '[]'
                );
                CREATE INDEX IF NOT EXISTS idx_llm_logs_timestamp
                    ON llm_logs(timestamp DESC);
                CREATE INDEX IF NOT EXISTS idx_llm_logs_session
                    ON llm_logs(session_id);
            """)

    @_synchronized
    def insert_log(
        self,
        log_id: str,
        session_id: str,
        timestamp: str,
        user_input: str,
        model_name: str,
        total_duration_ms: int,
        total_tokens: int,
        status: str,
        rounds: list[dict[str, Any]],
    ) -> str:
        self._conn.execute(
            """INSERT OR REPLACE INTO llm_logs
               (log_id, session_id, timestamp, user_input, model_name,
                total_duration_ms, total_tokens, status, rounds)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                log_id,
                session_id,
                timestamp,
                user_input[:500],
                model_name,
                total_duration_ms,
                total_tokens,
                status,
                json.dumps(rounds, ensure_ascii=False),
            ),
        )
        self._conn.commit()
        return log_id

    @_synchronized
    def list_logs(
        self,
        session_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        if session_id:
            rows = self._conn.execute(
                """SELECT log_id, session_id, timestamp, user_input, model_name,
                          total_duration_ms, total_tokens, status,
                          json_array_length(rounds) AS round_count
                   FROM llm_logs
                   WHERE session_id = ?
                   ORDER BY timestamp DESC
                   LIMIT ? OFFSET ?""",
                (session_id, limit, offset),
            ).fetchall()
        else:
            rows = self._conn.execute(
                """SELECT log_id, session_id, timestamp, user_input, model_name,
                          total_duration_ms, total_tokens, status,
                          json_array_length(rounds) AS round_count
                   FROM llm_logs
                   ORDER BY timestamp DESC
                   LIMIT ? OFFSET ?""",
                (limit, offset),
            ).fetchall()
        return [dict(r) for r in rows]

    @_synchronized
    def get_log(self, log_id: str) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT * FROM llm_logs WHERE log_id = ?", (log_id,)
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["rounds"] = json.loads(d.get("rounds") or "[]")
        d["round_count"] = len(d["rounds"])
        return d

    @_synchronized
    def delete_log(self, log_id: str) -> bool:
        cur = self._conn.execute(
            "DELETE FROM llm_logs WHERE log_id = ?", (log_id,)
        )
        self._conn.commit()
        return cur.rowcount > 0

    @_synchronized
    def clear_logs(self, session_id: str | None = None) -> int:
        if session_id:
            cur = self._conn.execute(
                "DELETE FROM llm_logs WHERE session_id = ?", (session_id,)
            )
        else:
            cur = self._conn.execute("DELETE FROM llm_logs")
        self._conn.commit()
        return cur.rowcount

    @_synchronized
    def count_logs(self, session_id: str | None = None) -> int:
        if session_id:
            row = self._conn.execute(
                "SELECT COUNT(*) FROM llm_logs WHERE session_id = ?", (session_id,)
            ).fetchone()
        else:
            row = self._conn.execute("SELECT COUNT(*) FROM llm_logs").fetchone()
        return row[0]


_instance: LLMLogStore | None = None


def get_llm_log_store() -> LLMLogStore:
    global _instance
    if _instance is None:
        _instance = LLMLogStore()
    return _instance
