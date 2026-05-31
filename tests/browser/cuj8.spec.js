// CUJ-8 — "A returning visitor sees fresh data, not a stale browser cache."
//
// This is an API-level probe (no browser page): it asserts the
// Cache-Control CONTRACT on the canonical hostname rather than rendered
// pixels. Motivated by the 2026-05-31 incident where the vv.mk zone's
// "Browser Cache TTL" rewrote the origin's deliberate `max-age=0` into
// `max-age=1382400` (16 days) on every proxy edge HIT — so returning
// visitors' browsers served day(s)-old API JSON from their LOCAL cache
// without ever hitting the network. The whole probe fleet missed it
// because:
//   - /healthz (the freshness gate) is `no-store` and measures D1
//     timestamps — server-side freshness, which was never the problem;
//   - the browser CUJs launch a cold cache every run and re-fetch, so
//     they never hold a poisoned entry;
//   - none of them inspected response headers.
// This probe closes that gap: it reads the header an actual browser
// would obey. See zrh-wait-times `proxy/README.md`.
//
// On failure the GH Action push step marks
// `playwright_probe_success{cuj=cuj8, env=prod} 0`.

import { test, expect } from "@playwright/test";

// Long origin s-maxage (secsUntilNextZrhHour) keeps this entry warm in
// the proxy edge cache, so a HIT — the code path the bug lives on — is
// reliable within a couple of requests.
const PROBE_PATH = "/api/patterns/now-baseline?days=30";

// The origin sends `max-age=0` on all dynamic JSON: shared caches may
// store it (s-maxage), browsers must revalidate. Any browser-facing
// max-age beyond a small revalidation window means an intermediary is
// poisoning visitor browser caches. 120 s is generous headroom over the
// largest legitimate value (0) yet four orders of magnitude below the
// 1 382 400 s (16-day) inflation this probe exists to catch.
const MAX_BROWSER_MAXAGE_S = 120;

// Pull the BROWSER directive (`max-age=`), never the shared-cache one
// (`s-maxage=`). "s-maxage" does not contain the literal "max-age", and
// the leading boundary stops a partial match anyway.
function browserMaxAge(cacheControl) {
  const m = /(?:^|[,;\s])max-age\s*=\s*(\d+)/i.exec(cacheControl || "");
  return m ? Number(m[1]) : null;
}

test("CUJ-8 proxy does not poison browser cache (Cache-Control max-age stays small)", async ({ request }) => {
  let sawHit = false;
  let worstMaxAge = 0;
  let lastCacheControl = "";
  let lastCacheStatus = "";

  // Request the same URL several times: the first fill is a proxy MISS,
  // subsequent requests should be edge HITs. Assert max-age on EVERY
  // response — the inflation only appears on the HIT path and must never
  // be observed. Stop early once a HIT has been checked.
  for (let i = 0; i < 8; i++) {
    const res = await request.get(PROBE_PATH);
    expect(res.status(), `GET ${PROBE_PATH} should be 200`).toBe(200);

    const headers = res.headers();
    lastCacheControl = headers["cache-control"] ?? "";
    lastCacheStatus = headers["cf-cache-status"] ?? "";

    const ma = browserMaxAge(lastCacheControl);
    if (ma != null) worstMaxAge = Math.max(worstMaxAge, ma);
    if (lastCacheStatus.toUpperCase() === "HIT") sawHit = true;

    if (sawHit) break;
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Primary assertion: no response (MISS or HIT) may carry a multi-day
  // browser max-age. Fails loudly the moment the proxy/zone inflates it.
  expect(
    worstMaxAge,
    `Cache-Control max-age=${worstMaxAge}s on ${PROBE_PATH} exceeds ${MAX_BROWSER_MAXAGE_S}s — the vv.mk ` +
      `proxy is poisoning browser caches (last cache-control: "${lastCacheControl}", ` +
      `cf-cache-status: "${lastCacheStatus}"). Set the vv.mk zone Browser Cache TTL to ` +
      `"Respect Existing Headers" (see proxy/README.md).`,
  ).toBeLessThanOrEqual(MAX_BROWSER_MAXAGE_S);

  // Soundness: we want to have exercised the cached (HIT) path so the
  // pass isn't vacuous. A cold colo can legitimately MISS every time, so
  // surface it as a warning rather than a hard failure (the max-age
  // assertion above is the real signal either way).
  if (!sawHit) {
    console.warn(
      `CUJ-8: no proxy cf-cache-status:HIT seen after retries on ${PROBE_PATH}; ` +
        `max-age was only checked against MISS responses.`,
    );
  }
});
