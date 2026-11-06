import { vi } from "vitest";
import type { Claim, ClaimSummary, Customer, Policy, Step } from "./api";

/** Stub fetch with replies keyed by "METHOD /path". */
export function mockApi(routes: Record<string, unknown>) {
  const fetch = vi.fn((path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    const reply = routes[key];
    if (reply instanceof Response) return Promise.resolve(reply);
    if (reply === undefined) {
      return Promise.resolve(
        Response.json({ detail: `No route for ${key}.` }, { status: 404 }),
      );
    }
    return Promise.resolve(Response.json(reply));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

export function summary(overrides: Partial<ClaimSummary> = {}): ClaimSummary {
  return {
    claim_id: "CLM-1001",
    customer_name: "Maya Patel",
    claim_type: "trip_delay",
    summary: "Flight home canceled",
    amount_claimed: 420,
    submitted_on: "2026-06-24",
    status: "waiting",
    decision: null,
    payout: null,
    ...overrides,
  };
}

export function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    claim_id: "CLM-1001",
    policy_id: "POL-2001",
    customer_id: "CUS-3001",
    claim_type: "trip_delay",
    submitted_on: "2026-06-24",
    incident_date: "2026-06-18",
    incident_location: "Rome, Italy",
    summary: "Flight home canceled by the airline",
    story: "My flight home from Rome was canceled.",
    items: [
      {
        description: "Airport hotel, one night",
        category: "accommodation",
        amount: 245,
      },
      { description: "Dinner and breakfast", category: "meals", amount: 175 },
    ],
    amount_claimed: 420,
    documents: [
      {
        name: "Meridian Air cancellation notice",
        type: "carrier_report",
        content: "Flight MA 611 was canceled.",
      },
    ],
    status: "waiting",
    decision: null,
    ...overrides,
  };
}

export const policy: Policy = {
  policy_id: "POL-2001",
  plan: "premium",
  add_ons: ["electronics_plus"],
  purchased_on: "2026-04-22",
  trip: {
    destination: "Rome, Italy",
    departs_on: "2026-06-10",
    returns_on: "2026-06-18",
    trip_cost: 3100,
  },
  travelers: ["Maya Patel"],
};

export const customer: Customer = {
  customer_id: "CUS-3001",
  name: "Maya Patel",
  customer_since: "2023-04-11",
  previous_claims: [
    {
      claim_id: "CLM-0412",
      filed_on: "2024-08-19",
      claim_type: "baggage_delay",
      summary: "Checked bag arrived 30 hours late in Lisbon",
      outcome: "approved",
      amount_paid: 140,
    },
  ],
};

export function step(
  id: number,
  kind: Step["kind"],
  title: string,
  detail = "",
): Step {
  return {
    id,
    thread_id: "t1",
    kind,
    title,
    detail,
    created_at: "2026-11-06T17:05:51+00:00",
  };
}
