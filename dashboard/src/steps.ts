import type { Step } from "./api";
import { words } from "./format";

export interface Entry {
  id: number;
  kind: "message" | "tool_call";
  title: string;
  input: string;
  result: string | undefined;
}

export type State = "working" | "done" | "refused";

const ACTIONS: Partial<Record<string, string>> = {
  get_claim: "Read the claim",
  get_policy: "Read the policy",
  get_customer: "Read the customer's history",
  get_policy_wording: "Read the policy wording",
  record_decision: "Recorded the decision",
  pay_claim: "Paid the claim",
};

/** Pair each tool call with its result, keeping the agent's own words. */
export function entries(steps: Step[]): Entry[] {
  const list: Entry[] = [];
  const open = new Map<string, Entry[]>();
  for (const step of steps) {
    if (step.kind === "tool_result") {
      const entry = open.get(step.title)?.shift();
      if (entry) entry.result = step.detail;
      continue;
    }
    const entry: Entry = {
      id: step.id,
      kind: step.kind,
      title: step.title,
      input: step.detail,
      result: undefined,
    };
    list.push(entry);
    if (step.kind === "tool_call") {
      open.set(step.title, [...(open.get(step.title) ?? []), entry]);
    }
  }
  return list;
}

export function state(entry: Entry): State {
  if (entry.result === undefined) return "working";
  return entry.result.startsWith("Refused:") ? "refused" : "done";
}

export function label(entry: Entry): string {
  if (entry.result?.startsWith("Refused: Payment held")) {
    return "Payment held for sign-off";
  }
  const action = ACTIONS[entry.title] ?? words(entry.title);
  return state(entry) === "refused" ? `${action}: refused` : action;
}

/** Show JSON indented, and anything else as it is. */
export function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
