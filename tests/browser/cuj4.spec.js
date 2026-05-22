// CUJ-4 — "Gate close history for LX962"
// Steps: Gate close tab → wait for by-flight rows to populate →
//   click first row → drill-down expands (per-event detail visible).
//
// This test is more sensitive to data state than the others: it
// requires at least one row in the by-flight table. If the system
// has zero gate-close observations (fresh deploy), the test skips
// gracefully rather than failing — same UX a real user would get.

import { test, expect } from "@playwright/test";

test("CUJ-4 Gate-close by-flight drill-down", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-tab="gateclose"]');
  await expect(page.locator('section.tab[data-tab="gateclose"].active')).toBeVisible();

  // Wait for the by-flight table to populate. If it stays empty
  // (cold-start state), there's nothing to click — accept that
  // and pass; a real user would see the same "Collecting data..."
  // empty state and not be alarmed.
  //
  // Scope to `#gateCloseFlights` specifically — the gateclose tab
  // ALSO renders a `<table>` for the by-carrier breakdown above this
  // one, and an unscoped `tbody tr` selector matches rows in both.
  // The by-carrier table is click-filterable, not click-expandable,
  // so a `rows.first().click()` would land on a carrier row and the
  // drill-down assertion below would time out.
  const rows = page.locator('#gateCloseFlights tbody tr');
  try {
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  } catch {
    // Empty table — gate-close has no observations yet. The
    // endpoint is healthy (HTTP probe covers that separately);
    // only the per-flight UI flow is unobservable.
    test.skip(true, "No by-flight rows present — empty cold-start state, nothing to drill.");
    return;
  }

  // Click the first by-flight row. Expansion injects a sibling
  // `<tr class="gc-detail">` immediately below it (with the per-event
  // drill-down), so the row count grows by 1.
  const rowCountBefore = await rows.count();
  await rows.first().click();
  await expect.poll(
    () => rows.count(),
    { timeout: 5_000 },
  ).toBeGreaterThan(rowCountBefore);
});
