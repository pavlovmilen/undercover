import { expect, test } from "@playwright/test";

test("a claim shows its story, documents, policy and history", async ({
  page,
}) => {
  await page.goto("/#/claims/CLM-1001");
  await expect(
    page.getByRole("heading", { name: /Flight home canceled by the airline/ }),
  ).toBeVisible();
  await expect(
    page.getByText(/My flight home from Rome on June 18/),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Total claimed \$420\.00/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Meridian Air cancellation notice"),
  ).toBeVisible();
  await expect(page.getByText("Premium", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Checked bag arrived 30 hours late/),
  ).toBeVisible();
});

test("the instructions page shows the agent's instructions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Agent instructions" }).click();
  await expect(page.getByText(/You are the UnderCover Agent/)).toBeVisible();
  await expect(page.locator("textarea, input")).toHaveCount(0);
});
