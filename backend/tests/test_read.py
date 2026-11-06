import runpy
import sqlite3

from fastapi.testclient import TestClient

from backend.main import INSTRUCTIONS, app

client = TestClient(app)


def test_seed_loads_the_records(database):
    conn = sqlite3.connect(database)
    counts = conn.execute(
        """
        SELECT (SELECT COUNT(*) FROM claims), (SELECT COUNT(*) FROM policies),
               (SELECT COUNT(*) FROM customers), (SELECT COUNT(*) FROM handlers),
               (SELECT COUNT(*) FROM company)
        """
    ).fetchone()
    statuses = conn.execute("SELECT DISTINCT status FROM claims").fetchall()
    conn.close()
    assert counts == (25, 50, 49, 3, 1)
    assert statuses == [("waiting",)]


def test_seed_command(tmp_path, monkeypatch, capsys):
    path = tmp_path / "fresh.db"
    monkeypatch.setenv("UNDERCOVER_DB", str(path))
    runpy.run_module("backend.seed", run_name="__main__")
    assert path.exists()
    assert "Seeded" in capsys.readouterr().out


def test_startup_seeds_a_missing_database(tmp_path, monkeypatch):
    path = tmp_path / "missing.db"
    monkeypatch.setenv("UNDERCOVER_DB", str(path))
    with TestClient(app) as started:
        assert len(started.get("/api/claims").json()) == 25
    assert path.exists()


def test_list_claims():
    claims = client.get("/api/claims").json()
    assert len(claims) == 25
    assert [c["submitted_on"] for c in claims] == sorted(
        c["submitted_on"] for c in claims
    )
    first = next(c for c in claims if c["claim_id"] == "CLM-1001")
    assert first == {
        "claim_id": "CLM-1001",
        "customer_name": "Maya Patel",
        "claim_type": "trip_delay",
        "summary": "Flight home canceled by the airline, rebooked the next morning",
        "amount_claimed": 420.0,
        "submitted_on": "2026-06-24",
        "status": "waiting",
        "decision": None,
        "payout": None,
    }


def test_get_claim():
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["status"] == "waiting"
    assert claim["decision"] is None
    assert claim["story"].startswith("My flight home from Rome")
    assert len(claim["items"]) == 3
    assert len(claim["documents"]) == 4


def test_unknown_records_are_404():
    for path in [
        "/api/claims/CLM-9999",
        "/api/policies/POL-9999",
        "/api/customers/CUS-9999",
    ]:
        response = client.get(path)
        assert response.status_code == 404
        assert response.json()["detail"].endswith("9999.")


def test_get_policy():
    policy = client.get("/api/policies/POL-2001").json()
    assert policy["plan"] == "premium"
    assert policy["trip"]["destination"] == "Rome, Italy"


def test_get_customer():
    customer = client.get("/api/customers/CUS-3001").json()
    assert customer["name"] == "Maya Patel"
    assert [c["claim_id"] for c in customer["previous_claims"]] == ["CLM-0412"]


def test_get_policy_wording():
    wording = client.get("/api/policy-wording").json()["wording"]
    assert wording.startswith("# UnderCover Travel Insurance: Policy Wording")


def test_get_instructions():
    instructions = client.get("/api/instructions").json()["instructions"]
    assert instructions == INSTRUCTIONS.read_text(encoding="utf-8")


def test_list_handlers():
    handlers = client.get("/api/handlers").json()
    assert [h["name"] for h in handlers] == [
        "Dana Whitfield",
        "Marcus Oyelaran",
        "Priya Raman",
    ]


def test_every_operation_is_named_and_documented():
    for path in app.openapi()["paths"].values():
        for operation in path.values():
            assert operation["operationId"]
            assert operation["description"]
