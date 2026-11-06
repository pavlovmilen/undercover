import json
import runpy

from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

import backend.main
from agent import main
from backend.main import app

client = TestClient(app)

HELD = "Payment held: payouts over $1,000.00 need a handler's sign-off."


class StubModel(GenericFakeChatModel):
    """A chat model that gives scripted replies in place of a real model."""

    def bind_tools(self, tools, **kwargs):
        return self


def call(name, **args):
    return {"name": name, "args": args, "id": f"{name}-{len(args)}"}


def stub(*replies):
    return StubModel(messages=iter(replies))


def read_the_claim():
    return AIMessage(
        content="I will read the claim first.",
        tool_calls=[
            call("get_claim", claim_id="CLM-1001"),
            call("get_policy", policy_id="POL-2001"),
            call("get_customer", customer_id="CUS-3001"),
            call("get_policy_wording"),
        ],
    )


def decide(decision, payout, claim_id="CLM-1001"):
    return AIMessage(
        content="",
        tool_calls=[
            call(
                "record_decision",
                claim_id=claim_id,
                decision=decision,
                payout=payout,
                reasons="The flight was canceled for a crew problem.",
                policy_section="Section 3, Trip Delay",
            )
        ],
    )


def pay(amount, claim_id="CLM-1001"):
    return AIMessage(
        content="", tool_calls=[call("pay_claim", claim_id=claim_id, amount=amount)]
    )


def steps(claim_id="CLM-1001"):
    return client.get(f"/api/claims/{claim_id}/steps").json()


def test_approve_and_pay(monkeypatch):
    monkeypatch.setattr(main, "backend", lambda: TestClient(app))
    llm = stub(
        read_the_claim(),
        decide("approve", 420.0),
        pay(420.0),
        AIMessage(content="Approved $420.00 for the trip delay."),
    )
    reply = main.run("CLM-1001", "thread-1", llm)
    assert reply == "Approved $420.00 for the trip delay."
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["status"] == "decided"
    assert claim["decision"]["payout"] == 420.0
    assert claim["decision"]["paid_amount"] == 420.0
    recorded = steps()
    assert {s["thread_id"] for s in recorded} == {"thread-1"}
    reads = ["get_claim", "get_policy", "get_customer", "get_policy_wording"]
    assert [(s["kind"], s["title"]) for s in recorded[:5]] == [
        ("message", "agent"),
        *[("tool_call", name) for name in reads],
    ]
    results = {s["title"]: s for s in recorded[5:9]}
    assert {s["kind"] for s in recorded[5:9]} == {"tool_result"}
    assert set(results) == set(reads)
    assert [(s["kind"], s["title"]) for s in recorded[9:]] == [
        ("tool_call", "record_decision"),
        ("tool_result", "record_decision"),
        ("tool_call", "pay_claim"),
        ("tool_result", "pay_claim"),
        ("message", "agent"),
    ]
    assert json.loads(recorded[1]["detail"]) == {"claim_id": "CLM-1001"}
    assert "Maya Patel" in results["get_customer"]["detail"]
    assert results["get_policy_wording"]["detail"].startswith("# UnderCover Travel")


def test_payment_over_the_limit_is_held(monkeypatch):
    monkeypatch.setattr(main, "backend", lambda: TestClient(app))
    llm = stub(
        decide("approve", 1250.0, "CLM-1003"),
        pay(1250.0, "CLM-1003"),
        AIMessage(content="Approved $1,250.00, waiting for sign-off."),
    )
    main.run("CLM-1003", "thread-1", llm)
    claim = client.get("/api/claims/CLM-1003").json()
    assert claim["status"] == "awaiting_sign_off"
    assert claim["decision"]["paid_amount"] is None
    held = [s for s in steps("CLM-1003") if s["kind"] == "tool_result"][-1]
    assert held["title"] == "pay_claim"
    assert held["detail"] == f"Refused: {HELD}"


def test_decline(monkeypatch):
    monkeypatch.setattr(main, "backend", lambda: TestClient(app))
    llm = stub(decide("decline", 0.0), AIMessage(content="Declined."))
    assert main.run("CLM-1001", "thread-1", llm) == "Declined."
    decision = client.get("/api/claims/CLM-1001").json()["decision"]
    assert decision["decision"] == "decline"
    assert decision["payout"] == 0.0
    assert decision["policy_section"] == "Section 3, Trip Delay"


def test_instructions_come_from_the_backend(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "backend", lambda: TestClient(app))
    instructions = tmp_path / "instructions.md"
    instructions.write_text("Decide claims carefully.", encoding="utf-8")
    monkeypatch.setattr(backend.main, "INSTRUCTIONS", instructions)
    prompts = []
    original = main.create_agent

    def create_agent(llm, tools, system_prompt):
        prompts.append(system_prompt)
        return original(llm, tools=tools, system_prompt=system_prompt)

    monkeypatch.setattr(main, "create_agent", create_agent)
    main.run("CLM-1001", "thread-1", stub(AIMessage(content="Done.")))
    assert prompts == ["Decide claims carefully."]
    assert client.get("/api/claims/CLM-1001").json()["status"] == "in_progress"


def test_run_agent_starts_a_run_in_the_background(monkeypatch):
    runs = []
    monkeypatch.setattr(main, "run", lambda *args: runs.append(args))
    response = client.post("/api/claims/CLM-1001/run")
    thread_id = response.json()["thread_id"]
    assert runs == [("CLM-1001", thread_id)]


def test_run_agent_on_a_decided_claim_is_refused(monkeypatch):
    monkeypatch.setattr(main, "run", lambda *args: None)
    client.post(
        "/api/claims/CLM-1001/decision",
        json={
            "decision": "refer",
            "payout": 0,
            "reasons": "Needs a person.",
            "policy_section": "Section 11, How to claim",
        },
    )
    assert client.post("/api/claims/CLM-1001/run").status_code == 409


def test_main_works_the_waiting_claims(monkeypatch, capsys):
    monkeypatch.setattr(main, "backend", lambda: TestClient(app))
    monkeypatch.setattr(main, "run", lambda claim_id, thread_id: "Done.")
    client.post("/api/claims/CLM-1001/start")
    main.main([])
    lines = capsys.readouterr().out.splitlines()
    assert len(lines) == 24
    assert "CLM-1001: Done." not in lines
    assert "CLM-1002: Done." in lines


def test_main_runs_the_named_claims(monkeypatch, capsys):
    monkeypatch.setattr(main, "run", lambda claim_id, thread_id: "Done.")
    monkeypatch.setattr("sys.argv", ["agent", "CLM-1003"])
    runpy.run_module("agent", run_name="__main__")
    assert capsys.readouterr().out == "CLM-1003: Done.\n"


def test_model_name(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("MODEL_NAME", raising=False)
    assert main.model().model_name == "openai/gpt-6-luna"
    assert main.model().reasoning_effort == "low"
    monkeypatch.setenv("MODEL_NAME", "openrouter/free")
    assert main.model().model_name == "openrouter/free"
