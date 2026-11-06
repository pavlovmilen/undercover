"""Rebuild the database from the records in data/: uv run -m backend.seed"""

from backend import db

if __name__ == "__main__":
    db.seed(db.path())
    print(f"Seeded {db.path()}")
