# Plan: the claims pilot

This plan builds the pilot in `docs/SPEC.md`: a backend that holds UnderCover's claims, the UnderCover Agent that decides them, and a dashboard where the claims team watches the queue, the agent's work and its decisions. It follows `docs/TECH_STACK.md`, `docs/CODE_STANDARDS.md`, `docs/PROCESS.md` and `docs/BRAND.md`.

## The shape of the build

```
dashboard (React)  ──HTTP──▶  backend (FastAPI + SQLite)  ◀──HTTP──  agent (create_agent on OpenRouter)
                                    │                                  ▲
                                    └── seeded from data/              └── started by the backend or the command line
                                        (never data/evals/)
```

- **The backend is the single source of truth.** It loads `data/` into SQLite, serves claims, policies, customers, the policy wording and the agent's instructions, and enforces the rules. The $1,000 sign-off rule lives here, not in the agent's prompt, so a payment is blocked whatever the agent does.
- **The agent only talks to the backend's API.** Its tools are thin wrappers over API operations. It fetches its instructions from the backend at the start of each run.
- **The harness records the agent's steps, not the model.** `run()` streams the agent and posts each model message, tool call and tool result to the backend. The model can't skip or invent a step, and the dashboard shows them as they happen.
- **The dashboard reads and polls the API.** No new libraries: plain React with a small hash-based router (`#/claims/CLM-1001`).

### Decisions worth reviewing

1. **Plain `sqlite3`, no ORM.** Seven small tables, written queries are short and readable. The database file (`backend/undercover.db`, already ignored by `*.db`) is created and seeded on first start; `npm run seed` resets it to the queue in `data/`.
2. **Claim, policy and customer records are stored as JSON** next to the columns we query or change (`status`, ids). The data is document-shaped (stories, items, documents, travelers, claim history) and the pilot never queries inside it, so splitting it into many tables would add code without value.
3. **Statuses:** `waiting`, `in_progress`, `awaiting_sign_off`, `decided`, shown as Waiting, In progress, Waiting for sign-off and Decided. The data's `open` becomes `waiting`. A referral is a decision, so a referred claim is `decided` with the decision `refer`.
4. **Deciding and paying are separate operations,** as the tech stack asks. `record_decision` stores approve, decline or refer with the payout, reasons and policy section. `pay_claim` takes the amount, and the backend refuses it unless the claim is approved for exactly that amount, isn't already paid, and, for a payout over the company's limit ($1,000.00 from `company.json`), a handler has signed off.
5. **Sign-off pays.** When a handler signs off a claim waiting for sign-off, the backend records who signed and makes the payment (a record, no real money) in one step, and the claim becomes `decided`. With no sign-in, the handler picks their name from the three in `handlers.json`.
6. **Starting the agent:** a "Run the agent" button on a claim calls `run_agent`, which runs the agent in a background task inside the backend. `uv run -m agent` works through every waiting claim from the command line, and `uv run -m agent CLM-1001` does one. Both go through the same `run(claim_id, thread_id)` entry point.
7. **Tests never call a model.** Python tests use the existing `StubModel` with scripted replies. The end-to-end tests play the agent's part by calling the same API operations it calls, then check what the dashboard shows. They run against their own freshly seeded database on their own ports, so they never touch your development data.
8. **The evaluation set stays out.** The seeder loads named files from `data/` and nothing from `data/evals/`. No code in `backend/` or `agent/` refers to it. Scoring the agent against the handlers' decisions comes in a later build.

## Data model

| Table | Columns | From |
|---|---|---|
| `company` | `id`, `record` (JSON) | `company.json` |
| `handlers` | `handler_id`, `record` (JSON) | `handlers.json` |
| `customers` | `customer_id`, `record` (JSON) | `customers.json` |
| `policies` | `policy_id`, `customer_id`, `record` (JSON) | `policies.json` |
| `claims` | `claim_id`, `policy_id`, `customer_id`, `status`, `record` (JSON) | `claims.json` |
| `decisions` | `claim_id`, `decision`, `payout`, `reasons`, `policy_section`, `decided_at`, `signed_off_by`, `signed_off_at`, `paid_amount`, `paid_at` | written by the agent and handlers |
| `steps` | `id`, `claim_id`, `thread_id`, `kind`, `title`, `detail`, `created_at` | written by the agent's harness |

