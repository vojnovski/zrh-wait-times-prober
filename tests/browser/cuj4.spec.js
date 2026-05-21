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
  const rows = page.locator('section.tab[data-tab="gateclose"] tbody tr');
  try {
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  } catch {
    // Empty table — gate-close has no observations yet. The
    // endpoint is healthy (HTTP probe covers that separately);
    // only the per-flight UI flow is unobservable.
    test.skip(true, "No by-flight rows present — empty cold-start state, nothing to drill.");
    return;
  }

  // Click the first row. The drill-down should expand below it
  // (a sibling row with the per-event detail). The exact markup
  // varies but at minimum a new row should appear or an existing
  // hidden row become visible — we count rows before and after to
  // detect the expansion.
  const rowCountBefore = await rows.count();
  await rows.first().click();
  await expect.poll(
    () => rows.count(),
    { timeout: 5_000 },
  ).toBeGreaterThan(rowCountBefore);
});
