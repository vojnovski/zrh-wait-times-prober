// CUJ-3 — "When is it typically quietest?"
// Patterns tab. ONE consolidated probe that walks the whole journey:
// pick a queue (across categories) → choose a lookback window → narrow
// the days-of-week → read the typical-day chart + typical-week heatmap.
//
// Deliberately ONE test() block, not several. The Grafana push step
// (scripts/push-playwright-to-grafana.sh) maps spec title → a single
// `playwright_probe_success{cuj=cuj3}` series via /^CUJ-(\d+)/, with no
// per-line timestamp — so multiple "CUJ-3 ..." specs would collapse to
// one series (last-write-wins) and silently drop each other's result.
// Keeping it to one spec makes the metric honest: any step failing
// turns the single cuj3 series red.
//
// All assertions are STRUCTURAL (chip-state flips, pill `.active`,
// cross-tab carry). We never assert on data values — those would flake
// against live prod, and endpoint correctness is covered separately by
// the `/api/patterns/*` SM probes.

import { test, expect } from "@playwright/test";

test("CUJ-3 Patterns — queue switch, window pills, day chips, cross-tab carry", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-tab="patterns"]');
  await expect(page.locator('section.tab[data-tab="patterns"].active')).toBeVisible();

  // --- Queue / category switching ---------------------------------
  // The queue chips are server-data-driven (one per live queue),
  // grouped by category. Exactly one is active (`aria-selected=true`).
  // Switching across categories is the load-bearing first step of the
  // journey; assert the active state moves to the chip we click. We
  // pick by category class so the test is agnostic to which specific
  // queues exist on any given day.
  const chips = page.locator('#patternsChips .queue-chip');
  await expect(chips.first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#patternsChips .queue-chip[aria-selected="true"]')).toHaveCount(1);

  for (const cat of ["security", "passport", "checkin"]) {
    const chip = page.locator(`#patternsChips .queue-chip.cat-${cat}`).first();
    if (await chip.count() === 0) continue; // category may be absent
    await chip.click();
    await expect(chip).toHaveAttribute("aria-selected", "true");
    await expect(chip).toHaveClass(/\bactive\b/);
    // Still exactly one active chip after the switch (no double-select).
    await expect(page.locator('#patternsChips .queue-chip[aria-selected="true"]')).toHaveCount(1);
  }

  // --- Window pills (7d / 30d / 90d / all; 30d default) -----------
  const pills = page.locator('#patternsRanges button');
  await expect(pills).toHaveCount(4);
  await expect(page.locator('#patternsRanges button[data-range="30d"]')).toHaveClass(/active/);
  await page.click('#patternsRanges button[data-range="7d"]');
  await expect(page.locator('#patternsRanges button[data-range="7d"]')).toHaveClass(/active/);
  await page.click('#patternsRanges button[data-range="all"]');
  await expect(page.locator('#patternsRanges button[data-range="all"]')).toHaveClass(/active/);

  // --- Day-of-week chips (7 buttons; Saturday starts pressed) -----
  // Scope to #dayChips — Gate close also renders a `.day-chip` row, so
  // an unscoped selector would match 14 elements.
  const dayChips = page.locator('#dayChips .day-chip');
  await expect(dayChips).toHaveCount(7);
  const satChip = page.locator('#dayChips .day-chip[data-dow="6"]');
  await expect(satChip).toHaveAttribute("aria-pressed", "true");
  await satChip.click();
  await expect(satChip).toHaveAttribute("aria-pressed", "false");

  // --- Cross-tab window carry (History <-> Patterns) --------------
  // Only a window you *explicitly pick* carries, and only when the
  // destination offers it as a pill. A value the destination can't show
  // leaves its window untouched, and passing back through must NOT
  // back-propagate the destination's leftover window onto the source.

  // A shared value (30d) picked on History carries forward to Patterns.
  await page.click('button[data-tab="history"]');
  await expect(page.locator('section.tab[data-tab="history"].active')).toBeVisible();
  await page.click('#historyRanges button[data-range="30d"]');
  await page.click('button[data-tab="patterns"]');
  await expect(page.locator('#patternsRanges button[data-range="30d"]')).toHaveClass(/active/);

  // Regression guard for the "round-trip rewrites the source" bug:
  // Patterns now sits on a shared value (30d). Put History on a
  // History-only value (24h), then bounce History→Patterns→History.
  // 24h can't carry, so Patterns stays 30d; and on the way back
  // Patterns' 30d must NOT leak onto History — History must still
  // read 24h (previously it silently flipped to 30d).
  await page.click('button[data-tab="history"]');
  await page.click('#historyRanges button[data-range="24h"]');
  await page.click('button[data-tab="patterns"]');
  await expect(page.locator('#patternsRanges button[data-range="30d"]')).toHaveClass(/active/);
  await page.click('button[data-tab="history"]');
  await expect(page.locator('#historyRanges button[data-range="24h"]')).toHaveClass(/active/);
});
