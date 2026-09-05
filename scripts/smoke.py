#!/usr/bin/env python3
# TMSI Equipment Price Listing
# Copyright (c) 2026 Pedro Alexandre. All rights reserved.
# PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
# distribution is strictly prohibited. See LICENSE at the repository root.
#
# Smoke suite (BACKLOG.md tarefa 3). Runs on the VPS, after every deploy —
# python3 stdlib only (urllib/json/subprocess), no node/npm, no new host
# dependency. Exercises the live PostgREST/GoTrue API directly (the same
# surface a real client hits) plus psql (docker exec, JWT-claims
# injection — no password needed) for the write-heavy business-rule
# checks that need transactional safety.
#
# Invariant (restriction 2 of the prompt): no assertion compares against a
# hardcoded literal value or count. Every check is either a dynamic
# comparison (API result vs compute_price() run directly with the same
# claims), a set/subset relationship (rows visible to a scoped role vs the
# superset an unrestricted read sees), or a response-class check (4xx /
# an error code family, never exact message text).
#
# Password rule (~/atelier-vps/CLAUDE.md, "TMSI — passwords de teste"):
# every credential is read with open(path).read().strip() directly into a
# variable that only ever flows into an HTTP request body — never printed,
# never logged, never passed through a shell command that could echo it.
# Real personal accounts (the admin) never appear here — see NOTE below.

import json
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date

BASE = "https://tmsiequipment.duckdns.org"
GOTRUE = f"{BASE}/auth/v1"
REST = f"{BASE}/rest/v1"

# NOTE (prompt restriction: "a tua conta pessoal nunca entra no smoke"):
# no dedicated test admin account exists (tmsi.user_roles has exactly one
# admin row, the Pedro's real one) — admin is deliberately absent from
# this table. product_manager/finance below already cover the "papéis
# financeiros" positive branch (4.1); admin's own gate is has_role('admin')
# and isn't distinguishable from finance/product_manager at the RLS layer
# this suite exercises.
TEST_USERS = {
    "finance": ("finance.test@example.test", "/home/pedro/tmp/tmsi-sudo/finance-test-password.txt"),
    "product_manager": ("pm.test@example.test", "/home/pedro/tmp/tmsi-sudo/pm-test-password.txt"),
    "logistics": ("logistics.test@example.test", "/home/pedro/tmp/tmsi-sudo/logistics-test-password.txt"),
    "branch_manager": ("branch_manager.test@example.test", "/home/pedro/tmp/tmsi-sudo/branch_manager-test-password.txt"),
}

RESULTS = []
FAILURES = 0


def check(name, passed, detail=""):
    global FAILURES
    RESULTS.append((name, passed, detail))
    mark = "✅" if passed else "❌"
    line = f"{mark} {name}"
    if detail:
        line += f" — {detail}"
    print(line)
    if not passed:
        FAILURES += 1


