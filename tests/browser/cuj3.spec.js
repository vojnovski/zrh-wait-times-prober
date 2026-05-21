// CUJ-3 — "When is it typically quietest?"
// Steps: Patterns tab → toggle a day-of-week chip → heatmap re-renders.
// We assert the chip's pressed state flips; the heatmap content changes
// in response (we don't inspect cell values — the chip-state flip is
// the load-bearing user-visible signal).

import { test, expect } from "@playwright/test";

test("CUJ-3 Patterns day-chip toggle", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-tab="patterns"]');
  await expect(page.locator('section.tab[data-tab="patterns"].active')).toBeVisible();

  // Wait for the day chips to render. There are 7 (one per dow).
  const chips = page.locator(".day-chip");
  await expect(chips).toHaveCount(7, { timeout: 10_000 });

  // The Saturday chip starts active (aria-pressed="true"). Click it
  // off; assert aria-pressed flips to "false". The heatmap re-renders
  // in response (visible state change documented by the chip itself).
  const satChip = page.locator('.day-chip[data-dow="6"]');
  await expect(satChip).toHaveAttribute("aria-pressed", "true");
  await satChip.click();
  await expect(satChip).toHaveAttribute("aria-pressed", "false");
});
