import { expect, type APIRequestContext } from "@playwright/test";

/** Play the agent's part through the API, as the agent's harness does. */
export async function playAgent(
  request: APIRequestContext,
  claimId: string,
  payout: number,
) {
  const claims = `/api/claims/${claimId}`;
  expect((await request.post(`${claims}/start`)).ok()).toBe(true);
  const steps: [string, string, string][] = [
    ["message", "agent", "I will read the claim first."],
    ["tool_call", "get_claim", "{}"],
    ["tool_result", "get_claim", `{"claim_id":"${claimId}"}`],
    ["tool_call", "record_decision", `{"payout":${String(payout)}}`],
  ];
  for (const [kind, title, detail] of steps) {
    const step = { thread_id: "e2e", kind, title, detail };
    expect((await request.post(`${claims}/steps`, { data: step })).ok()).toBe(
      true,
    );
  }
  const decision = await request.post(`${claims}/decision`, {
    data: {
      decision: "approve",
      payout,
      reasons: "The documents support the claim.",
      policy_section: "Section 7, Emergency Medical",
    },
  });
  expect(decision.ok()).toBe(true);
  return request.post(`${claims}/payment`, { data: { amount: payout } });
}
