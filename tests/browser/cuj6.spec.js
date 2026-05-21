// CUJ-6 — "Which queue should I use?"
// Steps: load /, switch to Compare tab, assert per-category charts
// render (one per category: Check-in / Security / Passport). The
// charts overlay every queue in that category so the user can pick
// the shortest one. We assert the category title elements exist —
// content of the uPlot canvas inside is opaque to us, the titles
// flipping in is the load-bearing user-visible signal.

import { test, expect } from "@playwright/test";

test("CUJ-6 Compare per-category charts render", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-tab="compare"]');
  await expect(page.locator('section.tab[data-tab="compare"].active')).toBeVisible();

  // renderCompare() builds three cards (.chart-title.compare-title)
  // inside #compareSections, one per category. Allow time for the
  // /api/history/multi round-trip + uPlot init. We don't assert the
  // canvas contents — the per-category title appearing is what tells
  // the user "the chart for this category is up".
  const titles = page.locator("#compareSections .compare-title");
  await expect(titles).toHaveCount(3, { timeout: 15_000 });
});