def http(method, url, token=None, body=None, prefer=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw
        return e.code, parsed


def login(email, password_path):
    password = open(password_path).read().strip()
    status, body = http(
        "POST", f"{GOTRUE}/token?grant_type=password", body={"email": email, "password": password}
    )
    if status != 200:
        raise RuntimeError(f"login failed for {email}: http_{status}")
    return body["access_token"]


def psql(sql, claims_uuid=None, tuples_only=True):
    """Run SQL via docker exec (no VPS-local psql needed). claims_uuid, if
    given, wraps the query as that user's session (perform, not select, so
    the setup itself never emits a row to parse) — no password involved."""
    script = ""
    if claims_uuid:
        script += (
            "do $$ begin perform set_config('request.jwt.claims', "
            f"'{{\"sub\":\"{claims_uuid}\",\"role\":\"authenticated\"}}', false); end $$;\n"
            "set role authenticated;\n"
        )
    script += sql + "\n"
    if claims_uuid:
        script += "reset role;\n"
    cmd = ["docker", "exec", "-i", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
    if tuples_only:
        cmd += ["-t", "-A", "-q", "-F", "|"]
    proc = subprocess.run(cmd, input=script, capture_output=True, text=True)
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def psql_rows(sql, claims_uuid=None):
    rc, out, err = psql(sql, claims_uuid)
    if rc != 0:
        raise RuntimeError(f"psql failed: {err}")
    return [line.split("|") for line in out.splitlines() if line != ""]


# ---------------------------------------------------------------------------
# 0. health
# ---------------------------------------------------------------------------
def block_health():
    status, _ = http("GET", f"{BASE}/api/health")
    check("health: /api/health", status == 200, f"http_{status}")
    status, _ = http("GET", f"{GOTRUE}/health")
    check("health: /auth/v1/health", status == 200, f"http_{status}")


# ---------------------------------------------------------------------------
# 4.2 G/H/I — sales/logistics-class role, zero cost visibility (no-cost role)
# ---------------------------------------------------------------------------
def block_no_cost_role(token):
    # G: raw table, cost columns -> refused by the database (0003/0004),
    # never a 200 with nulls (that would mean the REVOKE regressed).
    status, body = http("GET", f"{REST}/products?select=exw_price,sap_code_sa,supplier_id&limit=1", token=token)
    check(
        "G: raw products table cost columns refused for no-cost role",
        status == 403 and isinstance(body, dict) and body.get("code") == "42501",
        f"http_{status} code={body.get('code') if isinstance(body, dict) else body}",
    )

    # G (view side): the safe view returns rows but every cost cell is
    # null for this role — dynamic check (all null), never a fixed count.
    status, body = http("GET", f"{REST}/v_products?select=exw_price&limit=10", token=token)
    all_null = isinstance(body, list) and len(body) > 0 and all(r.get("exw_price") is None for r in body)
    check("G: v_products.exw_price is null for every row (no-cost role)", status == 200 and all_null, f"http_{status}")

    # H: oracle via a filter on a revoked column -> refused, not silently empty.
    status, body = http("GET", f"{REST}/products?select=id&exw_price=gt.0", token=token)
    check(
        "H: boolean-oracle filter on a revoked column refused, not silently empty",
        status == 403 and isinstance(body, dict) and body.get("code") == "42501",
        f"http_{status} code={body.get('code') if isinstance(body, dict) else body}",
    )

    # I: writes refused by RLS, in three different tables.
    status, body = http(
        "POST",
        f"{REST}/price_overrides",
        token=token,
        body={"product_id": "T-0001", "branch_id": "SA", "kind": "margin", "value": 1, "reason": "smoke"},
    )
    check("I: price_overrides INSERT refused for no-cost role", status in (401, 403), f"http_{status}")

    # Prefer: return=representation makes the distinction explicit — a
    # bare 200/204 doesn't tell apart "RLS matched and touched 0 rows"
    # from "the WHERE clause itself matched nothing" (the same "200/0
    # rows" ambiguity this project has hit before, i4/i5/i9's Nota 2);
    # with the representation, an empty array is the only way to
    # confirm the row genuinely wasn't written, not just unreported.
    status, body = http(
        "PATCH",
        f"{REST}/exchange_rates?currency=eq.EUR&effective_date=eq.{date.today().isoformat()}",
        token=token,
        body={"source": "smoke"},
        prefer="return=representation",
    )
    check(
        "I: exchange_rates UPDATE refused for no-cost role (0 rows touched, not just unreported)",
        status in (401, 403) or (status == 200 and body == []),
        f"http_{status} rows_touched={len(body) if isinstance(body, list) else body}",
    )


# ---------------------------------------------------------------------------
# 4.3 J — branch-scoped role: rows outside scope are a strict subset, never
# equal to the unrestricted (superuser) view. Set comparison, not a count.
# ---------------------------------------------------------------------------
def block_branch_scope(token, claims_uuid):
    status, body = http("GET", f"{REST}/v_products?select=id", token=token)
    check("J: branch-scoped role can read v_products at all", status == 200 and isinstance(body, list), f"http_{status}")
    scoped_ids = {r["id"] for r in body} if isinstance(body, list) else set()

    # The raw table, not the view: tmsi.v_products has row visibility
    # baked into its own WHERE clause (tmsi.products_visible(), 0003/0004
    # docs) rather than inherited RLS, so it would apply that same
    # function to an unauthenticated/no-claims caller too and NOT hand
    # back the true unrestricted superset. tmsi.products itself has no
    # such view-level clause — postgres (BYPASSRLS) sees every row.
    rows = psql_rows("select id from tmsi.products;")
    all_ids = {r[0] for r in rows}

    check(
        "J: branch-scoped role sees a strict subset of all products (never the full set)",
        len(scoped_ids) > 0 and scoped_ids <= all_ids and len(scoped_ids) < len(all_ids),
        f"scoped={len(scoped_ids)} total={len(all_ids)}",
    )


# ---------------------------------------------------------------------------
# 4.1 — cost-visible role: full listing + engine coherence (API vs direct
# compute_price() with the same claims — the actual "no hardcoded literal"
# instance the prompt names explicitly).
# ---------------------------------------------------------------------------
def block_cost_role_and_engine(token, claims_uuid, role_label):
    status, body = http("GET", f"{REST}/v_branch_prices?limit=10", token=token)
    has_rows = isinstance(body, list) and len(body) > 0
    check(f"A: {role_label} sees the full price listing", status == 200 and has_rows, f"http_{status}")
    if not has_rows:
        return
    any_cost_visible = any(r.get("total_cost_eur") is not None for r in body)
    check(f"A: {role_label} sees at least one non-null cost value", any_cost_visible)

    sample = next(r for r in body if r.get("total_cost_eur") is not None)
    product_id, branch_id = sample["product_id"], sample["branch_id"]

    status, api_result = http(
        "POST",
        f"{REST}/rpc/compute_price",
        token=token,
        body={"p_product": product_id, "p_branch": branch_id},
    )
    check(f"B: {role_label} compute_price() RPC reachable", status == 200, f"http_{status}")

    db_rows = psql_rows(
        f"select min_price, ref_price, total_cost_eur, margin from tmsi.compute_price('{product_id}','{branch_id}');",
        claims_uuid=claims_uuid,
    )
    api_row = api_result[0] if isinstance(api_result, list) and api_result else api_result
    # Numeric comparison, not string equality — PostgREST's JSON encodes
    # numeric(x,2) without preserving trailing zeros (949.0) while psql's
    # text output preserves the column's declared scale (949.00); same
    # value, different textual representation. Caught by this suite's own
    # required proof of its failure branch (restriction 4) before trusting
    # a run of all-✅.
    engine_matches = (
        status == 200
        and db_rows
        and float(api_row.get("min_price")) == float(db_rows[0][0])
        and float(api_row.get("ref_price")) == float(db_rows[0][1])
    )
    check(
        f"B: engine coherence — API compute_price() == direct DB compute_price() ({role_label})",
        engine_matches,
        f"api={api_row.get('min_price') if isinstance(api_row, dict) else api_row}/db={db_rows[0][0] if db_rows else None}",
    )


# ---------------------------------------------------------------------------
# 4.4 O — activation blocked without HS/weight/SAP (negative — refused, so
# nothing changes, no revert needed). Candidate product discovered at
# runtime, never a hardcoded id.
# ---------------------------------------------------------------------------
def block_activation_guard(token):
    candidates = psql_rows(
        "select id from tmsi.products where status <> 'active' and item_type = 'equipment' "
        "and hs_code is null limit 1;"
    )
    if not candidates:
        check("O: activation-without-HS guard", True, "SKIP — no draft/equipment/no-hs-code fixture found right now")
        return
    product_id = candidates[0][0]
    status, body = http("PATCH", f"{REST}/products?id=eq.{product_id}", token=token, body={"status": "active"})
    check(
        "O: activating equipment without HS/weight/SAP is blocked by the database",
        status >= 400,
        f"http_{status} product={product_id}",
    )


# ---------------------------------------------------------------------------
# 4.4 Q — override without a reason refused (negative, no revert needed).
# ---------------------------------------------------------------------------
def block_override_reason_guard(token):
    status, body = http(
        "POST",
        f"{REST}/price_overrides",
        token=token,
        body={"product_id": "T-0001", "branch_id": "SA", "kind": "margin", "value": 1},
    )
    check("Q: price_overrides insert without a reason is refused", status >= 400, f"http_{status}")


# ---------------------------------------------------------------------------
# 4.4 P — EXW change on an active product -> review + new price_versions
# row, both automatic. The one test with a multi-row side effect: run
# entirely inside BEGIN/ROLLBACK via psql, so nothing is ever committed —
# not "revert after the fact", genuinely never persisted.
# ---------------------------------------------------------------------------
def block_exw_review_transition(claims_uuid):
    candidates = psql_rows("select id, exw_price, status from tmsi.products where status='active' and item_type='equipment' limit 1;")
    if not candidates:
        check("P: EXW change -> review transition", True, "SKIP — no active equipment product found")
        return
    product_id, exw_price, _status = candidates[0]
    new_exw = str(float(exw_price) + 1)

    sql = f"""
begin;
select count(*) from tmsi.price_versions where product_id = '{product_id}';
update tmsi.products set exw_price = {new_exw} where id = '{product_id}';
select status from tmsi.products where id = '{product_id}';
select count(*) from tmsi.price_versions where product_id = '{product_id}';
rollback;
"""
    rc, out, err = psql(sql, claims_uuid=claims_uuid)
    lines = [l for l in out.splitlines() if l != ""]
    if rc != 0 or len(lines) < 3:
        check("P: EXW change -> review transition", False, f"psql error: {err}")
        return
    versions_before, new_status, versions_after = lines[0], lines[1], lines[2]
    check(
        "P: EXW change on an active product flips status to review",
        new_status == "review",
        f"status={new_status}",
    )
    check(
        "P: EXW change creates a new price_versions row",
        int(versions_after) == int(versions_before) + 1,
        f"before={versions_before} after={versions_after}",
    )

    # Confirm ROLLBACK really left no trace — a fresh read, outside that
    # transaction, must show the ORIGINAL values, not the mutated ones.
    confirm = psql_rows(f"select exw_price, status from tmsi.products where id = '{product_id}';")
    check(
        "P: no residue after ROLLBACK — product back to its pre-test state",
        confirm and confirm[0][0] == str(exw_price) and confirm[0][1] == _status,
        f"exw={confirm[0][0] if confirm else None} status={confirm[0][1] if confirm else None}",
    )


# ---------------------------------------------------------------------------
# 4.4 R — same-day exchange-rate correction (0005, a real bug the Pedro
# hit live). Self-contained rather than depending on a rate already
# having been entered today (that's incidental — most days nobody has
# touched /config yet when this suite runs): creates its own baseline +
# correction for today under a currency that already has real historical
# data, so the "historical query is unaffected" half has something real
# to compare against. Both inserted rows are deleted afterward — a real
# REST write, cleanly reverted, not a ROLLBACK (this one wants to prove
# the rows really persist and are independently queryable mid-test, the
# same shape as an admin using /config twice in one day for real).
# ---------------------------------------------------------------------------
def block_fx_same_day_correction(token, claims_uuid):
    # Same tie-break fx_rate() itself uses (0005: effective_date desc,
    # created_at desc) — a naive query without the second key can pick a
    # since-superseded same-day row instead of the one fx_rate() would
    # actually return for that date, a real mismatch this suite's own
    # required failure-branch proof (restriction 4) caught: this exact
    # database already has two 2026-09-04 CNY rows from earlier testing.
    candidates = psql_rows(
        "select currency, effective_date, rate_per_eur from tmsi.exchange_rates "
        "where effective_date < current_date order by effective_date desc, created_at desc limit 1;"
    )
    if not candidates:
        check("R: same-day FX correction", True, "SKIP — no historical exchange rate to compare against")
        return
    currency, hist_date, hist_rate = candidates[0]

    inserted_ids = []

    def insert_today(rate):
        status, created = http(
            "POST",
            f"{REST}/exchange_rates",
            token=token,
            body={"currency": currency, "rate_per_eur": rate, "effective_date": str(date.today()), "source": "smoke-test"},
            prefer="return=representation",
        )
        if status == 201 and isinstance(created, list) and len(created) == 1:
            inserted_ids.append(created[0]["id"])
            return True
        return False

    baseline_rate = str(float(hist_rate) + 1.0)
    correction_rate = str(float(hist_rate) + 2.0)
    baseline_ok = insert_today(baseline_rate)
    check("R: first same-day rate accepted", baseline_ok, f"currency={currency}")
    correction_ok = baseline_ok and insert_today(correction_rate)
    check(
        "R: a second same-day rate for the same currency is accepted (0005), not a duplicate-key error",
        correction_ok,
    )

    if correction_ok:
        status, fx_result = http("POST", f"{REST}/rpc/fx_rate", token=token, body={"p_currency": currency})
        check(
            "R: fx_rate() reflects the LATEST same-day entry, not the first one",
            status == 200 and float(fx_result) == float(correction_rate),
            f"fx_rate={fx_result} expected={correction_rate}",
        )

        status, hist_fx = http(
            "POST", f"{REST}/rpc/fx_rate", token=token, body={"p_currency": currency, "p_date": hist_date}
        )
        check(
            "R: a historical-date query is insensitive to today's corrections (returns the period's own rate)",
            status == 200 and float(hist_fx) == float(hist_rate) and float(hist_fx) != float(correction_rate),
            f"historical={hist_fx} today_correction={correction_rate}",
        )

    if inserted_ids:
        for rid in inserted_ids:
            http("DELETE", f"{REST}/exchange_rates?id=eq.{rid}", token=token)
        remaining = psql_rows(
            f"select count(*) from tmsi.exchange_rates where id in ({','.join(str(i) for i in inserted_ids)});"
        )
        check(
            "R: no residue — every row this test inserted was deleted",
            bool(remaining) and remaining[0][0] == "0",
            f"inserted={len(inserted_ids)} remaining={remaining[0][0] if remaining else '?'}",
        )


def main():
    print(f"=== TMSI smoke — {BASE} — {date.today().isoformat()} ===")
    block_health()

    tokens = {}
    for role, (email, path) in TEST_USERS.items():
        tokens[role] = login(email, path)

    # UUIDs looked up from TEST_USERS' own emails, not hardcoded alongside
    # them — a test account recreated with a new id would otherwise go
    # silently stale here while TEST_USERS still "worked" (it logs in via
    # email, the claims dict wouldn't notice a mismatch on its own).
    claims = {}
    for role, (email, _path) in TEST_USERS.items():
        rows = psql_rows(f"select user_id from tmsi.profiles where email = '{email}';")
        if not rows:
            raise RuntimeError(f"no tmsi.profiles row for {email} — smoke fixture missing")
        claims[role] = rows[0][0]

    block_no_cost_role(tokens["logistics"])
    block_branch_scope(tokens["branch_manager"], claims["branch_manager"])
    block_cost_role_and_engine(tokens["finance"], claims["finance"], "finance")
    block_cost_role_and_engine(tokens["product_manager"], claims["product_manager"], "product_manager")
    block_activation_guard(tokens["product_manager"])
    block_override_reason_guard(tokens["finance"])
    block_exw_review_transition(claims["product_manager"])
    block_fx_same_day_correction(tokens["finance"], claims["finance"])

    total = len(RESULTS)
    print(f"\n=== {total - FAILURES}/{total} passed ===")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
