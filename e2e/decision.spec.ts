import { expect, test } from "@playwright/test";
import { playAgent } from "./agent";

test("the agent's steps and decision appear on the claim and in the queue", async ({
  page,
  request,
}) => {
  const payment = await playAgent(request, "CLM-1006", 375);
  expect(payment.ok()).toBe(true);

  await page.goto("/#/claims/CLM-1006");
  await expect(page.getByText("I will read the claim first.")).toBeVisible();
  await expect(page.getByText("Read the claim", { exact: true })).toBeVisible();
  await expect(page.getByText("Recorded the decision")).toBeVisible();
  const decision = page.locator(".decision");
  await expect(decision.getByText("Approved")).toBeVisible();
  await expect(decision.getByText("$375.00", { exact: true })).toBeVisible();
  await expect(decision.getByText(/^Paid \$375\.00 on/)).toBeVisible();

  await page.getByRole("link", { name: "Back to the queue" }).click();
  const row = page.getByRole("row", { name: /CLM-1006/ });
  await expect(row.getByText("Decided")).toBeVisible();
  await expect(row.getByText("Approved")).toBeVisible();
});

test("a payout over $1,000 waits for a handler's sign-off", async ({
  page,
  request,
}) => {
  const payment = await playAgent(request, "CLM-1016", 1250);
  expect(payment.status()).toBe(403);
  expect((await payment.json()) as unknown).toEqual({
    detail: "Payment held: payouts over $1,000.00 need a handler's sign-off.",
  });

  await page.goto("/#/claims/CLM-1016");
  await expect(page.locator(".claim-head .pill")).toHaveText(
    "Waiting for sign-off",
  );
  await page
    .getByLabel("Signing off as")
    .selectOption({ label: "Priya Raman" });
  await page.getByRole("button", { name: "Sign off and pay" }).click();
  await expect(
    page.getByText(/^Paid \$1,250\.00 on .*Signed off by Priya Raman\.$/),
  ).toBeVisible();
  await expect(page.locator(".claim-head .pill")).toHaveText("Decided");
});
