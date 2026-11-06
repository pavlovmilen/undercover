import { expect, it } from "vitest";
import { entries, label, pretty, state } from "./steps";
import { step } from "./testing";

const HELD =
  "Refused: Payment held: payouts over $1,000.00 need a handler's sign-off.";

it("pairs each tool call with its result", () => {
  const list = entries([
    step(1, "message", "agent", "I will read the claim."),
    step(2, "tool_call", "get_claim", "{}"),
    step(3, "tool_call", "get_policy", "{}"),
    step(4, "tool_result", "get_policy", '{"plan":"premium"}'),
    step(5, "tool_result", "get_claim", '{"claim_id":"CLM-1001"}'),
    step(6, "tool_call", "pay_claim", '{"amount":420}'),
  ]);
  expect(list.map((entry) => [entry.kind, entry.title, entry.result])).toEqual([
    ["message", "agent", undefined],
    ["tool_call", "get_claim", '{"claim_id":"CLM-1001"}'],
    ["tool_call", "get_policy", '{"plan":"premium"}'],
    ["tool_call", "pay_claim", undefined],
  ]);
});

it("ignores a result with no call", () => {
  expect(entries([step(1, "tool_result", "get_claim", "{}")])).toEqual([]);
});

it("names each action in plain words", () => {
  const list = entries([
    step(1, "tool_call", "get_policy_wording", "{}"),
    step(2, "tool_result", "get_policy_wording", "# Wording"),
    step(3, "tool_call", "pay_claim", "{}"),
    step(4, "tool_result", "pay_claim", HELD),
    step(5, "tool_call", "record_decision", "{}"),
    step(6, "tool_result", "record_decision", "Refused: already decided"),
    step(7, "tool_call", "look_around", "{}"),
    step(8, "tool_result", "look_around", "ok"),
    step(9, "tool_call", "get_claim", "{}"),
  ]);
  expect(list.map(label)).toEqual([
    "Read the policy wording",
    "Payment held for sign-off",
    "Recorded the decision: refused",
    "Look around",
    "Read the claim",
  ]);
  expect(list.map(state)).toEqual([
    "done",
    "refused",
    "refused",
    "done",
    "working",
  ]);
});

it("indents JSON and leaves other text alone", () => {
  expect(pretty('{"a":1}')).toBe('{\n  "a": 1\n}');
  expect(pretty("# Wording")).toBe("# Wording");
});
