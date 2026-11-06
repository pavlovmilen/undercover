import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Claim, Decision } from "./api";
import { ClaimPage } from "./ClaimPage";
import { claim, customer, mockApi, policy, step } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const handlers = [
  {
    handler_id: "HND-01",
    name: "Dana Whitfield",
    role: "Senior Claims Handler",
  },
  { handler_id: "HND-02", name: "Marcus Oyelaran", role: "Claims Handler" },
];

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    decision: "approve",
    payout: 420,
    reasons: "The flight was canceled for a crew problem.",
    policy_section: "Section 3, Trip Delay",
    decided_at: "2026-11-06T17:05:51+00:00",
    signed_off_by: null,
    signed_off_at: null,
    paid_amount: null,
    paid_at: null,
    ...overrides,
  };
}

function routes(current: Claim, extra: Record<string, unknown> = {}) {
  return {
    "GET /api/claims/CLM-1001": current,
    "GET /api/claims/CLM-1001/steps": [],
    "GET /api/policies/POL-2001": policy,
    "GET /api/customers/CUS-3001": customer,
    "GET /api/handlers": handlers,
    ...extra,
  };
}

it("shows the claim, its policy and the customer's history", async () => {
  mockApi(routes(claim()));
  render(<ClaimPage claimId="CLM-1001" />);
  expect(
    await screen.findByRole("heading", {
      name: "Flight home canceled by the airline",
    }),
  ).toBeDefined();
  expect(
    screen.getByText("My flight home from Rome was canceled."),
  ).toBeDefined();
  expect(screen.getByText("Airport hotel, one night")).toBeDefined();
  expect(screen.getAllByText("$420.00").length).toBeGreaterThan(0);
  expect(screen.getByText("Meridian Air cancellation notice")).toBeDefined();
  expect(await screen.findByText("Premium")).toBeDefined();
  expect(screen.getByText("Electronics plus")).toBeDefined();
  expect(
    await screen.findByText("Checked bag arrived 30 hours late in Lisbon"),
  ).toBeDefined();
  expect(
    screen.getByText("No decision yet. Run the agent to decide this claim."),
  ).toBeDefined();
  expect(
    screen.getByText("The agent hasn't worked on this claim yet."),
  ).toBeDefined();
});

it("starts the agent", async () => {
  const fetch = mockApi(
    routes(claim(), { "POST /api/claims/CLM-1001/run": { thread_id: "t1" } }),
  );
  render(<ClaimPage claimId="CLM-1001" />);
  fireEvent.click(await screen.findByRole("button", { name: "Run the agent" }));
  expect(
    await screen.findByRole("button", { name: "The agent is working" }),
  ).toBeDefined();
  expect(fetch).toHaveBeenCalledWith(
    "/api/claims/CLM-1001/run",
    expect.anything(),
  );
});

it("shows why the agent couldn't start", async () => {
  mockApi(routes(claim()));
  render(<ClaimPage claimId="CLM-1001" />);
  fireEvent.click(await screen.findByRole("button", { name: "Run the agent" }));
  expect(
    await screen.findByText("No route for POST /api/claims/CLM-1001/run."),
  ).toBeDefined();
});

it("shows the agent's steps as it works", async () => {
  mockApi(
    routes(claim({ status: "in_progress" }), {
      "GET /api/claims/CLM-1001/steps": [
        step(1, "message", "agent", "I will read the claim first."),
        step(2, "tool_call", "get_claim", "{}"),
        step(3, "tool_result", "get_claim", '{"claim_id":"CLM-1001"}'),
        step(4, "tool_call", "get_policy_wording", "{}"),
      ],
    }),
  );
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText("I will read the claim first.")).toBeDefined();
  expect(screen.getByText("Read the claim")).toBeDefined();
  expect(screen.getByText("Read the policy wording")).toBeDefined();
  expect(screen.getByText("working")).toBeDefined();
  expect(
    screen.getByRole("button", { name: "The agent is working" }),
  ).toBeDefined();
});

it("shows a paid decision", async () => {
  const paid = decision({
    paid_amount: 420,
    paid_at: "2026-11-06T17:05:55+00:00",
  });
  mockApi(routes(claim({ status: "decided", decision: paid })));
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText("Approved")).toBeDefined();
  expect(
    screen.getByText("The flight was canceled for a crew problem."),
  ).toBeDefined();
  expect(screen.getByText("Section 3, Trip Delay")).toBeDefined();
  expect(screen.getByText(/^Paid \$420\.00 on/)).toBeDefined();
  expect(screen.queryByRole("button", { name: "Run the agent" })).toBeNull();
});

it("shows an approval that wasn't paid", async () => {
  mockApi(routes(claim({ status: "decided", decision: decision() })));
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText("Not paid.")).toBeDefined();
});

it("shows a decline with no payment", async () => {
  const declined = decision({ decision: "decline", payout: 0 });
  mockApi(routes(claim({ status: "decided", decision: declined })));
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText("Declined")).toBeDefined();
  expect(screen.queryByText("Not paid.")).toBeNull();
});

it("lets a handler sign off a payout over the limit", async () => {
  const held = claim({
    status: "awaiting_sign_off",
    decision: decision({ payout: 1250 }),
  });
  const fetch = mockApi(
    routes(held, { "POST /api/claims/CLM-1001/sign-off": held }),
  );
  render(<ClaimPage claimId="CLM-1001" />);
  expect(
    await screen.findByText(/^Waiting for sign-off\. Payouts over/),
  ).toBeDefined();
  await screen.findByRole("option", { name: "Dana Whitfield" });
  fireEvent.change(screen.getByLabelText("Signing off as"), {
    target: { value: "HND-02" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign off and pay" }));
  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith(
      "/api/claims/CLM-1001/sign-off",
      expect.objectContaining({
        body: JSON.stringify({ handler_id: "HND-02" }),
      }),
    );
  });
});

it("shows why a sign-off failed", async () => {
  const held = claim({
    status: "awaiting_sign_off",
    decision: decision({ payout: 1250 }),
  });
  mockApi(
    routes(held, {
      "POST /api/claims/CLM-1001/sign-off": Response.json(
        { detail: "Claim CLM-1001 is not waiting for sign-off." },
        { status: 409 },
      ),
    }),
  );
  render(<ClaimPage claimId="CLM-1001" />);
  await screen.findByRole("option", { name: "Dana Whitfield" });
  fireEvent.click(screen.getByRole("button", { name: "Sign off and pay" }));
  expect(
    await screen.findByText("Claim CLM-1001 is not waiting for sign-off."),
  ).toBeDefined();
});

it("shows a signed-off payment", async () => {
  const signed = decision({
    payout: 1250,
    signed_off_by: "Dana Whitfield",
    signed_off_at: "2026-11-06T18:00:00+00:00",
    paid_amount: 1250,
    paid_at: "2026-11-06T18:00:00+00:00",
  });
  mockApi(routes(claim({ status: "decided", decision: signed })));
  render(<ClaimPage claimId="CLM-1001" />);
  expect(
    await screen.findByText(/Signed off by Dana Whitfield\./),
  ).toBeDefined();
});

it("shows an unknown claim's error", async () => {
  mockApi({});
  render(<ClaimPage claimId="CLM-1001" />);
  expect(
    await screen.findByText("No route for GET /api/claims/CLM-1001."),
  ).toBeDefined();
});
