# zrh-wait-times-prober

Public sister of [vojnovski/zrh-wait-times](https://github.com/vojnovski/zrh-wait-times).
Hosts the two scheduled GitHub Actions workflows that drive the
observability pipeline for that app.

Public because GitHub Actions billing rounds runtime up to the nearest
minute per job — at true `*/5` scrape cadence and `*/30` Playwright
cadence, the per-job billing overruns the private free-tier cap.
Public repos get unlimited free Actions minutes.

## What runs here

- `scrape-worker-metrics.yml` — pulls `https://zrh.vv.mk/healthz?format=prom`
  and pushes the values to Grafana Cloud's Prometheus via Influx line
  protocol. Triggered via `workflow_dispatch` only; the worker's
  Cloudflare cron fires the dispatch every `*/5` mark.
- `browser-probes-cron.yml` — runs the Playwright CUJ specs against
  production and pushes the per-CUJ pass/fail series to Grafana. Same
  dispatch mechanism, fired by the worker when `minute % 30 == 0` to
  preserve a `*/30` cadence.

Neither has an `on: schedule:` trigger — GitHub's schedule trigger is
throttled to ~4 % of expected ticks on user-account repos (private OR
public), so the worker drives both via `workflow_dispatch` instead.

## Secrets

Three GitHub Actions secrets are required:

- `GRAFANA_PROM_URL` — Grafana Cloud Prometheus push endpoint
  (`https://prometheus-prod-<N>-prod-eu-central-0.grafana.net/api/prom/push`).
- `GRAFANA_PROM_USER` — numeric Prometheus instance ID.
- `GRAFANA_PROM_TOKEN` — Grafana Cloud Access Policy token with
  `metrics:write` scope.

## Don't fork-edit here

The workflows + scripts are the **live copies**. The main app repo
keeps disabled reference copies (`on: workflow_dispatch:` only) for
historical / review purposes. If you change something here, mirror
the same edit into the main repo's reference copy in the same PR —
they drift otherwise. (Same for `tests/browser/*.spec.js`, the
Playwright config, and the push scripts.)
