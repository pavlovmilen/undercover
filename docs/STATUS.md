# Status

The claims pilot from `docs/PLAN.md` is built.

## Built

- `backend/`: FastAPI and SQLite. The database (`backend/undercover.db`, or the path in `UNDERCOVER_DB`) is created from `data/` on first start, never from `data/evals/`. It serves the queue, claims, policies, customers, the policy wording, the agent's instructions (`backend/instructions.md`) and the handlers. It records the agent's steps, its decision and payments, and handlers' sign-offs. The rules live here: a payment must match an approved payout, a payout can't exceed the amount claimed, and a payout over the limit in `company.json` ($1,000.00) is refused until a handler signs off.
- `agent/`: the UnderCover Agent, `create_agent` on OpenRouter with `openai/gpt-6-luna` at low reasoning effort, or `MODEL_NAME`. `run(claim_id, thread_id)` fetches its instructions from the backend, reads the claim, the policy, the customer and the policy wording, records its decision and pays approved claims. Its tools are built for each run and tied to that claim. Each model message, tool call and tool result is recorded as a step.
- `dashboard/`: React, Vite and TypeScript in the UnderCover brand, light and dark.
  - The queue: a bar and counts for where the claims stand, and the table of claims, refreshing every three seconds.
  - A claim: the story, items, documents, policy and claim history; the decision with its reasons, policy section and payment; and the agent's activity step by step, refreshing every two seconds. "Run the agent" starts the agent on a waiting claim. A handler signs off payouts over $1,000.00, which pays them.
  - The agent's instructions, read only.
- `e2e/`: Playwright tests of the queue, a claim, the instructions, a decision and a sign-off. They play the agent's part through the API and run on their own ports (backend 8001, dashboard 5174) against a fresh database, `e2e/undercover-e2e.db`.

## Running it

- `uv sync` and `npm install`, then `npm run dev` for the backend (port 8000) and the dashboard (http://localhost:5173)
- `uv run -m agent` runs the agent on every waiting claim, and `uv run -m agent CLM-1001` on one. The backend must be running, and it calls the real model.
- `npm run seed` resets the database to the queue in `data/`. Stop `npm run dev` first.
- `npm run check` runs every check, and `npm run e2e` the end-to-end tests alone

## Not built yet

From the spec's "Not for now": the claims manual, sign-in, real payments and messages to customers. Also not built: scoring the agent against `data/evals/`, and anything from the later briefs.
