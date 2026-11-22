#!/usr/bin/env python3
"""Smoke test for the live site. Run by .github/workflows/smoke.yml after every production
deploy and once a day. Prints one line per check and exits 1 if any check fails; the
workflow then opens (or updates) a GitHub issue labelled smoke-alert, which emails you."""
import json, re, sys, urllib.request, urllib.error

UA = {"User-Agent": "smoke-test (+github actions)"}
results = []

def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # DNS, TLS, timeout
        return 0, str(e)

def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))

def finish():
    bad = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(("PASS " if ok else "FAIL ") + name + (f" ({detail})" if detail else ""))
    with open("smoke-report.md", "w") as f:
        f.write("| Check | Result | Detail |\n|---|---|---|\n")
        for name, ok, detail in results:
            f.write(f"| {name} | {'✅' if ok else '❌'} | {detail.replace('|', '/')} |\n")
    sys.exit(1 if bad else 0)

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://nurjai.com").rstrip("/")

s, html = get(BASE + "/")
check("Homepage loads", s == 200 and 'id="root"' in html, f"HTTP {s}")
scripts = re.findall(r'<script[^>]+src="(/assets/[^"]+\.js)"', html)
preloads = re.findall(r'<link[^>]+rel="modulepreload"[^>]+href="(/assets/[^"]+\.js)"', html)
check("App script referenced", bool(scripts))
total, all_js = 0, ""
for src in scripts + preloads:
    s2, js = get(BASE + src)
    check(f"Loads {src}", s2 == 200, f"HTTP {s2}")
    total += len(js.encode()); all_js += js
# JavaScript a phone downloads before the first screen (uncompressed): 858 KB before lazy screens, 712 KB after (22 Nov 2026).
check("First-screen JavaScript under 750 KB", 0 < total < 750 * 1000, f"{total:,} bytes")
for pat in ("sk_live_", "sk_test_", "service_role", "gsk_", "xkeysib-"):
    check(f"No secret in app script ({pat})", pat not in all_js)
m = re.search(r'<meta property="og:image" content="([^"]+)"', html)
check("WhatsApp preview image set", bool(m))
if m:
    s3, _ = get(m.group(1)); check("WhatsApp preview image loads", s3 == 200, f"HTTP {s3}")
s4, h = get(BASE + "/api/status?health=1")
try:
    hj = json.loads(h)
except Exception:
    hj = {}
check("API health endpoint", s4 == 200 and hj.get("app") == "nurj", f"HTTP {s4}")
hints = {"email": "add BREVO_API_KEY (or RESEND_API_KEY) and REMINDER_FROM_EMAIL", "appUrl": "set APP_URL=https://nurjai.com",
         "ai": "add OPENAI_API_KEY", "database": "add SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", "cron": "add CRON_SECRET",
         "guestSalt": "add GUEST_IP_SALT", "billing": "VITE_BILLING_LIVE is on but PAYSTACK_SECRET_KEY is missing"}
for k, v in (hj.get("checks") or {}).items():
    check(f"Setting: {k}", v, "" if v else hints.get(k, ""))
finish()
