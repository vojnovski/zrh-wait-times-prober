// CUJ-7 — "Roughly how long is passport at my section?"
// Steps: load /, switch to Schedule tab, assert at least one section
// row renders inside #scheduleSections. The schedule tab is the only
// user-facing surface for passport sections where the airport
// publishes no live wait-time data (e.g., gates D); a missing grid
// means the kv blob load failed.

import { test, expect } from "@playwright/test";

test("CUJ-7 Schedule tab renders section rows", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-tab="schedule"]');
  await expect(page.locator('section.tab[data-tab="schedule"].active')).toBeVisible();

  // renderScheduleSections() builds .schedule-row elements inside
  // #scheduleSections, one per passport section. Allow time for the
  // /api/passport/schedule round-trip + chart init. Expect at least
  // one row; the kv-loaded schedule typically has 4-5 sections
  // (Departures / Transfer / Arrivals etc.) so checking ">=1" guards
  // against the empty-grid failure mode without baking in a fragile
  // exact count.
  const rows = page.locator("#scheduleSections .schedule-row");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
});
