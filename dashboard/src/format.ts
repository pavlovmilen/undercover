import type { Status, Verdict } from "./api";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const days = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const moments = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function money(amount: number): string {
  return dollars.format(amount);
}

export function day(isoDate: string): string {
  return days.format(new Date(isoDate));
}

export function moment(isoTime: string): string {
  return moments.format(new Date(isoTime));
}

export function words(identifier: string): string {
  const text = identifier.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const STATUS_LABELS: Record<Status, string> = {
  waiting: "Waiting",
  in_progress: "In progress",
  awaiting_sign_off: "Waiting for sign-off",
  decided: "Decided",
};

export const STATUSES: Status[] = [
  "waiting",
  "in_progress",
  "awaiting_sign_off",
  "decided",
];

export const DECISION_LABELS: Record<Verdict, string> = {
  approve: "Approved",
  decline: "Declined",
  refer: "Referred",
};
