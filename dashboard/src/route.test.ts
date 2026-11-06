import { expect, it } from "vitest";
import { parseRoute } from "./route";

it("reads the page from the address", () => {
  expect(parseRoute("")).toEqual({ page: "queue" });
  expect(parseRoute("#/")).toEqual({ page: "queue" });
  expect(parseRoute("#/claims/CLM-1001")).toEqual({
    page: "claim",
    claimId: "CLM-1001",
  });
  expect(parseRoute("#/instructions")).toEqual({ page: "instructions" });
  expect(parseRoute("#/nowhere")).toEqual({ page: "queue" });
});
