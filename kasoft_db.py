import json
import os
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "kasoft.db"
JSON_PATH = Path(__file__).parent / "data" / "kasoft_state.json"
_db_ready = False
_pg_engine = None

DATABASE_URL = (os.environ.get("DATABASE_URL") or "").strip()
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)


def uses_postgresql():
    return bool(DATABASE_URL)


def _pg_engine():
    global _pg_engine
    if _pg_engine is None:
        from sqlalchemy import create_engine

        _pg_engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    return _pg_engine


def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_pg():
    from sqlalchemy import text

    with _pg_engine().begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS kasoft_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    payload TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )


def init_db():
    global _db_ready
    if _db_ready:
        return
    if uses_postgresql():
        _init_pg()
    else:
        with _conn() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS kasoft_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    payload TEXT NOT NULL,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.commit()
    _db_ready = True
    if JSON_PATH.exists() and not _load_state_raw():
        try:
            data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
            if data.get("bureaux"):
                save_state(data)
        except (json.JSONDecodeError, OSError):
            pass


def _load_state_raw():
    if uses_postgresql():
        from sqlalchemy import text

        with _pg_engine().connect() as conn:
            row = conn.execute(
                text("SELECT payload FROM kasoft_state WHERE id = 1")
            ).fetchone()
        if not row:
            return None
        try:
            return json.loads(row[0])
        except json.JSONDecodeError:
            return None

    with _conn() as conn:
        row = conn.execute("SELECT payload FROM kasoft_state WHERE id = 1").fetchone()
    if not row:
        return None
    try:
        return json.loads(row["payload"])
    except json.JSONDecodeError:
        return None


def load_state():
    init_db()
    return _load_state_raw()


def save_state(data):
    init_db()
    payload = json.dumps(data, ensure_ascii=False)
    if uses_postgresql():
        from sqlalchemy import text

        with _pg_engine().begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO kasoft_state (id, payload, updated_at)
                    VALUES (1, :payload, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO UPDATE SET
                        payload = EXCLUDED.payload,
                        updated_at = CURRENT_TIMESTAMP
                    """
                ),
                {"payload": payload},
            )
    else:
        with _conn() as conn:
            conn.execute(
                """
                INSERT INTO kasoft_state (id, payload, updated_at)
                VALUES (1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (payload,),
            )
            conn.commit()
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        from backend.broadcast import notify_state_change

        notify_state_change(data)
    except ImportError:
        pass


def record_vote(data, bureau_id, parti_id, mourakib_id, delta, actif):
    state = data if data.get("bureaux") else load_state() or {}
    bureau = next((b for b in state.get("bureaux", []) if b["id"] == bureau_id), None)
    if bureau and bureau.get("status") == "ferme":
        return state, False
    votes = state.setdefault("votes", {})
    bureau_votes = votes.setdefault(bureau_id, {})
    parti_votes = bureau_votes.setdefault(parti_id, {})
    current = parti_votes.get(mourakib_id, 0)
    next_val = max(0, current + int(delta))
    if next_val == current:
        return state, False
    parti_votes[mourakib_id] = next_val

    parti_name = next(
        (p["name"] for p in state.get("partis", []) if p["id"] == parti_id), ""
    )
    mourakib_name = next(
        (
            m["name"]
            for m in state.get("mourakibs", {}).get(parti_id, [])
            if m["id"] == mourakib_id
        ),
        "",
    )
    parti_total = sum(parti_votes.values())
    journal_total = next_val

    from datetime import datetime

    journal = state.setdefault("journal", [])
    journal.insert(
        0,
        {
            "time": datetime.now().isoformat(),
            "bureauId": bureau_id,
            "actif": actif,
            "parti": parti_name,
            "mourakib": mourakib_name,
            "action": "+1" if delta > 0 else "-1",
            "total": journal_total,
            "partiTotal": parti_total,
        },
    )
    del journal[50:]
    save_state(state)
    return state, True
