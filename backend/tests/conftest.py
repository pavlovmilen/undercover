import pytest

from backend import db


@pytest.fixture(autouse=True)
def database(tmp_path, monkeypatch):
    """Give each test its own freshly seeded database."""
    path = tmp_path / "undercover.db"
    monkeypatch.setenv("UNDERCOVER_DB", str(path))
    db.seed(path)
    return path
