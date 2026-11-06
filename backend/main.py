"""The UnderCover backend."""

import json
import sqlite3
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException

from agent import main as agent
from backend import db
from backend.models import (
    Claim,
    ClaimSummary,
    Customer,
    Decision,
    DecisionIn,
    Handler,
    Instructions,
    PaymentIn,
    Policy,
    PolicyWording,
    Run,
    SignOffIn,
    Step,
    StepIn,
)

INSTRUCTIONS = Path(__file__).parent / "instructions.md"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    if not db.path().exists():
        db.seed(db.path())
    yield


app = FastAPI(title="UnderCover", lifespan=lifespan)

Conn = Annotated[sqlite3.Connection, Depends(db.connect)]


def found(row: sqlite3.Row | None, what: str) -> sqlite3.Row:
    """Return the row, or raise a 404 naming what was missing."""
    if row is None:
        raise HTTPException(404, f"No {what}.")
    return row


def decision_of(conn: sqlite3.Connection, claim_id: str) -> Decision | None:
    """Return the claim's decision, if it has one."""
    row = conn.execute(
        "SELECT * FROM decisions WHERE claim_id = ?", [claim_id]
    ).fetchone()
    return None if row is None else Decision.model_validate(dict(row))


def load_claim(conn: sqlite3.Connection, claim_id: str) -> Claim:
    """Return the claim with its status and decision, or raise a 404."""
    row = found(
        conn.execute(
            "SELECT status, record FROM claims WHERE claim_id = ?", [claim_id]
        ).fetchone(),
        f"claim {claim_id}",
    )
    return Claim.model_validate(
        json.loads(row["record"])
        | {"status": row["status"], "decision": decision_of(conn, claim_id)}
    )


@app.get("/api/health", operation_id="health")
def health() -> dict[str, str]:
    """Check that the backend is running."""
    return {"status": "ok"}


@app.get("/api/claims", operation_id="list_claims")
def list_claims(conn: Conn) -> list[ClaimSummary]:
    """List the claims queue with each claim's status and decision."""
    rows = conn.execute(
        """
        SELECT claims.status, claims.record AS claim, customers.record AS customer,
               decisions.decision, decisions.payout
        FROM claims
        JOIN customers USING (customer_id)
        LEFT JOIN decisions USING (claim_id)
        """
    ).fetchall()
    summaries = []
    for row in rows:
        claim = json.loads(row["claim"])
        summaries.append(
            ClaimSummary(
                claim_id=claim["claim_id"],
                customer_name=json.loads(row["customer"])["name"],
                claim_type=claim["claim_type"],
                summary=claim["summary"],
                amount_claimed=claim["amount_claimed"],
                submitted_on=claim["submitted_on"],
                status=row["status"],
                decision=row["decision"],
                payout=row["payout"],
            )
        )
    return sorted(summaries, key=lambda s: (s.submitted_on, s.claim_id))


@app.get("/api/claims/{claim_id}", operation_id="get_claim")
def get_claim(claim_id: str, conn: Conn) -> Claim:
    """Get a claim in full, with its decision and payment."""
    return load_claim(conn, claim_id)


@app.get("/api/policies/{policy_id}", operation_id="get_policy")
def get_policy(policy_id: str, conn: Conn) -> Policy:
    """Get a policy: its plan, add-ons, trip and travelers."""
    row = found(
        conn.execute(
            "SELECT record FROM policies WHERE policy_id = ?", [policy_id]
        ).fetchone(),
        f"policy {policy_id}",
    )
    return Policy.model_validate_json(row["record"])


@app.get("/api/customers/{customer_id}", operation_id="get_customer")
def get_customer(customer_id: str, conn: Conn) -> Customer:
    """Get a customer with their claim history."""
    row = found(
        conn.execute(
            "SELECT record FROM customers WHERE customer_id = ?", [customer_id]
        ).fetchone(),
        f"customer {customer_id}",
    )
    return Customer.model_validate_json(row["record"])


@app.get("/api/policy-wording", operation_id="get_policy_wording")
def get_policy_wording() -> PolicyWording:
    """Get the policy wording as Markdown."""
    return PolicyWording(
        wording=(db.DATA / "policy_wording.md").read_text(encoding="utf-8")
    )


@app.get("/api/instructions", operation_id="get_instructions")
def get_instructions() -> Instructions:
    """Get the UnderCover Agent's instructions."""
    return Instructions(instructions=INSTRUCTIONS.read_text(encoding="utf-8"))


@app.get("/api/handlers", operation_id="list_handlers")
def list_handlers(conn: Conn) -> list[Handler]:
    """List the claims handlers."""
    rows = conn.execute("SELECT record FROM handlers ORDER BY handler_id").fetchall()
    return [Handler.model_validate_json(row["record"]) for row in rows]


def now() -> str:
    """Return the current time in UTC as an ISO 8601 string."""
    return datetime.now(UTC).isoformat(timespec="seconds")


def money(amount: float) -> str:
    """Format an amount in US dollars, such as $1,250.00."""
    return f"${amount:,.2f}"


def approval_limit(conn: sqlite3.Connection) -> float:
    """Return the payout above which a handler must sign off."""
    row = conn.execute("SELECT record FROM company").fetchone()
    return json.loads(row["record"])["payout_approval_limit"]


def set_status(conn: sqlite3.Connection, claim_id: str, status: str) -> None:
    """Move a claim to a new status."""
    conn.execute("UPDATE claims SET status = ? WHERE claim_id = ?", [status, claim_id])


