import { expect, test } from "@playwright/test";

test("the queue lists the 25 claims and where they stand", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Claims queue" }),
  ).toBeVisible();
  await expect(page.locator("table.queue tbody tr")).toHaveCount(25);
  const counts = await page.locator(".flow-counts dd").allInnerTexts();
  expect(counts).toHaveLength(4);
  expect(counts.reduce((sum, count) => sum + Number(count), 0)).toBe(25);
  await page.getByRole("link", { name: "CLM-1001" }).click();
  await expect(page).toHaveURL(/#\/claims\/CLM-1001$/);
});
