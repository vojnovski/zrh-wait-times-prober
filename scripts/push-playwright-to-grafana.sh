#!/usr/bin/env bash
# Translate Playwright JSON reporter output into InfluxDB line
# protocol and POST to Grafana Cloud's Prometheus remote_write
# endpoint. Runs as the last step of the GitHub Actions workflows
# defined in `.github/workflows/browser-probes-{pr,cron}.yml`.
#
# Usage:
#   ./scripts/push-playwright-to-grafana.sh <results.json> <env-label>
# where <env-label> is "prod" (continuous probe) or "pr-<num>" (PR
# gate). The env label drives Alertmanager routing — only "prod"
# fires Pushover.
#
# Required environment:
#   GRAFANA_PROM_URL    — Grafana Cloud Prometheus push URL. Either of:
#                          - .../api/prom/push                  (protobuf remote_write)
#                          - .../api/v1/push/influx/write       (Influx line protocol)
#                         We always POST Influx line protocol, so the
#                         script rewrites the prom/push form to the
#                         influx form before sending. Setting either as
#                         the secret works.
#   GRAFANA_PROM_USER   — Prometheus instance id (numeric)
#   GRAFANA_PROM_TOKEN  — Cloud Access Policy token with metrics:write
#
# Emits per-spec metrics:
#   playwright_probe_success{cuj=cuj1, env=prod} 1
#   playwright_probe_duration_seconds{cuj=cuj1, env=prod} 1.5

set -euo pipefail

results_json="${1:-}"
env_label="${2:-unknown}"

if [[ -z "${results_json}" || ! -f "${results_json}" ]]; then
  echo "usage: $0 <results.json> <env-label>" >&2
  exit 2
fi
for var in GRAFANA_PROM_URL GRAFANA_PROM_USER GRAFANA_PROM_TOKEN; do
  if [[ -z "${!var:-}" ]]; then
    echo "missing env var: $var" >&2
    exit 2
  fi
done

# nanosecond epoch, used as the optional timestamp on each line.
ts_ns=$(date +%s%N)

# Pull per-spec results out of Playwright's JSON reporter. Each suite
# in the report contains specs (one per test); we map specName ("CUJ-1
# now-tab loads") → cuj label ("cuj1") via a regex on the spec title.
# Tests are written so the title starts with "CUJ-N ..." for this
# to work; doc-sync rule covers it.
lines=$(node -e '
  const fs = require("fs");
  const env = process.argv[2];
  const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  // Playwright JSON reporter shape: { suites: [{ specs: [{ title, tests: [{ results: [{ status, duration }] }] }] }] }
  function walk(suites, acc = []) {
    for (const s of suites || []) {
      for (const spec of s.specs || []) {
        const titleMatch = (spec.title || "").match(/^CUJ-(\d+)/i);
        if (!titleMatch) continue;
        const cuj = `cuj${titleMatch[1]}`;
        const test = (spec.tests || [])[0] || {};
        const result = (test.results || [])[0] || {};
        const ok = result.status === "passed" ? 1 : 0;
        const durationMs = Number(result.duration ?? 0);
        acc.push(`playwright_probe_success,cuj=${cuj},env=${env} value=${ok}`);
        acc.push(`playwright_probe_duration_seconds,cuj=${cuj},env=${env} value=${(durationMs / 1000).toFixed(3)}`);
      }
      walk(s.suites, acc);
    }
    return acc;
  }
  console.log(walk(r.suites).join("\n"));
' "${results_json}" "${env_label}")

if [[ -z "${lines}" ]]; then
  echo "no CUJ specs found in ${results_json} (titles must start with 'CUJ-N')" >&2
  exit 1
fi

# Normalise the URL to the Influx line-protocol endpoint. The secret
# may be set to either the protobuf form (.../api/prom/push) or the
# influx form (.../api/v1/push/influx/write) — both hosts/auth are the
# same; only the path differs.
push_url="${GRAFANA_PROM_URL}"
if [[ "${push_url}" == */api/prom/push ]]; then
  push_url="${push_url%/api/prom/push}/api/v1/push/influx/write"
fi

echo "pushing $(echo "${lines}" | wc -l | tr -d ' ') lines to ${push_url}"

# remote_write via the influx line-protocol endpoint. Auth is
# basic-auth (user = numeric instance id, password = token).
curl --silent --show-error --fail-with-body \
  -u "${GRAFANA_PROM_USER}:${GRAFANA_PROM_TOKEN}" \
  -H "Content-Type: text/plain" \
  --data-binary "${lines}" \
  "${push_url}"

echo "OK"