def check_open(conn: sqlite3.Connection, claim_id: str) -> None:
    """Raise a 409 unless the claim is waiting or in progress."""
    if load_claim(conn, claim_id).status not in ("waiting", "in_progress"):
        raise HTTPException(409, f"Claim {claim_id} already has a decision.")


@app.post("/api/claims/{claim_id}/start", operation_id="start_claim")
def start_claim(claim_id: str, conn: Conn) -> Claim:
    """Mark a claim as in progress."""
    check_open(conn, claim_id)
    set_status(conn, claim_id, "in_progress")
    return load_claim(conn, claim_id)


@app.post("/api/claims/{claim_id}/steps", operation_id="add_step")
def add_step(claim_id: str, step: StepIn, conn: Conn) -> Step:
    """Record one step of the agent's work on a claim."""
    load_claim(conn, claim_id)
    created_at = now()
    cursor = conn.execute(
        """
        INSERT INTO steps (claim_id, thread_id, kind, title, detail, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [claim_id, step.thread_id, step.kind, step.title, step.detail, created_at],
    )
    return Step(id=cursor.lastrowid or 0, created_at=created_at, **step.model_dump())


@app.get("/api/claims/{claim_id}/steps", operation_id="list_steps")
def list_steps(claim_id: str, conn: Conn) -> list[Step]:
    """List the steps of the agent's latest run on a claim."""
    load_claim(conn, claim_id)
    rows = conn.execute(
        """
        SELECT id, thread_id, kind, title, detail, created_at FROM steps
        WHERE claim_id = ?1 AND thread_id = (
            SELECT thread_id FROM steps WHERE claim_id = ?1 ORDER BY id DESC LIMIT 1
        )
        ORDER BY id
        """,
        [claim_id],
    ).fetchall()
    return [Step.model_validate(dict(row)) for row in rows]


@app.post("/api/claims/{claim_id}/decision", operation_id="record_decision")
def record_decision(claim_id: str, decision: DecisionIn, conn: Conn) -> Claim:
    """Record the decision on a claim: approve, decline or refer."""
    claim = load_claim(conn, claim_id)
    if claim.decision is not None:
        raise HTTPException(409, f"Claim {claim_id} already has a decision.")
    payout = round(decision.payout, 2)
    if payout > claim.amount_claimed:
        raise HTTPException(
            409,
            f"The payout can't be more than the {money(claim.amount_claimed)} claimed.",
        )
    conn.execute(
        """
        INSERT INTO decisions
            (claim_id, decision, payout, reasons, policy_section, decided_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            claim_id,
            decision.decision,
            payout,
            decision.reasons,
            decision.policy_section,
            now(),
        ],
    )
    over_limit = decision.decision == "approve" and payout > approval_limit(conn)
    set_status(conn, claim_id, "awaiting_sign_off" if over_limit else "decided")
    return load_claim(conn, claim_id)


@app.post("/api/claims/{claim_id}/payment", operation_id="pay_claim")
def pay_claim(claim_id: str, payment: PaymentIn, conn: Conn) -> Claim:
    """Pay an approved claim the given amount."""
    decision = load_claim(conn, claim_id).decision
    if decision is None or decision.decision != "approve":
        raise HTTPException(409, f"Claim {claim_id} is not approved for payment.")
    if decision.paid_amount is not None:
        raise HTTPException(409, f"Claim {claim_id} is already paid.")
    if round(payment.amount, 2) != decision.payout:
        raise HTTPException(
            409,
            f"The approved payout is {money(decision.payout)}, "
            "so the payment must be that amount.",
        )
    limit = approval_limit(conn)
    if decision.payout > limit and decision.signed_off_by is None:
        raise HTTPException(
            403,
            f"Payment held: payouts over {money(limit)} need a handler's sign-off.",
        )
    conn.execute(
        "UPDATE decisions SET paid_amount = payout, paid_at = ? WHERE claim_id = ?",
        [now(), claim_id],
    )
    return load_claim(conn, claim_id)


@app.post("/api/claims/{claim_id}/sign-off", operation_id="sign_off_claim")
def sign_off_claim(claim_id: str, sign_off: SignOffIn, conn: Conn) -> Claim:
    """Sign off a claim's payout as a handler, which pays it."""
    row = found(
        conn.execute(
            "SELECT record FROM handlers WHERE handler_id = ?", [sign_off.handler_id]
        ).fetchone(),
        f"handler {sign_off.handler_id}",
    )
    handler = Handler.model_validate_json(row["record"])
    if load_claim(conn, claim_id).status != "awaiting_sign_off":
        raise HTTPException(409, f"Claim {claim_id} is not waiting for sign-off.")
    if not handler.can_approve_over_limit:
        raise HTTPException(
            403, f"{handler.name} cannot sign off payouts over the limit."
        )
    signed_at = now()
    conn.execute(
        """
        UPDATE decisions
        SET signed_off_by = ?, signed_off_at = ?, paid_amount = payout, paid_at = ?
        WHERE claim_id = ?
        """,
        [handler.name, signed_at, signed_at, claim_id],
    )
    set_status(conn, claim_id, "decided")
    return load_claim(conn, claim_id)


@app.post("/api/claims/{claim_id}/run", operation_id="run_agent")
def run_agent(claim_id: str, background: BackgroundTasks, conn: Conn) -> Run:
    """Start the UnderCover Agent on a claim in the background."""
    check_open(conn, claim_id)
    thread_id = str(uuid.uuid4())
    background.add_task(agent.run, claim_id, thread_id)
    return Run(thread_id=thread_id)
