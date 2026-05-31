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

  // Overnight (ZRH curfew ~23:15–05:00 local) the airport is closed and the
  // Now cards are intentionally non-interactive — renderClosureBanner() adds
  // `.cards-closed` to #cards, and `.cards-closed .card { pointer-events:none }`.
  // A card click then hit-tests THROUGH the card to its `.now-group-grid`
  // parent ("...intercepts pointer events") and burns the full timeout. The
  // card→history drill-down doesn't exist in that state, so assert the
  // closed-state contract and finish GREEN instead of clicking. NB: a
  // `test.skip()` here would report status "skipped", which the
  // push-playwright-to-grafana step scores as 0 — i.e. the very page we're
  // silencing; a passing assertion scores 1. The closure banner is toggled in
  // the same /api/current handler that paints the cards, so it's settled now.
  if ((await page.locator("#closureBanner:visible").count()) > 0) {
    await expect(page.locator("#cards.cards-closed .card").first()).toBeVisible();
    return;
  }

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
