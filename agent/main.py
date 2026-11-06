"""The UnderCover Agent."""

import json
import os
import uuid
from collections.abc import Iterator
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

load_dotenv(override=True)

BACKEND_URL = "http://localhost:8000"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-6-luna"


def backend() -> httpx.Client:
    """Return a client for the UnderCover backend."""
    return httpx.Client(base_url=BACKEND_URL, timeout=30)


def answer(response: httpx.Response) -> str:
    """Return the backend's reply, or its reason for refusing."""
    if response.is_client_error:
        return f"Refused: {response.json()['detail']}"
    response.raise_for_status()
    return response.text


def get(path: str) -> str:
    """Get a path from the backend."""
    with backend() as client:
        return answer(client.get(path))


def post(path: str, body: dict[str, Any]) -> str:
    """Post a body to a path on the backend."""
    with backend() as client:
        return answer(client.post(path, json=body))


@tool
def get_claim(claim_id: str) -> str:
    """Get a claim: the customer's story, the items claimed and the documents."""
    return get(f"/api/claims/{claim_id}")


@tool
def get_policy(policy_id: str) -> str:
    """Get a policy: the plan, the add-ons, the trip and the travelers."""
    return get(f"/api/policies/{policy_id}")


@tool
def get_customer(customer_id: str) -> str:
    """Get a customer with their earlier claims."""
    return get(f"/api/customers/{customer_id}")


@tool
def get_policy_wording() -> str:
    """Get the policy wording, which every decision must follow."""
    return json.loads(get("/api/policy-wording"))["wording"]


@tool
def record_decision(
    claim_id: str,
    decision: Literal["approve", "decline", "refer"],
    payout: float,
    reasons: str,
    policy_section: str,
) -> str:
    """Record the decision on a claim, with the payout in US dollars ($0.00 unless
    approved), two or three sentences of reasons and the section of the wording."""
    return post(
        f"/api/claims/{claim_id}/decision",
        {
            "decision": decision,
            "payout": payout,
            "reasons": reasons,
            "policy_section": policy_section,
        },
    )


@tool
def pay_claim(claim_id: str, amount: float) -> str:
    """Pay an approved claim its payout in US dollars."""
    return post(f"/api/claims/{claim_id}/payment", {"amount": amount})


TOOLS = [
    get_claim,
    get_policy,
    get_customer,
    get_policy_wording,
    record_decision,
    pay_claim,
]


def model() -> ChatOpenAI:
    """Return the model named in MODEL_NAME, or GPT-6 Luna by default."""
    name = os.getenv("MODEL_NAME")
    return ChatOpenAI(
        model=name or DEFAULT_MODEL,
        base_url=OPENROUTER_BASE_URL,
        api_key=SecretStr(os.environ["OPENROUTER_API_KEY"]),
        reasoning_effort=None if name else "low",
    )


def steps(message: BaseMessage) -> list[dict[str, str]]:
    """Turn one of the agent's messages into the steps the dashboard shows."""
    if isinstance(message, ToolMessage):
        return [
            {"kind": "tool_result", "title": message.name or "", "detail": message.text}
        ]
    found = []
    if message.text:
        found.append({"kind": "message", "title": "agent", "detail": message.text})
    if isinstance(message, AIMessage):
        found.extend(
            {
                "kind": "tool_call",
                "title": call["name"],
                "detail": json.dumps(call["args"]),
            }
            for call in message.tool_calls
        )
    return found


def messages(updates: Iterator[dict[str, Any]]) -> Iterator[BaseMessage]:
    """Yield each new message from the agent's stream of updates."""
    for update in updates:
        for node in update.values():
            yield from (node or {}).get("messages", [])


def run(claim_id: str, thread_id: str, llm: BaseChatModel | None = None) -> str:
    """Run the agent on one claim, recording each step, and return its reply."""
    with backend() as client:
        client.post(f"/api/claims/{claim_id}/start").raise_for_status()
        instructions = client.get("/api/instructions").json()["instructions"]
    agent = create_agent(llm or model(), tools=TOOLS, system_prompt=instructions)
    updates = agent.stream(
        {"messages": [{"role": "user", "content": f"Please decide claim {claim_id}."}]},
        config={"configurable": {"thread_id": thread_id}},
        stream_mode="updates",
    )
    reply = ""
    with backend() as client:
        for message in messages(updates):
            for step in steps(message):
                client.post(
                    f"/api/claims/{claim_id}/steps",
                    json={"thread_id": thread_id} | step,
                ).raise_for_status()
            if isinstance(message, AIMessage):
                reply = message.text
    return reply


def waiting_claims() -> list[str]:
    """Return the ids of the claims waiting in the queue."""
    with backend() as client:
        claims = client.get("/api/claims").json()
    return [claim["claim_id"] for claim in claims if claim["status"] == "waiting"]


def main(claim_ids: list[str]) -> None:
    """Run the agent on the given claims, or on every waiting claim."""
    for claim_id in claim_ids or waiting_claims():
        print(f"{claim_id}: {run(claim_id, str(uuid.uuid4()))}")
