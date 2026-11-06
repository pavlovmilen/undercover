# Status

The claims pilot from `docs/PLAN.md`, in progress.

## Built

- `backend/`: FastAPI and SQLite. The database (`backend/undercover.db`, or the path in `UNDERCOVER_DB`) is created from `data/` on first start, never from `data/evals/`. Read operations for the queue, claims, policies, customers, the policy wording, the agent's instructions (`backend/instructions.md`) and the handlers. Write operations for the agent's steps, its decision and the payment, and a handler's sign-off. A payout over the limit in `company.json` ($1,000.00) is held until a handler signs off, and the backend refuses the payment until then.
- `agent/`: the UnderCover Agent, `create_agent` on OpenRouter. `run(claim_id, thread_id)` fetches its instructions from the backend, reads the claim, the policy, the customer and the policy wording through the API, records its decision and pays approved claims. Each model message, tool call and tool result is recorded as a step. The dashboard's run button (`run_agent`) starts it in the background; `uv run -m agent` works every waiting claim and `uv run -m agent CLM-1001` one claim, with the backend running.
- `dashboard/`: React, Vite and TypeScript in the UnderCover brand, light and dark. The queue, with a bar and counts showing where the claims stand, refreshing every three seconds. Each claim's page shows the story, items, documents, policy and claim history, the decision with its reasons, policy section and payment, and the agent's activity step by step, refreshing every two seconds. A button runs the agent on a waiting claim, and a handler signs off payouts over $1,000.00. The agent's instructions are shown read only.
- `e2e/`: one test of that page

## Running it

- `uv sync` and `npm install`, then `npm run dev` for the backend and the dashboard
- `uv run -m agent [claim id ...]` runs the agent with the real model (the backend must be running)
- `npm run seed` resets the database to the queue in `data/`
- `npm run check` runs every check
