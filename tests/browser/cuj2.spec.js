// CUJ-2 — "When should I leave for flight LX962?"
// Steps: How long? tab → type partial flight → autocomplete shows →
//   click first option → estimate panel renders with a minutes total.
// LX962 chosen for the same reason as docs/probes/cuj2-flow.k6.js —
// stable daily Swiss long-haul. Doc-sync rule applies if you swap.

import { test, expect } from "@playwright/test";

test("CUJ-2 How-long search + estimate flow", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-tab="howlong"]');
  await expect(page.locator('section.tab[data-tab="howlong"].active')).toBeVisible();

  // Type a partial flight number; the autocomplete listbox should
  // populate within a couple of seconds (one /api/flights/search round-trip).
  const searchInput = page.locator(".hl-search input").first();
  await searchInput.fill("LX962");
  const ac = page.locator("#howLongAC");
  await expect(ac).toBeVisible({ timeout: 5_000 });

  // First option should be the upcoming flight we typed (the search
  // ranks already-departed rows last). Click it; the estimate panel
  // (#howLongDetail) should populate with a per-leg breakdown and a
  // "X MIN TOTAL" headline. Scope the /min/ match to #howLongDetail —
  // a page-wide getByText(/min/i) also matches hidden status chrome
  // (e.g. the header's "none in N min" freshness span), and .first()
  // would grab that instead of the estimate.
  await ac.locator('[role="option"]').first().click();
  const detail = page.locator("#howLongDetail");
  await expect(detail.getByText(/min/i).first()).toBeVisible({ timeout: 10_000 });
});
