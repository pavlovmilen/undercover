"""The shapes of the API's requests and responses."""

from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator

Status = Literal["waiting", "in_progress", "awaiting_sign_off", "decided"]
Verdict = Literal["approve", "decline", "refer"]
StepKind = Literal["message", "tool_call", "tool_result"]


class Item(BaseModel):
    description: str
    category: str
    amount: float


class Document(BaseModel):
    name: str
    type: str
    content: str


class Decision(BaseModel):
    decision: Verdict
    payout: float
    reasons: str
    policy_section: str
    decided_at: str
    signed_off_by: str | None
    signed_off_at: str | None
    paid_amount: float | None
    paid_at: str | None


class Claim(BaseModel):
    claim_id: str
    policy_id: str
    customer_id: str
    claim_type: str
    submitted_on: str
    incident_date: str
    incident_location: str
    summary: str
    story: str
    items: list[Item]
    amount_claimed: float
    documents: list[Document]
    status: Status
    decision: Decision | None


class ClaimSummary(BaseModel):
    claim_id: str
    customer_name: str
    claim_type: str
    summary: str
    amount_claimed: float
    submitted_on: str
    status: Status
    decision: Verdict | None
    payout: float | None


class Trip(BaseModel):
    destination: str
    departs_on: str
    returns_on: str
    trip_cost: float


class Policy(BaseModel):
    policy_id: str
    customer_id: str
    plan: str
    add_ons: list[str]
    purchased_on: str
    sold_through: str
    trip: Trip
    travelers: list[str]
    status: str


class Address(BaseModel):
    street: str
    city: str
    state: str
    zip: str


class PreviousClaim(BaseModel):
    claim_id: str
    filed_on: str
    incident_date: str
    claim_type: str
    summary: str
    outcome: str
    amount_paid: float


class Customer(BaseModel):
    customer_id: str
    name: str
    email: str
    phone: str
    date_of_birth: str
    address: Address
    customer_since: str
    previous_claims: list[PreviousClaim]


class Handler(BaseModel):
    handler_id: str
    name: str
    role: str
    email: str
    can_approve_over_limit: bool


class PolicyWording(BaseModel):
    wording: str


class Instructions(BaseModel):
    instructions: str


class StepIn(BaseModel):
    thread_id: str
    kind: StepKind
    title: str
    detail: str


class Step(StepIn):
    id: int
    created_at: str


class DecisionIn(BaseModel):
    decision: Verdict
    payout: float = Field(ge=0)
    reasons: str = Field(min_length=1)
    policy_section: str = Field(min_length=1)

    @model_validator(mode="after")
    def payout_fits_decision(self) -> Self:
        if self.decision == "approve" and self.payout <= 0:
            raise ValueError("An approval needs a payout above $0.00.")
        if self.decision != "approve" and self.payout != 0:
            raise ValueError("A decline or referral has a payout of $0.00.")
        return self


class PaymentIn(BaseModel):
    amount: float


class SignOffIn(BaseModel):
    handler_id: str


class Run(BaseModel):
    thread_id: str
