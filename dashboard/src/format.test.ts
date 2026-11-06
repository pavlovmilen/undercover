import { expect, it } from "vitest";
import { day, money, moment, words } from "./format";

it("formats money in US dollars", () => {
  expect(money(1250)).toBe("$1,250.00");
  expect(money(0)).toBe("$0.00");
  expect(money(95.5)).toBe("$95.50");
});

it("formats dates", () => {
  expect(day("2026-06-24")).toBe("Jun 24, 2026");
  expect(moment("2026-11-06T17:05:51+00:00")).toContain("2026");
});

it("turns identifiers into words", () => {
  expect(words("trip_delay")).toBe("Trip delay");
  expect(words("baggage")).toBe("Baggage");
});
