#!/usr/bin/env python3
# Scrape /healthz?format=prom from the Worker and push to Grafana Cloud
# as InfluxDB line protocol. Run from GitHub Actions on a 5-min cron;
# the Worker itself never reaches out to Grafana (kept clean of paid
# subrequest budget + 10ms CPU bound).
#
# Required env:
#   WORKER_METRICS_URL  — e.g. https://zrh.vv.mk/healthz?format=prom
#   GRAFANA_PROM_URL    — same secret the Playwright pusher uses; the
#                         script swaps /api/prom/push → /api/v1/push/influx/write
#   GRAFANA_PROM_USER   — numeric Prometheus instance ID
#   GRAFANA_PROM_TOKEN  — CAP token with metrics:write
#
# Failure modes:
#   - Worker unreachable / 5xx → exit non-zero (workflow goes red)
#   - Grafana push rejected   → exit non-zero, dump response body
#   - Empty payload           → exit non-zero (every scrape MUST emit
#                                gauges, even when poll_failures is empty)

import base64
import os
import re
import sys
import time
import urllib.error
import urllib.request

# Prom text line: `name{labels?} value`, ignoring # HELP / # TYPE comments.
# Labels: `{key="value",key2="value2"}`. We don't carry through Prom's
# native double quoting; the worker only emits ASCII labels so it's safe.
LINE_RE = re.compile(
    r'^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+([+-]?[0-9.eE+-]+)\s*$'
)
LABEL_RE = re.compile(r'([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"')


def env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        sys.exit(f"error: missing env var {name}")
    return v


def prom_text_to_influx(text: str, ts_ns: int) -> str:
    out = []
    for raw in text.splitlines():
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue
        m = LINE_RE.match(raw)
        if not m:
            print(f"  warn: unparseable line skipped: {raw}", file=sys.stderr)
            continue
        name, _, label_str, value = m.groups()
        tags = ""
        if label_str:
            pairs = LABEL_RE.findall(label_str)
            # Influx tag syntax: ,k=v,k2=v2 (no quotes, commas inside values
            # would need escaping but our worker doesn't emit those).
            tags = "".join(f",{k}={v}" for k, v in pairs)
        out.append(f"{name}{tags} value={value} {ts_ns}")
    return "\n".join(out)


def influx_url_from_prom_push_url(prom_push_url: str) -> str:
    # The two endpoints share host + auth; only the path differs.
    suffix = "/api/prom/push"
    if prom_push_url.endswith(suffix):
        return prom_push_url[: -len(suffix)] + "/api/v1/push/influx/write"
    # Allow either to be configured as the secret value.
    if prom_push_url.endswith("/api/v1/push/influx/write"):
        return prom_push_url
    sys.exit(
        f"error: GRAFANA_PROM_URL must end in /api/prom/push or "
        f"/api/v1/push/influx/write, got: {prom_push_url}"
    )


def fetch_metrics(url: str) -> str:
    # No auth header: /healthz?format=prom is public (every value is
    # also visible in the public Grafana dashboard, so a token added
    # no real protection -- see worker comments on healthzAsProm).
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        sys.exit(f"error: scrape {url} → {e.code}\n{body}")
    except urllib.error.URLError as e:
        sys.exit(f"error: scrape {url} → {e.reason}")


def push(influx_url: str, user: str, password: str, body: bytes) -> None:
    auth = base64.b64encode(f"{user}:{password}".encode()).decode()
    req = urllib.request.Request(
        influx_url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "text/plain",
            "Authorization": f"Basic {auth}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"  ✓ pushed {len(body.splitlines())} metrics → {r.status}")
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")[:500]
        sys.exit(f"error: push → {e.code}\n{body_text}")
    except urllib.error.URLError as e:
        sys.exit(f"error: push → {e.reason}")


def main() -> int:
    worker_url = env("WORKER_METRICS_URL")
    prom_push_url = env("GRAFANA_PROM_URL")
    prom_user = env("GRAFANA_PROM_USER")
    prom_password = env("GRAFANA_PROM_TOKEN")

    influx_url = influx_url_from_prom_push_url(prom_push_url)
    ts_ns = time.time_ns()

    text = fetch_metrics(worker_url)
    body = prom_text_to_influx(text, ts_ns)
    if not body.strip():
        sys.exit("error: nothing to push (worker emitted empty/all-comment text)")

    push(influx_url, prom_user, prom_password, body.encode())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
