# scripts/smoke.py

Smoke suite for the live app — run this after every deploy (`docker compose up -d
--no-deps tmsi-app`), before considering the release done. Covers
[`docs/VERIFICATION-PROTOCOL.md`](../docs/VERIFICATION-PROTOCOL.md) blocks G–J (no-cost /
branch-scoped role boundaries) and O–R (business-rule integrity) in a couple of seconds,
without a browser and without touching real data — it does not replace a full
`VERIFICATION-PROTOCOL.md` execution (that still needs the browser/file/email steps and a
signed-off record in its section 7), it's the fast net that catches regressions between
those.

## Running it

```
python3 scripts/smoke.py
```

Runs on the VPS. **No node/npm, no new host dependency** — python3 stdlib
(`urllib`/`json`/`subprocess`) plus `docker exec ... psql` for the checks that need
transactional safety (`BEGIN`/`ROLLBACK`) or a JWT-claims-injected session instead of a
password. Exit code `0` when every assertion passes, `1` otherwise — safe to wire into a
future CI/deploy gate.

## What it needs

- The four labelled test-credential files in `~/tmp/tmsi-sudo/` (`finance-test-password.txt`,
  `pm-test-password.txt`, `logistics-test-password.txt`, `branch_manager-test-password.txt`,
  each `chmod 600`). No admin account — the Pedro's personal account never enters this
  script; see the `NOTE` at the top of `smoke.py` for why.
- `supabase-db` reachable via `docker exec` (same host, same compose project).
- The public app URL reachable over HTTPS (`https://tmsiequipment.duckdns.org`) — this
  suite deliberately hits the live PostgREST/GoTrue endpoints, not an internal shortcut,
  since that's the surface real clients (and real regressions) actually go through.

## What it does NOT do

- No browser, no cookies, no Next.js Server Actions — everything is direct PostgREST/
  GoTrue REST calls (real Bearer tokens from a real password login) or `psql` with
  injected JWT claims. It cannot exercise the app's own UI/middleware layer (e.g.
  `must_change_password`'s redirect, i9) — that stays a manual/browser check.
- No hardcoded expected values or counts (a project rule, not just a style choice — see
  the header comment in `smoke.py`): every assertion is a dynamic comparison (API result
  vs. a direct DB computation with the same claims), a set/subset relationship, or a
  response-class check. If a fixture the checks need (e.g. a draft product missing an HS
  code) doesn't happen to exist right now, that one check prints a `SKIP`, not a false ✅.
- No password of any kind ever appears in its output — only ✅/❌ per assertion and a
  final count.

## Extending it

Before trusting a new assertion, prove its failure branch — invert it locally (never
commit the inversion), confirm a real ❌ and a non-zero exit code, then restore it. Seeing
only ✅ once is not proof the check can actually fail; this is the same discipline
`docs/VERIFICATION-PROTOCOL.md` itself has always required of this project's manual
proofs, just applied to the automated ones too.
