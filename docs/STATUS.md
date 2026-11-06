# Status

The claims pilot from `docs/PLAN.md`, in progress.

## Built

- `backend/`: FastAPI and SQLite. The database (`backend/undercover.db`, or the path in `UNDERCOVER_DB`) is created from `data/` on first start, never from `data/evals/`. Read operations for the queue, claims, policies, customers, the policy wording, the agent's instructions (`backend/instructions.md`) and the handlers.
- `agent/`: the skeleton's entry point `run(claim_id, thread_id)`, with one tool that calls the health route
- `dashboard/`: one page that shows whether the backend is up
- `e2e/`: one test of that page

## Running it

- `uv sync` and `npm install`, then `npm run dev` for the backend and the dashboard
- `npm run seed` resets the database to the queue in `data/`
- `npm run check` runs every check
