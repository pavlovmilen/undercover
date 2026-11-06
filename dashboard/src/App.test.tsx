import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { claim, mockApi } from "./testing";

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

it("shows that the backend is up", async () => {
  mockApi({ "GET /api/health": { status: "ok" }, "GET /api/claims": [] });
  render(<App />);
  expect(await screen.findByText("Backend: up")).toBeDefined();
});

it("shows that the backend is down", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<App />);
  expect(await screen.findByText("Backend: down")).toBeDefined();
});

it("opens the page in the address", async () => {
  mockApi({
    "GET /api/health": { status: "ok" },
    "GET /api/claims": [],
    "GET /api/claims/CLM-1001": claim(),
    "GET /api/claims/CLM-1001/steps": [],
    "GET /api/instructions": { instructions: "Decide claims." },
  });
  vi.stubGlobal("scrollTo", vi.fn());
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Claims queue" }),
  ).toBeDefined();
  await go("#/claims/CLM-1001");
  expect(
    await screen.findByRole("heading", {
      name: "Flight home canceled by the airline",
    }),
  ).toBeDefined();
  expect(
    screen.getByRole("link", { name: "Queue" }).getAttribute("aria-current"),
  ).toBe("page");
  await go("#/instructions");
  expect(await screen.findByText("Decide claims.")).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: "Agent instructions" })
      .getAttribute("aria-current"),
  ).toBe("page");
});
