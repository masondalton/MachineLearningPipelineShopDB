"""
Database utilities for consistent connection handling across ETL, training, and inference.
"""
import sqlite3
from contextlib import contextmanager


@contextmanager
def sqlite_conn(db_path):
    """Context manager for SQLite connections. Ensures connection is closed."""
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
        yield conn
    finally:
        conn.close()


def ensure_predictions_table(conn):
    """Create order_predictions table if it does not exist."""
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS order_predictions (
        order_id INTEGER PRIMARY KEY,
        late_delivery_probability REAL,
        predicted_late_delivery INTEGER,
        prediction_timestamp TEXT
    )
    """)
    conn.commit()
