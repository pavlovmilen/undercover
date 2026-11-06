"""The UnderCover database: SQLite, seeded from the records in data/."""

import json
import os
import sqlite3
from collections.abc import Iterator
from pathlib import Path

DATA = Path(__file__).parent.parent / "data"
DEFAULT_PATH = Path(__file__).parent / "undercover.db"

SCHEMA = """
CREATE TABLE company (id INTEGER PRIMARY KEY, record TEXT NOT NULL);
CREATE TABLE handlers (handler_id TEXT PRIMARY KEY, record TEXT NOT NULL);
CREATE TABLE customers (customer_id TEXT PRIMARY KEY, record TEXT NOT NULL);
CREATE TABLE policies (
    policy_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers,
    record TEXT NOT NULL
);
CREATE TABLE claims (
    claim_id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL REFERENCES policies,
    customer_id TEXT NOT NULL REFERENCES customers,
    status TEXT NOT NULL,
    record TEXT NOT NULL
);
CREATE TABLE decisions (
    claim_id TEXT PRIMARY KEY REFERENCES claims,
    decision TEXT NOT NULL,
    payout REAL NOT NULL,
    reasons TEXT NOT NULL,
    policy_section TEXT NOT NULL,
    decided_at TEXT NOT NULL,
    signed_off_by TEXT,
    signed_off_at TEXT,
    paid_amount REAL,
    paid_at TEXT
);
CREATE TABLE steps (
    id INTEGER PRIMARY KEY,
    claim_id TEXT NOT NULL REFERENCES claims,
    thread_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def path() -> Path:
    """Return the database file, from UNDERCOVER_DB or the default."""
    return Path(os.getenv("UNDERCOVER_DB", DEFAULT_PATH))


def load(name: str) -> list[dict]:
    """Load one of the JSON records files in data/."""
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def seed(db_path: Path) -> None:
    """Create the database afresh from the records in data/."""
    db_path.unlink(missing_ok=True)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    with conn:
        conn.executescript(SCHEMA)
        company = json.loads((DATA / "company.json").read_text(encoding="utf-8"))
        conn.execute("INSERT INTO company VALUES (1, ?)", [json.dumps(company)])
        conn.executemany(
            "INSERT INTO handlers VALUES (?, ?)",
            [(h["handler_id"], json.dumps(h)) for h in load("handlers.json")],
        )
        conn.executemany(
            "INSERT INTO customers VALUES (?, ?)",
            [(c["customer_id"], json.dumps(c)) for c in load("customers.json")],
        )
        conn.executemany(
            "INSERT INTO policies VALUES (?, ?, ?)",
            [
                (p["policy_id"], p["customer_id"], json.dumps(p))
                for p in load("policies.json")
            ],
        )
        conn.executemany(
            "INSERT INTO claims VALUES (?, ?, ?, 'waiting', ?)",
            [
                (c["claim_id"], c["policy_id"], c["customer_id"], json.dumps(c))
                for c in load("claims.json")
            ],
        )
    conn.close()


def connect() -> Iterator[sqlite3.Connection]:
    """Open a connection for one request, committing when it succeeds."""
    conn = sqlite3.connect(path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()
