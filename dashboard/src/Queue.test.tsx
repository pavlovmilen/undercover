import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Queue } from "./Queue";
import { mockApi, summary } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const claims = [
  summary(),
  summary({
    claim_id: "CLM-1002",
    customer_name: "Leo Grant",
    status: "in_progress",
  }),
  summary({
    claim_id: "CLM-1003",
    claim_type: "emergency_medical",
    amount_claimed: 3800,
    status: "awaiting_sign_off",
    decision: "approve",
    payout: 3750,
  }),
  summary({
    claim_id: "CLM-1004",
    status: "decided",
    decision: "decline",
    payout: 0,
  }),
];

function count(label: string): string | null {
  const term = screen.getByText(label, { selector: "dt" });
  return term.parentElement?.querySelector("dd")?.textContent ?? null;
}

it("counts the claims in each status", async () => {
  mockApi({ "GET /api/claims": claims });
  render(<Queue />);
  await screen.findByRole("table");
  expect(count("Waiting")).toBe("1");
  expect(count("In progress")).toBe("1");
  expect(count("Waiting for sign-off")).toBe("1");
  expect(count("Decided")).toBe("1");
});

it("lists each claim with its status and decision", async () => {
  mockApi({ "GET /api/claims": claims });
  render(<Queue />);
  const rows = within(await screen.findByRole("table")).getAllByRole("row");
  expect(rows).toHaveLength(5);
  const signOff = within(rows[3]);
  expect(
    signOff.getByRole("link", { name: "CLM-1003" }).getAttribute("href"),
  ).toBe("#/claims/CLM-1003");
  expect(signOff.getByText("Emergency medical")).toBeDefined();
  expect(signOff.getByText("$3,800.00")).toBeDefined();
  expect(signOff.getByText("Waiting for sign-off")).toBeDefined();
  expect(signOff.getByText("Approved")).toBeDefined();
  expect(signOff.getByText("$3,750.00")).toBeDefined();
  expect(within(rows[4]).getByText("Declined")).toBeDefined();
});

it("shows an error when the queue can't load", async () => {
  mockApi({});
  render(<Queue />);
  expect(
    await screen.findByText("No route for GET /api/claims."),
  ).toBeDefined();
});
