export type Status =
  "waiting" | "in_progress" | "awaiting_sign_off" | "decided";
export type Verdict = "approve" | "decline" | "refer";

export interface ClaimSummary {
  claim_id: string;
  customer_name: string;
  claim_type: string;
  summary: string;
  amount_claimed: number;
  submitted_on: string;
  status: Status;
  decision: Verdict | null;
  payout: number | null;
}

export interface Item {
  description: string;
  category: string;
  amount: number;
}

export interface Document {
  name: string;
  type: string;
  content: string;
}

export interface Decision {
  decision: Verdict;
  payout: number;
  reasons: string;
  policy_section: string;
  decided_at: string;
  signed_off_by: string | null;
  signed_off_at: string | null;
  paid_amount: number | null;
  paid_at: string | null;
}

export interface Claim {
  claim_id: string;
  policy_id: string;
  customer_id: string;
  claim_type: string;
  submitted_on: string;
  incident_date: string;
  incident_location: string;
  summary: string;
  story: string;
  items: Item[];
  amount_claimed: number;
  documents: Document[];
  status: Status;
  decision: Decision | null;
}

export interface Policy {
  policy_id: string;
  plan: string;
  add_ons: string[];
  purchased_on: string;
  trip: {
    destination: string;
    departs_on: string;
    returns_on: string;
    trip_cost: number;
  };
  travelers: string[];
}

export interface PreviousClaim {
  claim_id: string;
  filed_on: string;
  claim_type: string;
  summary: string;
  outcome: string;
  amount_paid: number;
}

export interface Customer {
  customer_id: string;
  name: string;
  customer_since: string;
  previous_claims: PreviousClaim[];
}

export interface Handler {
  handler_id: string;
  name: string;
  role: string;
}

export interface Step {
  id: number;
  thread_id: string;
  kind: "message" | "tool_call" | "tool_result";
  title: string;
  detail: string;
  created_at: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json()) as T;
  if (!response.ok) {
    const { detail } = body as { detail: unknown };
    throw new Error(
      typeof detail === "string"
        ? detail
        : `The request failed (${String(response.status)}).`,
    );
  }
  return body;
}

function post<T>(path: string, body: object = {}): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const api = {
  health: () => request<{ status: string }>("/api/health"),
  listClaims: () => request<ClaimSummary[]>("/api/claims"),
  getClaim: (id: string) => request<Claim>(`/api/claims/${id}`),
  getPolicy: (id: string) => request<Policy>(`/api/policies/${id}`),
  getCustomer: (id: string) => request<Customer>(`/api/customers/${id}`),
  listSteps: (id: string) => request<Step[]>(`/api/claims/${id}/steps`),
  getInstructions: () => request<{ instructions: string }>("/api/instructions"),
  listHandlers: () => request<Handler[]>("/api/handlers"),
  runAgent: (id: string) =>
    post<{ thread_id: string }>(`/api/claims/${id}/run`),
  signOff: (id: string, handlerId: string) =>
    post<Claim>(`/api/claims/${id}/sign-off`, { handler_id: handlerId }),
};
