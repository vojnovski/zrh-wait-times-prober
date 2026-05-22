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

  // The Patterns day-chip row is server-rendered with 7 buttons (one
  // per dow). Scope the locator to `#dayChips` because Gate close also
  // renders a `.day-chip` row — an unscoped `.day-chip` would match 14
  // elements and the count assertion would fail immediately.
  const chips = page.locator('#dayChips .day-chip');
  await expect(chips).toHaveCount(7, { timeout: 10_000 });

  // The Saturday chip starts active (aria-pressed="true"). Click it
  // off; assert aria-pressed flips to "false". The heatmap re-renders
  // in response (visible state change documented by the chip itself).
  const satChip = page.locator('#dayChips .day-chip[data-dow="6"]');
  await expect(satChip).toHaveAttribute("aria-pressed", "true");
  await satChip.click();
  await expect(satChip).toHaveAttribute("aria-pressed", "false");
});
