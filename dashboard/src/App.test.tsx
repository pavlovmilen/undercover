import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { mockApi } from "./testing";

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
  mockApi({ "GET /api/health": { status: "ok" }, "GET /api/claims": [] });
  vi.stubGlobal("scrollTo", vi.fn());
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Claims queue" }),
  ).toBeDefined();
  await act(async () => {
    window.location.hash = "#/claims/CLM-1001";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await Promise.resolve();
  });
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
    "CLM-1001",
  );
  expect(
    screen.getByRole("link", { name: "Queue" }).getAttribute("aria-current"),
  ).toBe("page");
});