The policy wording is read from `data/policy_wording.md`. The agent's instructions live in `backend/instructions.md`, a file in the repo the dashboard shows read only.

## API

Every operation has an `operation_id`, a one-line docstring and no optional inputs.

| Method and path | `operation_id` | Used by | What it does |
|---|---|---|---|
| `GET /api/health` | `health` | dashboard | Already built |
| `GET /api/claims` | `list_claims` | dashboard | The queue: id, customer name, type, amount claimed, submitted date, status, decision, payout |
| `GET /api/claims/{claim_id}` | `get_claim` | agent, dashboard | The full claim with its decision and payment |
| `GET /api/policies/{policy_id}` | `get_policy` | agent, dashboard | The policy: plan, add-ons, trip, travelers |
| `GET /api/customers/{customer_id}` | `get_customer` | agent, dashboard | The customer and their claim history |
| `GET /api/policy-wording` | `get_policy_wording` | agent | The policy wording as Markdown |
| `GET /api/instructions` | `get_instructions` | agent, dashboard | The agent's instructions |
| `GET /api/handlers` | `list_handlers` | dashboard | The claims handlers |
| `POST /api/claims/{claim_id}/start` | `start_claim` | harness | Marks the claim in progress |
| `POST /api/claims/{claim_id}/steps` | `add_step` | harness | Records one step: thread id, kind, title, detail |
| `GET /api/claims/{claim_id}/steps` | `list_steps` | dashboard | The steps of the claim's latest run |
| `POST /api/claims/{claim_id}/decision` | `record_decision` | agent | Records approve, decline or refer with payout, reasons and policy section; sets the status to `decided`, or `awaiting_sign_off` for an approval over the limit |
| `POST /api/claims/{claim_id}/payment` | `pay_claim` | agent | Pays the given amount, or refuses with the reason |
| `POST /api/claims/{claim_id}/sign-off` | `sign_off_claim` | dashboard | A handler signs off; the payment is made and the claim is decided |
| `POST /api/claims/{claim_id}/run` | `run_agent` | dashboard | Starts the agent on the claim in the background and returns its thread id |

