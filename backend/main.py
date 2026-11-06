"""The UnderCover backend."""

import json
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException

from backend import db
from backend.models import (
    Claim,
    ClaimSummary,
    Customer,
    Decision,
    Handler,
    Instructions,
    Policy,
    PolicyWording,
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
