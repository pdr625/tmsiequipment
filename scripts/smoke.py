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
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

# item 21 F6 (docs/DISASTER-DRILL.md achado 8): portable via env vars, with
# today's production values as defaults — unset, this behaves byte-for-byte
# as it always has. Only override to point this at a drill/second
# environment (a different BASE, and/or a credentials dir laid out the same
# way: one "<role>-test-password.txt" file per TEST_USERS entry below).
BASE = os.environ.get("TMSI_BASE_URL", "https://tmsiequipment.duckdns.org")
CREDENTIALS_DIR = os.environ.get("TMSI_CREDENTIALS_DIR", "/home/pedro/tmp/tmsi-sudo")
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
    "finance": ("finance.test@example.test", f"{CREDENTIALS_DIR}/finance-test-password.txt"),
    "product_manager": ("pm.test@example.test", f"{CREDENTIALS_DIR}/pm-test-password.txt"),
    "logistics": ("logistics.test@example.test", f"{CREDENTIALS_DIR}/logistics-test-password.txt"),
    "branch_manager": ("branch_manager.test@example.test", f"{CREDENTIALS_DIR}/branch_manager-test-password.txt"),
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


def db_today():
    """Postgres's own current_date — the one authority any date comparison
    in this suite uses (item 25: this VPS's host clock is WEST/UTC+1, the
    db container is UTC; date.today() genuinely disagrees with Postgres's
    current_date for the ~1h/day window after local midnight but before UTC
    midnight — caught live when this exact mismatch failed block R). Never
    date.today() for anything compared against a row's effective_date."""
    return date.fromisoformat(psql_rows("select current_date;")[0][0])


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
        body={"product_id": "T-0001", "scope_type": "branch", "scope_id": "SA", "kind": "margin", "value": 1, "reason": "smoke"},
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
        f"{REST}/exchange_rates?currency=eq.EUR&effective_date=eq.{db_today().isoformat()}",
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
        body={"p_product": product_id, "p_scope_type": "branch", "p_scope_id": branch_id},
    )
    check(f"B: {role_label} compute_price() RPC reachable", status == 200, f"http_{status}")

    db_rows = psql_rows(
        f"select min_price, ref_price, total_cost_eur, margin from tmsi.compute_price('{product_id}','branch','{branch_id}');",
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
        body={"product_id": "T-0001", "scope_type": "branch", "scope_id": "SA", "kind": "margin", "value": 1},
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
# 4.4 R — 0007's approval workflow. Supersedes the old direct-insert
# same-day FX test (0005): tmsi.config_write on exchange_rates was
# DROPPED by 0007, so a direct POST that used to succeed for finance now
# correctly fails — asserted below as the new, intentional behaviour,
# not a regression left unexplained. exchange_rates is one of the three
# admin-only-approval types (0007 §1: no branch identity to hang BM
# eligibility on) — smoke has no admin test account by design (see the
# NOTE above TEST_USERS: "a tua conta pessoal nunca entra no smoke"), so
# this block proves exactly what's provable without one: the direct-write
# bypass is closed, a pending proposal is invisible to fx_rate(), and an
# ineligible caller (finance, on their own proposal) is refused. Cleanup
# is a plain superuser DELETE (docker exec as `postgres`, no claims) —
# unrelated to the app-level admin role this suite deliberately avoids.
# ---------------------------------------------------------------------------
def block_proposal_workflow_exchange_rates(token, claims_uuid):
    candidates = psql_rows(
        "select currency, effective_date, rate_per_eur from tmsi.exchange_rates "
        "where effective_date < current_date order by effective_date desc, created_at desc limit 1;"
    )
    if not candidates:
        check("R: approval workflow (exchange_rates)", True, "SKIP — no historical exchange rate to compare against")
        return
    currency, _hist_date, hist_rate = candidates[0]
    today = db_today()
    correction_rate = str(float(hist_rate) + 1.0)

    status, _body = http(
        "POST",
        f"{REST}/exchange_rates",
        token=token,
        body={"currency": currency, "rate_per_eur": correction_rate, "effective_date": str(today), "source": "smoke-test"},
    )
    check(
        "R: direct exchange_rates INSERT is refused even for finance (0007 dropped config_write)",
        status in (401, 403),
        f"http_{status}",
    )

    status, before_fx = http("POST", f"{REST}/rpc/fx_rate", token=token, body={"p_currency": currency})
    check("R: fx_rate() reachable before proposing", status == 200, f"http_{status}")

    status, created = http(
        "POST",
        f"{REST}/price_proposals",
        token=token,
        body={
            "target_table": "exchange_rates",
            "branch_id": None,
            "payload": {"currency": currency, "rate_per_eur": correction_rate, "effective_date": str(today), "source": "smoke-test"},
            "reason": "smoke: exchange_rates proposal workflow",
            "proposed_by": claims_uuid,
        },
        prefer="return=representation",
    )
    proposal_ok = status == 201 and isinstance(created, list) and len(created) == 1
    check("R: finance can propose an exchange_rates change", proposal_ok, f"http_{status}")
    if not proposal_ok:
        return
    proposal_id = created[0]["id"]

    status, pending_fx = http("POST", f"{REST}/rpc/fx_rate", token=token, body={"p_currency": currency})
    check(
        "R: a pending proposal is invisible to fx_rate() — engine unchanged",
        status == 200 and float(pending_fx) == float(before_fx),
        f"before={before_fx} pending={pending_fx}",
    )

    status, _decide_body = http(
        "POST",
        f"{REST}/rpc/decide_price_proposal",
        token=token,
        body={"p_proposal_id": proposal_id, "p_decision": "approved", "p_reason": None},
    )
    check(
        "R: an ineligible caller (finance, on their own exchange_rates proposal) is refused",
        status >= 400,
        f"http_{status}",
    )

    psql_rows(f"delete from tmsi.price_proposals where id = {proposal_id};")
    remaining = psql_rows(f"select count(*) from tmsi.price_proposals where id = {proposal_id};")
    check(
        "R: no residue — the test proposal was deleted",
        bool(remaining) and remaining[0][0] == "0",
        f"remaining={remaining[0][0] if remaining else '?'}",
    )


# ---------------------------------------------------------------------------
# 4.4 S — 0007's approval workflow, full flow via price_overrides (a
# branch-scoped type — branch_manager.test can approve, unlike
# exchange_rates above, so this is where the complete propose->approve->
# effect proof and the wrong-branch/reject proofs actually live).
# Overrides rather than margin_grids deliberately: an override is a new,
# independently deletable row, never an in-place edit of a live branch's
# real config — cleanup here can't corrupt a real tier's margin even if
# a later step fails, unlike mutating tmsi.margin_grids directly would.
# ---------------------------------------------------------------------------
def block_proposal_workflow_overrides(finance_token, finance_uuid, bm_token, bm_uuid):
    own_branches = {r[0] for r in psql_rows(f"select branch_id from tmsi.user_roles where user_id = '{bm_uuid}' and role = 'branch_manager' and branch_id is not null;")}
    if not own_branches:
        check("S: approval workflow (price_overrides)", True, "SKIP — branch_manager.test has no branch_id role row")
        return
    own_branch = sorted(own_branches)[0]
    own_branches_sql = ",".join(f"'{b}'" for b in own_branches)
    other_candidates = psql_rows(
        f"select id from tmsi.branches where active and id not in ({own_branches_sql}) limit 1;"
    )
    product_candidates = psql_rows("select id from tmsi.products where status = 'active' and item_type = 'equipment' limit 1;")
    if not other_candidates or not product_candidates:
        check("S: approval workflow (price_overrides)", True, "SKIP — no other active branch or active equipment product found")
        return
    other_branch = other_candidates[0][0]
    product_id = product_candidates[0][0]
    today = db_today()

    def compute_margin(branch_id):
        status, result = http(
            "POST", f"{REST}/rpc/compute_price", token=finance_token,
            body={"p_product": product_id, "p_scope_type": "branch", "p_scope_id": branch_id},
        )
        row = result[0] if isinstance(result, list) and result else None
        return status, (float(row["margin"]) if row and row.get("margin") is not None else None)

    status, baseline_margin = compute_margin(own_branch)
    check("S: compute_price reachable for the own-branch baseline", status == 200 and baseline_margin is not None, f"http_{status}")
    if baseline_margin is None:
        return
    proposed_margin = round(baseline_margin + 0.05, 4)

    def propose(branch_id, margin, reason):
        status, created = http(
            "POST",
            f"{REST}/price_proposals",
            token=finance_token,
            body={
                "target_table": "price_overrides",
                "branch_id": branch_id,
                "payload": {
                    "product_id": product_id, "scope_type": "branch", "scope_id": branch_id, "kind": "margin", "value": margin,
                    "reason": reason, "valid_from": str(today), "valid_to": None,
                },
                "reason": reason,
                "proposed_by": finance_uuid,
            },
            prefer="return=representation",
        )
        return (created[0]["id"] if status == 201 and isinstance(created, list) and created else None)

    own_id = propose(own_branch, proposed_margin, "smoke: price_overrides approval-flow proposal")
    other_id = propose(other_branch, proposed_margin, "smoke: price_overrides wrong-branch proposal")
    reject_id = propose(own_branch, proposed_margin, "smoke: price_overrides reject-flow proposal")
    check(
        "S: finance can propose price_overrides changes",
        bool(own_id and other_id and reject_id),
        f"own={own_id} other={other_id} reject={reject_id}",
    )
    if not (own_id and other_id and reject_id):
        for pid in (own_id, other_id, reject_id):
            if pid:
                psql_rows(f"delete from tmsi.price_proposals where id = {pid};")
        return

    status, pending_margin = compute_margin(own_branch)
    check(
        "S: a pending price_overrides proposal is invisible to compute_price()",
        status == 200 and pending_margin == baseline_margin,
        f"before={baseline_margin} pending={pending_margin}",
    )

    status, _body = http("POST", f"{REST}/rpc/decide_price_proposal", token=bm_token, body={"p_proposal_id": other_id, "p_decision": "approved", "p_reason": None})
    check("S: branch_manager approving a proposal OUTSIDE their branch is refused", status >= 400, f"http_{status}")

    status, _body = http("POST", f"{REST}/rpc/decide_price_proposal", token=bm_token, body={"p_proposal_id": own_id, "p_decision": "approved", "p_reason": "smoke: approved"})
    check("S: branch_manager approving a proposal for their OWN branch succeeds", status in (200, 204), f"http_{status}")
    status, after_margin = compute_margin(own_branch)
    check(
        "S: full propose -> approve -> effect — compute_price() now reflects the approved override",
        status == 200 and after_margin == proposed_margin,
        f"expected={proposed_margin} got={after_margin}",
    )

    status, _body = http("POST", f"{REST}/rpc/decide_price_proposal", token=bm_token, body={"p_proposal_id": reject_id, "p_decision": "rejected", "p_reason": None})
    check("S: rejecting a price_overrides proposal without a reason is refused", status >= 400, f"http_{status}")
    status, _body = http("POST", f"{REST}/rpc/decide_price_proposal", token=bm_token, body={"p_proposal_id": reject_id, "p_decision": "rejected", "p_reason": "smoke: not needed"})
    check("S: rejecting with a reason succeeds", status in (200, 204), f"http_{status}")
    status, still_margin = compute_margin(own_branch)
    check(
        "S: a rejected proposal never reaches compute_price() — value unchanged from the approved one",
        status == 200 and still_margin == proposed_margin,
        f"expected={proposed_margin} got={still_margin}",
    )

    materialized = psql_rows(f"select materialized_id from tmsi.price_proposals where id = {own_id};")
    if materialized and materialized[0][0] and materialized[0][0] != "":
        psql_rows(f"delete from tmsi.price_overrides where id = {materialized[0][0]};")
    for pid in (own_id, other_id, reject_id):
        psql_rows(f"delete from tmsi.price_proposals where id = {pid};")
    remaining_proposals = psql_rows(f"select count(*) from tmsi.price_proposals where id in ({own_id},{other_id},{reject_id});")
    status, restored_margin = compute_margin(own_branch)
    check(
        "S: no residue — proposals and the materialized override were deleted, compute_price() back to baseline",
        remaining_proposals and remaining_proposals[0][0] == "0" and status == 200 and restored_margin == baseline_margin,
        f"remaining={remaining_proposals[0][0] if remaining_proposals else '?'} margin={restored_margin} baseline={baseline_margin}",
    )


# ---------------------------------------------------------------------------
# T — migration 0009: channel-scoped price_overrides. A channel id can never
# equal a member of any branch_manager's my_branches() (different id
# spaces), so approval falls to admin-only by the SAME mechanism block R
# already exercises for exchange_rates — no branch_manager-approves path
# exists for a channel, unlike block S's branch-scoped one. Channel/product
# pair discovered at runtime (tmsi.channels join products on sold_in/
# primary_branch, the exact predicate tmsi.v_branch_prices itself uses),
# never a hardcoded id.
# ---------------------------------------------------------------------------
def block_proposal_workflow_channel(finance_token, finance_uuid, bm_token, bm_uuid):
    candidates = psql_rows(
        "select ch.id, p.id from tmsi.channels ch "
        "join tmsi.products p on ch.branch_id = any(p.sold_in) or ch.branch_id = p.primary_branch "
        "where ch.active limit 1;"
    )
    if not candidates:
        check("T: approval workflow (price_overrides, channel scope)", True, "SKIP — no active channel with an eligible product found")
        return
    channel_id, product_id = candidates[0]
    today = db_today()

    def compute_channel_min(cid):
        status, result = http(
            "POST", f"{REST}/rpc/compute_price", token=finance_token,
            body={"p_product": product_id, "p_scope_type": "channel", "p_scope_id": cid},
        )
        row = result[0] if isinstance(result, list) and result else None
        return status, (float(row["min_price"]) if row and row.get("min_price") is not None else None)

    status, baseline_min = compute_channel_min(channel_id)
    check("T: compute_price reachable for the channel baseline", status == 200 and baseline_min is not None, f"http_{status}")
    if baseline_min is None:
        return

    status, direct_insert = http(
        "POST", f"{REST}/price_overrides", token=finance_token,
        body={"product_id": product_id, "scope_type": "channel", "scope_id": channel_id, "kind": "margin", "value": 0.3, "reason": "smoke"},
    )
    check("T: direct price_overrides INSERT refused even for finance (proposals is the only path in)", status in (401, 403), f"http_{status}")

    status, created = http(
        "POST",
        f"{REST}/price_proposals",
        token=finance_token,
        body={
            "target_table": "price_overrides",
            "branch_id": channel_id,
            "payload": {
                "product_id": product_id, "scope_type": "channel", "scope_id": channel_id, "kind": "margin", "value": 0.3,
                "reason": "smoke: channel approval-flow proposal", "valid_from": str(today), "valid_to": None,
            },
            "reason": "smoke: channel approval-flow proposal",
            "proposed_by": finance_uuid,
        },
        prefer="return=representation",
    )
    proposal_ok = status == 201 and isinstance(created, list) and len(created) == 1
    check("T: finance can propose a channel-scoped price_overrides change", proposal_ok, f"http_{status}")
    if not proposal_ok:
        return
    proposal_id = created[0]["id"]

    status, pending_min = compute_channel_min(channel_id)
    check(
        "T: a pending channel proposal is invisible to compute_price()",
        status == 200 and pending_min == baseline_min,
        f"before={baseline_min} pending={pending_min}",
    )

    status, _body = http(
        "POST", f"{REST}/rpc/decide_price_proposal", token=bm_token,
        body={"p_proposal_id": proposal_id, "p_decision": "approved", "p_reason": None},
    )
    check("T: branch_manager approving a channel-scoped proposal is refused (no branch identity to match)", status >= 400, f"http_{status}")

    status, _body = http(
        "POST", f"{REST}/rpc/decide_price_proposal", token=finance_token,
        body={"p_proposal_id": proposal_id, "p_decision": "approved", "p_reason": None},
    )
    check("T: finance approving their OWN channel proposal is refused (admin-only, same as exchange_rates)", status >= 400, f"http_{status}")

    psql_rows(f"delete from tmsi.price_proposals where id = {proposal_id};")
    remaining = psql_rows(f"select count(*) from tmsi.price_proposals where id = {proposal_id};")
    check(
        "T: no residue — the test proposal was deleted",
        bool(remaining) and remaining[0][0] == "0",
        f"remaining={remaining[0][0] if remaining else '?'}",
    )


# ---------------------------------------------------------------------------
# U — migration 0010 decision (A): the published minimum rounds UP to the
# currency's own step (tmsi.currency_rounding_params), never to nearest and
# never down; the reference price rounds to nearest from the ALREADY-rounded
# minimum, using the branch's own ref_factor (tmsi.branch_pricing_params) —
# never a hardcoded 1.10. Independent verification: the expected values are
# computed here in Python from the engine's own raw (unrounded) total_cost/
# margin/list_coef, not just compared API-vs-DB (which would trivially
# agree, both being the same server-side computation).
# ---------------------------------------------------------------------------
def block_rounding(finance_token):
    candidates = psql_rows(
        "select p.id, b.id, b.currency from tmsi.products p cross join tmsi.branches b "
        "where (b.id = any(p.sold_in) or b.id = p.primary_branch) and b.id <> p.primary_branch "
        "and p.item_type in ('equipment','spare_part') and p.status = 'active' limit 1;"
    )
    if not candidates:
        check("U: rounding (minimum up, reference from the rounded minimum)", True,
              "SKIP — no cross-branch active equipment/spare_part product found")
        return
    product_id, branch_id, currency = candidates[0]

    step_rows = psql_rows(
        f"select rounding from tmsi.currency_rounding_params where currency = '{currency}' "
        "and effective_date <= current_date order by effective_date desc, created_at desc limit 1;"
    )
    factor_rows = psql_rows(
        f"select ref_factor from tmsi.branch_pricing_params where branch_id = '{branch_id}' "
        "and effective_date <= current_date order by effective_date desc, created_at desc limit 1;"
    )
    if not step_rows or not factor_rows:
        check("U: rounding config reachable", False, f"step={bool(step_rows)} factor={bool(factor_rows)}")
        return
    step, ref_factor = Decimal(step_rows[0][0]), Decimal(factor_rows[0][0])

    status, api_result = http(
        "POST", f"{REST}/rpc/compute_price", token=finance_token,
        body={"p_product": product_id, "p_scope_type": "branch", "p_scope_id": branch_id},
    )
    api_row = api_result[0] if status == 200 and isinstance(api_result, list) and api_result else None
    check("U: compute_price reachable", api_row is not None, f"http_{status}")
    if api_row is None:
        return

    db_rows = psql_rows(f"select total_cost, margin, list_coef from tmsi.compute_price('{product_id}','branch','{branch_id}');")
    total_cost, margin, coef = (Decimal(x) for x in db_rows[0])
    raw_min = total_cost / (1 - margin) * coef
    expected_min = (raw_min / step).to_integral_value(rounding=ROUND_CEILING) * step
    got_min = Decimal(str(api_row["min_price"]))
    check(
        "U: minimum price rounds UP to the currency step (never nearest, never down)",
        got_min == expected_min,
        f"raw={raw_min} step={step} expected={expected_min} got={got_min}",
    )

    expected_ref = (expected_min * ref_factor / step).to_integral_value(rounding=ROUND_HALF_UP) * step
    got_ref = Decimal(str(api_row["ref_price"]))
    check(
        "U: reference price = round_nearest(ROUNDED minimum x ref_factor), not the raw minimum",
        got_ref == expected_ref,
        f"rounded_min={expected_min} ref_factor={ref_factor} expected={expected_ref} got={got_ref}",
    )


# ---------------------------------------------------------------------------
# V — item 31: origin_country moved behind can_read_costs() (0010). Dynamic
# check against the same product for a cost-visible and a no-cost role —
# never a fixed expected country value, just presence vs absence.
# ---------------------------------------------------------------------------
def block_origin_country_boundary(cost_token, no_cost_token):
    candidates = psql_rows("select id from tmsi.products where origin_country is not null limit 1;")
    if not candidates:
        check("V: origin_country boundary", True, "SKIP — no product with an origin_country set")
        return
    product_id = candidates[0][0]

    status, body = http("GET", f"{REST}/v_products?id=eq.{product_id}&select=origin_country", token=cost_token)
    cost_row = body[0] if status == 200 and isinstance(body, list) and body else None
    check(
        "V: cost-visible role sees origin_country",
        cost_row is not None and cost_row.get("origin_country") is not None,
        f"http_{status} row={cost_row}",
    )

    status, body = http("GET", f"{REST}/v_products?id=eq.{product_id}&select=origin_country", token=no_cost_token)
    no_cost_row = body[0] if status == 200 and isinstance(body, list) and body else None
    check(
        "V: no-cost role does NOT see origin_country (null, not an error — 0010 moved this behind can_read_costs())",
        no_cost_row is not None and no_cost_row.get("origin_country") is None,
        f"http_{status} row={no_cost_row}",
    )


# ---------------------------------------------------------------------------
# W — the 0009 verification's logistics finding, fixed by 0010 (D):
# has_role('logistics') no longer grants channel sell-price visibility —
# branch scope only, its original intent. Dynamic channel discovery, never
# a hardcoded id; skips cleanly if no channel with an eligible product
# exists yet.
# ---------------------------------------------------------------------------
def block_logistics_channel_scope(logistics_token):
    candidates = psql_rows(
        "select ch.id, p.id from tmsi.channels ch "
        "join tmsi.products p on ch.branch_id = any(p.sold_in) or ch.branch_id = p.primary_branch "
        "where ch.active limit 1;"
    )
    if not candidates:
        check("W: logistics channel scope", True, "SKIP — no active channel with an eligible product found")
        return
    channel_id, product_id = candidates[0]

    status, result = http(
        "POST", f"{REST}/rpc/compute_price", token=logistics_token,
        body={"p_product": product_id, "p_scope_type": "channel", "p_scope_id": channel_id},
    )
    rows = result if status == 200 and isinstance(result, list) else None
    check(
        "W: logistics no longer sees ANY channel's sell price (0010 D — branch scope only)",
        rows is not None and len(rows) == 0,
        f"http_{status} rows={len(rows) if rows is not None else '?'}",
    )


# ---------------------------------------------------------------------------
# X — migration 0012: interco margin/fee is now tmsi.products.interco_margin
# (an article field), not a lookup in tmsi.interco_fees by (supplier_branch,
# seller_branch) any more. Dynamic candidate (same shape as block U), single
# BEGIN/ROLLBACK as product_manager (RLS: tmsi.products_write_pm) — never
# touches tmsi.interco_fees itself, that table is inert history now, not
# what this checks.
# ---------------------------------------------------------------------------
def block_interco_margin(claims_uuid):
    candidates = psql_rows(
        "select p.id, p.primary_branch, b.id from tmsi.products p cross join tmsi.branches b "
        "where (b.id = any(p.sold_in) or b.id = p.primary_branch) and b.id <> p.primary_branch "
        "and p.item_type in ('equipment','spare_part') and p.status = 'active' limit 1;"
    )
    if not candidates:
        check("X: interco margin is an article property", True, "SKIP — no cross-branch active equipment/spare_part product found")
        return
    product_id, origin_branch_id, other_branch_id = candidates[0]

    current_rows = psql_rows(f"select interco_margin from tmsi.products where id = '{product_id}';")
    current_margin = Decimal(current_rows[0][0])
    new_margin = min(current_margin + Decimal("0.15"), Decimal("0.9"))

    sql = f"""
begin;
update tmsi.products set interco_margin = {new_margin} where id = '{product_id}';
select fee from tmsi.compute_price('{product_id}','branch','{other_branch_id}');
select fee from tmsi.compute_price('{product_id}','branch','{origin_branch_id}');
rollback;
"""
    rc, out, err = psql(sql, claims_uuid=claims_uuid)
    lines = [l for l in out.splitlines() if l != ""]
    if rc != 0 or len(lines) < 2:
        check("X: interco margin write + compute_price (transactional)", False, f"psql error: {err}")
        return
    other_fee, origin_fee = Decimal(lines[0]), Decimal(lines[1])
    check(
        "X: a non-origin branch's fee == the article's own interco_margin (not a per-branch-pair lookup)",
        other_fee == new_margin,
        f"interco_margin={new_margin} got_fee={other_fee}",
    )
    check(
        "X: the origin branch selling to itself is still always fee 0, regardless of interco_margin",
        origin_fee == 0,
        f"got_fee={origin_fee}",
    )

    # Confirm ROLLBACK really left no trace.
    confirm = psql_rows(f"select interco_margin from tmsi.products where id = '{product_id}';")
    check(
        "X: no residue after ROLLBACK — interco_margin back to its pre-test value",
        confirm and Decimal(confirm[0][0]) == current_margin,
        f"got={confirm[0][0] if confirm else None} expected={current_margin}",
    )


# ---------------------------------------------------------------------------
# Y — /branches admin screen (Fase 2): tmsi.branches/tmsi.channels have
# their own ref_write RLS (0001: admin-only), not the propose->approve
# workflow the pricing config tables use — creating one is a direct
# INSERT, same shape products/new/actions.ts already uses. No admin test
# account exists by design (TEST_USERS' own NOTE, "a tua conta pessoal
# nunca entra no smoke"), so only the negative side is provable here — a
# non-admin caller refused — same shape blocks R/T already use for their
# own admin-only paths. The positive admin-create path needs Pedro's own
# account, in the browser.
# ---------------------------------------------------------------------------
def block_branches_admin_only(token):
    status, _body = http(
        "POST", f"{REST}/branches", token=token,
        body={"id": "SMOKETST", "name": "smoke test branch", "country": "PT", "currency": "EUR", "zone": "EU"},
    )
    check(
        "Y: direct branches INSERT refused for a non-admin role (ref_write is admin-only)",
        status in (401, 403),
        f"http_{status}",
    )

    status, _body = http(
        "POST", f"{REST}/channels", token=token,
        body={"id": "SMOKETST", "name": "smoke test channel", "branch_id": "SA", "margin_delta": 0},
    )
    check(
        "Y: direct channels INSERT refused for a non-admin role (ref_write is admin-only)",
        status in (401, 403),
        f"http_{status}",
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
    block_proposal_workflow_exchange_rates(tokens["finance"], claims["finance"])
    block_proposal_workflow_overrides(tokens["finance"], claims["finance"], tokens["branch_manager"], claims["branch_manager"])
    block_proposal_workflow_channel(tokens["finance"], claims["finance"], tokens["branch_manager"], claims["branch_manager"])
    block_rounding(tokens["finance"])
    block_origin_country_boundary(tokens["finance"], tokens["logistics"])
    block_logistics_channel_scope(tokens["logistics"])
    block_interco_margin(claims["product_manager"])
    block_branches_admin_only(tokens["finance"])

    total = len(RESULTS)
    print(f"\n=== {total - FAILURES}/{total} passed ===")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
