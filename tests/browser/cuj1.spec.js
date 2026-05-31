// CUJ-1 — "How long are waits right now?"
// Steps: load /, see Now-tab cards, switch to History, assert chart renders.
// On failure: Playwright captures trace + screenshot; the GH Action push
// step marks `playwright_probe_success{cuj=cuj1, env=prod} 0`.

import { test, expect } from "@playwright/test";

test("CUJ-1 Now tab loads + tab-switch works", async ({ page }) => {
  await page.goto("/");

  // Now tab is the default active tab.
  await expect(page.locator('section.tab[data-tab="now"].active')).toBeVisible();
  // At least one queue card should render (allow a couple seconds for
  // /api/current to land + cards to populate).
  await expect(page.locator("#cards .card").first()).toBeVisible({ timeout: 10_000 });

  // Tab-switch: click History, expect the section to become active
  // and the chart container to be present.
  await page.click('button[data-tab="history"]');
  await expect(page.locator('section.tab[data-tab="history"].active')).toBeVisible();
  await expect(page.locator("#historyChart")).toBeVisible();
});

test("CUJ-1 card click pushes history; browser back returns to Now", async ({ page }) => {
  // Simulate the user arriving from another site: navigate to about:blank
  // first so the site's first entry isn't the history-stack root.
  await page.goto("about:blank");
  await page.goto("/");

  // Wait for the Now-tab cards to populate.
  await expect(page.locator('section.tab[data-tab="now"].active')).toBeVisible();
  const firstCard = page.locator("#cards .card").first();
  await expect(firstCard).toBeVisible({ timeout: 10_000 });

  // Overnight (ZRH curfew ~23:15-05:00 local) the airport is closed and
  // the Now cards are intentionally non-interactive
  // (#cards.cards-closed .card { pointer-events: none }); a click then
  // hit-tests through to .now-group-grid and burns the 30s timeout. Skip.
  const closed = (await page.locator("#closureBanner:visible").count()) > 0;
  test.skip(closed, "airport closed — Now cards are non-interactive overnight");

  // Click a card — this should navigate to History (not via the tab
  // bar) and push a history entry.
  await firstCard.click();
  await expect(page.locator('section.tab[data-tab="history"].active')).toBeVisible();
  await expect(page.locator("#historyChart")).toBeVisible();

  // Browser back must return to the Now tab on the same page, not to
  // about:blank / the previous origin.
  await page.goBack();
  await expect(page).toHaveURL(/\/(?:#.*)?$/);
  await expect(page.locator('section.tab[data-tab="now"].active')).toBeVisible();
});
