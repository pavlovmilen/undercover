import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

HELD = "Payment held: payouts over $1,000.00 need a handler's sign-off."


def decide(claim_id, decision="approve", payout=420.0):
    return client.post(
        f"/api/claims/{claim_id}/decision",
        json={
            "decision": decision,
            "payout": payout,
            "reasons": "The delay was covered.",
            "policy_section": "Section 3, Trip Delay",
        },
    )


def pay(claim_id, amount):
    return client.post(f"/api/claims/{claim_id}/payment", json={"amount": amount})


def sign_off(claim_id, handler_id="HND-01"):
    return client.post(
        f"/api/claims/{claim_id}/sign-off", json={"handler_id": handler_id}
    )


def test_start_claim():
    response = client.post("/api/claims/CLM-1001/start")
    assert response.json()["status"] == "in_progress"
    assert client.post("/api/claims/CLM-1001/start").status_code == 200


def test_start_a_decided_claim_is_refused():
    decide("CLM-1001", "decline", 0)
    response = client.post("/api/claims/CLM-1001/start")
    assert response.status_code == 409


def test_steps_of_the_latest_run():
    for thread, title in [("t1", "old"), ("t2", "get_claim"), ("t2", "get_policy")]:
        step = {"thread_id": thread, "kind": "tool_call", "title": title, "detail": ""}
        assert client.post("/api/claims/CLM-1001/steps", json=step).status_code == 200
    other = {"thread_id": "t3", "kind": "message", "title": "x", "detail": ""}
    client.post("/api/claims/CLM-1002/steps", json=other)
    steps = client.get("/api/claims/CLM-1001/steps").json()
    assert [s["title"] for s in steps] == ["get_claim", "get_policy"]
    assert steps[0]["thread_id"] == "t2"
    assert steps[0]["created_at"]


def test_steps_for_an_unknown_claim_are_404():
    assert client.get("/api/claims/CLM-9999/steps").status_code == 404


def test_approve_under_the_limit_is_decided():
    claim = decide("CLM-1001").json()
    assert claim["status"] == "decided"
    assert claim["decision"]["decision"] == "approve"
    assert claim["decision"]["payout"] == 420.0
    assert claim["decision"]["policy_section"] == "Section 3, Trip Delay"
    assert claim["decision"]["paid_amount"] is None


def test_approve_over_the_limit_waits_for_sign_off():
    assert decide("CLM-1001", payout=1250.0).json()["status"] == "awaiting_sign_off"


def test_approve_at_the_limit_is_decided():
    assert decide("CLM-1001", payout=1000.0).json()["status"] == "decided"


@pytest.mark.parametrize("decision", ["decline", "refer"])
def test_decline_and_refer_are_decided(decision):
    claim = decide("CLM-1001", decision, 0).json()
    assert claim["status"] == "decided"
    assert claim["decision"]["decision"] == decision


@pytest.mark.parametrize(
    ("decision", "payout"),
    [("decline", 50.0), ("refer", 10.0), ("approve", 0.0), ("approve", -5.0)],
)
def test_payout_must_fit_the_decision(decision, payout):
    assert decide("CLM-1001", decision, payout).status_code == 422


def test_a_second_decision_is_refused():
    decide("CLM-1001")
    response = decide("CLM-1001", "decline", 0)
    assert response.status_code == 409
    assert response.json()["detail"] == "Claim CLM-1001 already has a decision."


def test_decision_on_an_unknown_claim_is_404():
    assert decide("CLM-9999").status_code == 404


def test_pay_an_approved_claim():
    decide("CLM-1001")
    claim = pay("CLM-1001", 420.0).json()
    assert claim["decision"]["paid_amount"] == 420.0
    assert claim["decision"]["paid_at"]
    assert claim["status"] == "decided"


def test_pay_twice_is_refused():
    decide("CLM-1001")
    pay("CLM-1001", 420.0)
    response = pay("CLM-1001", 420.0)
    assert response.status_code == 409
    assert response.json()["detail"] == "Claim CLM-1001 is already paid."


def test_pay_the_wrong_amount_is_refused():
    decide("CLM-1001")
    response = pay("CLM-1001", 500.0)
    assert response.status_code == 409
    assert response.json()["detail"] == (
        "The approved payout is $420.00, so the payment must be that amount."
    )


@pytest.mark.parametrize("decision", ["decline", "refer", None])
def test_pay_a_claim_that_is_not_approved_is_refused(decision):
    if decision:
        decide("CLM-1001", decision, 0)
    response = pay("CLM-1001", 420.0)
    assert response.status_code == 409
    assert response.json()["detail"] == "Claim CLM-1001 is not approved for payment."


def test_pay_over_the_limit_is_held_for_sign_off():
    decide("CLM-1001", payout=1250.0)
    response = pay("CLM-1001", 1250.0)
    assert response.status_code == 403
    assert response.json()["detail"] == HELD
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["decision"]["paid_amount"] is None
    assert claim["status"] == "awaiting_sign_off"


def test_sign_off_pays_the_claim():
    decide("CLM-1001", payout=1250.0)
    claim = sign_off("CLM-1001").json()
    assert claim["status"] == "decided"
    assert claim["decision"]["signed_off_by"] == "Dana Whitfield"
    assert claim["decision"]["signed_off_at"]
    assert claim["decision"]["paid_amount"] == 1250.0
    assert pay("CLM-1001", 1250.0).status_code == 409


def test_sign_off_a_claim_that_is_not_waiting_is_refused():
    decide("CLM-1001")
    response = sign_off("CLM-1001")
    assert response.status_code == 409
    assert response.json()["detail"] == "Claim CLM-1001 is not waiting for sign-off."


def test_sign_off_by_an_unknown_handler_is_404():
    decide("CLM-1001", payout=1250.0)
    assert sign_off("CLM-1001", "HND-99").status_code == 404


def test_sign_off_needs_a_handler_who_can_approve(database):
    conn = sqlite3.connect(database)
    record = {
        "handler_id": "HND-04",
        "name": "Sam Trainee",
        "role": "Trainee",
        "email": "sam@undercover.example",
        "can_approve_over_limit": False,
    }
    with conn:
        conn.execute("INSERT INTO handlers VALUES ('HND-04', ?)", [json.dumps(record)])
    conn.close()
    decide("CLM-1001", payout=1250.0)
    response = sign_off("CLM-1001", "HND-04")
    assert response.status_code == 403
    assert client.get("/api/claims/CLM-1001").json()["status"] == "awaiting_sign_off"


def test_the_limit_comes_from_the_company_record(database):
    conn = sqlite3.connect(database)
    with conn:
        conn.execute(
            "UPDATE company "
            "SET record = json_set(record, '$.payout_approval_limit', 2000)"
        )
    conn.close()
    assert decide("CLM-1001", payout=1250.0).json()["status"] == "decided"
    assert pay("CLM-1001", 1250.0).status_code == 200


def test_the_queue_shows_decisions():
    decide("CLM-1001", payout=1250.0)
    claims = client.get("/api/claims").json()
    claim = next(c for c in claims if c["claim_id"] == "CLM-1001")
    assert claim["status"] == "awaiting_sign_off"
    assert claim["decision"] == "approve"
    assert claim["payout"] == 1250.0