Errors: 404 for an unknown claim, policy, customer or handler; 409 for an operation that doesn't fit the claim's state (a second decision, paying a declined claim, paying the wrong amount, paying twice, signing off a claim that isn't waiting); 403 for a payment that needs sign-off. Each refusal carries a plain sentence the agent and the dashboard can show, such as "Payment held: payouts over $1,000.00 need a handler's sign-off."

## Phase 1: The data and the read API

Build `backend/db.py` (schema, connection per request, seeding from `data/`), `backend/seed.py` (`uv run -m backend.seed` rebuilds the database; `npm run seed` runs it) and the read operations. The database path comes from the environment variable `UNDERCOVER_DB`, defaulting to `backend/undercover.db`, so tests and end-to-end runs use their own.

Success criteria:

- [x] `uv run -m backend.seed` creates `backend/undercover.db` with 25 claims, 50 policies, 49 customers and 3 handlers, all claims `waiting`
- [x] The backend creates and seeds the database on start when the file doesn't exist
- [x] `GET /api/claims` returns 25 claims in submission order, each with customer name, type, amount claimed, submitted date and status
- [x] `GET /api/claims/CLM-1001` returns the story, the 3 items, the 4 documents and `"status": "waiting"`; `GET /api/claims/CLM-9999` returns 404
- [x] `GET /api/policies/POL-2001` returns the Premium plan and the Rome trip; `GET /api/customers/CUS-3001` returns Maya Patel with claim CLM-0412 in her history
- [x] `GET /api/policy-wording` returns the wording, starting "# UnderCover Travel Insurance: Policy Wording"
- [x] `GET /api/instructions` returns the contents of `backend/instructions.md`
- [x] `GET /api/handlers` returns Dana Whitfield, Marcus Oyelaran and Priya Raman
- [x] Every route in the OpenAPI schema at `/openapi.json` has an `operationId` and a summary, checked by a test
- [x] `grep -rn evals backend agent` finds nothing
- [x] pytest covers each operation against a temporary database, and `npm run check:python` passes with coverage of 80% or more

## Phase 2: Decisions, payments and the sign-off rule

Add `start_claim`, `add_step`, `list_steps`, `record_decision`, `pay_claim` and `sign_off_claim`. This is where the business rules live, so it gets the most tests.

Success criteria:

- [x] `start_claim` moves a waiting claim to `in_progress`
- [x] `add_step` stores a step, and `list_steps` returns the steps of the claim's latest thread in order
- [x] `record_decision` with approve and a payout of $420.00 sets the claim to `decided`; with approve and $1,250.00 it sets `awaiting_sign_off`
- [x] `record_decision` with decline or refer requires a payout of $0.00 and sets `decided`
- [x] `record_decision` refuses a payout above the amount claimed (added during the build, after a security review)
- [x] A second `record_decision` on the same claim returns 409
- [x] `pay_claim` for $420.00 on a claim approved for $420.00 records the payment; paying it again returns 409
- [x] `pay_claim` for a different amount than the approved payout returns 409
- [x] `pay_claim` on a declined, referred or undecided claim returns 409
- [x] `pay_claim` for $1,250.00 on a claim approved for $1,250.00 returns 403 "Payment held: payouts over $1,000.00 need a handler's sign-off." and records no payment
- [x] `sign_off_claim` with `HND-01` on that claim records Dana Whitfield's sign-off, pays $1,250.00 and sets `decided`
- [x] `sign_off_claim` on a claim that isn't waiting for sign-off returns 409; with an unknown handler, 404
- [x] `GET /api/claims/{id}` shows the decision, the sign-off and the payment
- [x] The limit is read from `company.json`, not written into the code
- [x] `npm run check:python` passes with coverage of 80% or more

## Phase 3: The UnderCover Agent

Rewrite `agent/main.py` around the claim workflow:

- **Tools:** `get_claim`, `get_policy`, `get_customer`, `get_policy_wording`, `record_decision` (decision, payout, reasons, policy section) and `pay_claim` (amount). Each calls one API operation. The tools are built for each run and tied to its claim, so they take no ids and can't reach another claim (changed during the build, after a security review). A refusal from the backend comes back to the model as text, so it learns that the payment is held rather than crashing.
- **Instructions:** `backend/instructions.md` tells the agent to read the claim, the policy, the customer's history and the wording; decide from the policy wording alone; work out the payout using the plan's limits, the deductible and anything already paid by a carrier; record the decision with two or three sentences of reasons and the section of the wording, such as "Section 3, Trip Delay"; and then pay an approved claim. `run()` fetches them from `get_instructions`.
- **Harness:** `run(claim_id, thread_id)` calls `start_claim`, then streams the agent and posts each model message, tool call and tool result as a step. It returns the agent's final reply.
- **Command line:** `uv run -m agent` works through every waiting claim one at a time; `uv run -m agent CLM-1001` runs one.
- **Backend:** `run_agent` starts `run()` in a FastAPI background task with a new thread id.

Success criteria:

- [x] A stub-model test drives the full flow on CLM-1001: the agent reads the claim, policy, customer and wording, approves $420.00, pays it, and the claim is `decided` and paid
- [x] A stub-model test approves a claim for $1,250.00 and tries to pay it: the tool returns the backend's refusal, no payment is recorded, and the claim is `awaiting_sign_off`
- [x] A stub-model test declines a claim with a $0.00 payout and a policy section
- [x] Each run records its steps against its thread id, in order, including the tool calls and their results
- [x] The agent gets its instructions from `GET /api/instructions` (a test changes them in the backend and sees the change in the model's system message)
- [x] `run_agent` returns a thread id and calls `run()` in the background (tested with `run()` replaced)
- [x] `MODEL_NAME` still chooses the model, with `openai/gpt-6-luna` at low reasoning effort by default
- [x] With the backend running and the real model, `uv run -m agent CLM-1001` records a decision with reasons and a policy section, and its steps appear at `GET /api/claims/CLM-1001/steps` (one live claim, a few cents of spend)
- [x] `npm run check:python` passes with coverage of 80% or more

## Phase 4: The dashboard foundation and the queue

Replace the hello-world page with the dashboard's frame and the queue.

- `dashboard/src/api.ts`: typed fetch functions and types for every operation the dashboard uses
- The brand: Instrument Sans, Instrument Serif and JetBrains Mono from Google Fonts; colors as CSS variables with light and dark modes from `prefers-color-scheme`; rounded panels with no outline
- A header with "UnderCover Claims" and two links, Queue and Agent instructions, plus the backend status the skeleton showed
- The queue: a count for each status (Waiting in Cerulean, In progress in Marigold, Waiting for sign-off in Coral, Decided in Sea Green, with darkened text where the brand asks), then a table of the 25 claims with id, customer, type, amount claimed, submitted, status, decision and payout. Ids and amounts in JetBrains Mono, money as $1,250.00. A row opens the claim. The queue refreshes every few seconds so a running agent's progress shows

Success criteria:

- [x] vitest tests cover the queue table, the status counts, the money format and the router
- [x] `npm run check:ts` passes with coverage of 80% or more, strict TypeScript and no `any`
- [x] In the browser, `http://localhost:5173` shows the queue with 25 waiting claims and "Waiting 25"
- [x] The page uses the brand fonts and colors in light mode and in dark mode (checked with a screenshot of each)
- [x] Clicking CLM-1001 goes to `#/claims/CLM-1001`

## Phase 5: The claim page and the instructions page

- **Claim page:** the customer's story, the items claimed and the documents; the policy (plan, add-ons, trip, travelers) and the customer's claim history; the decision panel with the decision, payout, reasons, policy section and payment status (Paid, Waiting for sign-off or Not paid); and the agent's activity, a step-by-step list in plain words ("Read the claim", "Read the policy wording", "Recorded the decision", "Payment held for sign-off") with each tool's detail available to expand. While the claim is in progress the activity refreshes every two seconds.
- **Run the agent:** a button on a waiting or in-progress claim that calls `run_agent`.
- **Sign-off:** on a claim waiting for sign-off, a handler picks their name and clicks "Sign off and pay", which calls `sign_off_claim` and shows the payment.
- **Agent instructions:** the instructions from `get_instructions`, read only.

Success criteria:

- [ ] vitest tests cover the claim page in each status, the activity list, the run button, the sign-off form and the instructions page
- [ ] `npm run check:ts` passes with coverage of 80% or more
- [ ] In the browser, CLM-1001 shows its story, its items totaling $420.00, its documents, the Premium policy and Maya Patel's earlier claim
- [ ] In the browser, the instructions page shows the text of `backend/instructions.md` with no way to edit it
- [ ] In the browser, clicking "Run the agent" on a waiting claim with the real model shows the steps appearing, then the decision with its reasons and policy section, and the queue's counts update (one live claim)
- [ ] In the browser, a claim approved over $1,000 shows "Waiting for sign-off", and signing off as Dana Whitfield shows it paid and decided

## Phase 6: End-to-end tests and handover

- Playwright starts its own backend on port 8001 with a freshly seeded database in `e2e/test-results/`, and its own dashboard on port 5174 pointed at it (`vite.config.ts` reads the backend URL from an environment variable, defaulting to port 8000)
- End-to-end tests, playing the agent's part through the API:
  - the queue shows 25 waiting claims
  - a claim's page shows its story, documents, policy and history
  - steps recorded for a claim appear in its activity, and a recorded decision appears on the claim and in the queue
  - an approval over $1,000 is refused payment, shows "Waiting for sign-off", and a handler's sign-off pays it
  - the instructions page shows the instructions
- `docs/STATUS.md` says what's built and how to run it; the README gets the short version

Success criteria:

- [ ] `npm run e2e` passes, and running it twice in a row passes both times
- [ ] Running `npm run e2e` while `npm run dev` is up leaves the development database unchanged
- [ ] `npm run check` passes: ruff, pyright, pytest at 80%+, ESLint, Prettier, tsc, vitest at 80%+ and Playwright
- [ ] `docs/STATUS.md` describes the pilot, how to run it (`npm run dev`, `npm run seed`, `uv run -m agent`) and what's not built yet
- [ ] With the real model, `uv run -m agent` works through several waiting claims and the dashboard shows each one decided or waiting for sign-off (live spend, a few claims only unless you ask for the full queue)

## Not in this build

From the spec's "Not for now": the claims manual, sign-in, real payments and messages to customers. Also left for later builds: scoring the agent against `data/evals/`, durable agent state, and anything from the later briefs.
