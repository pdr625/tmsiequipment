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

import base64
import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
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

# item 40 F1: decoupling the suite from the `.test` accounts having to be
# live/enabled in GoTrue. Default ("login") is byte-for-byte today's
# behaviour — a real password grant against GOTRUE for each TEST_USERS
# entry. "jwt" skips GoTrue's token endpoint entirely: it mints a
# locally-signed HS256 JWT for the same account's own uuid (already looked
# up from tmsi.profiles, see main()) using the project's real JWT_SECRET —
# the exact claims (sub/role/aud/exp) PostgREST already accepts from a
# GoTrue-issued token, just not obtained by asking GoTrue for one. Not a
# new identity and not an elevated one: the role grants tested are the
# same tmsi.user_roles rows the login path already relies on: only the
# mechanism to reach a bearer token changes. The secret is read straight
# out of the deploy .env already used to run the stack (chmod 600, never
# duplicated to a second file, never printed) — same portable-by-env
# pattern as CREDENTIALS_DIR (item 21).
VERIFY_MODE = os.environ.get("TMSI_VERIFY_MODE", "login")
JWT_SECRET_ENV_FILE = os.environ.get(
    "TMSI_JWT_SECRET_ENV_FILE", "/home/pedro/atelier-vps/tmsiequipment/deploy/supabase/.env"
)

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


def _load_jwt_secret(path):
    with open(path) as f:
        for line in f:
            if line.startswith("JWT_SECRET="):
                return line.strip().split("=", 1)[1]
    raise RuntimeError(f"JWT_SECRET= not found in {path}")


def _b64url(raw_bytes):
    return base64.urlsafe_b64encode(raw_bytes).rstrip(b"=").decode()


def mint_jwt(sub, secret, role="authenticated", ttl_seconds=3600):
    """A hand-rolled HS256 JWT — stdlib only (smoke.py's own rule, see the
    header comment), same three claims PostgREST/auth.uid() actually read
    (sub/role/aud + exp): see item 40 F1 comment above CREDENTIALS_DIR."""
    now = int(time.time())
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64url(
        json.dumps(
            {"sub": sub, "role": role, "aud": "authenticated", "iat": now, "exp": now + ttl_seconds},
            separators=(",", ":"),
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    signature = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64url(signature)}"


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


# item 42: the deepest proof ("a common-role user opens the page and reads
# the text") needs a real authenticated browser session — this suite hits
# PostgREST/GoTrue directly and has never replicated Next.js's own cookie
# session (tried and abandoned for the login flow itself, i9/i10) — stays
# the Pedro's browser step it always was. What IS provable without one:
# the route isn't accidentally public. A no-redirect opener so the 307
# itself is observed, not silently followed to a 200 on /login.
class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_no_redirect_opener = urllib.request.build_opener(_NoRedirect)


def block_privacy_notice():
    try:
        resp = _no_redirect_opener.open(f"{BASE}/privacy", timeout=15)
        status, location = resp.status, resp.headers.get("Location")
    except urllib.error.HTTPError as e:
        status, location = e.code, e.headers.get("Location")
    check(
        "privacy: /privacy without a session redirects to /login, never serves the page",
        status in (302, 307) and location == "/login",
        f"http_{status} location={location}",
    )


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

    # 0016: fx_rate() deixou de ser invocável por sessão de utilizador (é
    # interna — só o motor lhe chama, como dono). A propriedade que este bloco
    # prova é a mesma e continua observável, mas pelo caminho que a app usa de
    # facto: compute_price() devolve `fx_used`, e chama fx_rate() por dentro.
    # Sondar o motor pela superfície real é, se alguma coisa, mais forte do que
    # sondar a função interna.
    fx_pair = psql_rows(
        "select c.product_id, c.branch_id from tmsi.products p "
        "cross join lateral tmsi.compute_price(p.id, 'branch', p.primary_branch) c "
        f"where p.currency = '{currency}' and c.fx_used is not null limit 1;"
    )
    if not fx_pair:
        check("R: motor observável para a moeda escolhida", True, "SKIP — nenhum artigo com fx_used nessa moeda")
        return
    fx_product, fx_branch = fx_pair[0]

    def _fx_used():
        st, rows = http(
            "POST", f"{REST}/rpc/compute_price", token=token,
            body={"p_product": fx_product, "p_scope_type": "branch", "p_scope_id": fx_branch},
        )
        if st != 200 or not isinstance(rows, list) or not rows:
            return st, None
        return st, rows[0].get("fx_used")

    status, before_fx = _fx_used()
    check("R: o motor devolve fx_used antes de propor (compute_price, não fx_rate — 0016)",
          status == 200 and before_fx is not None, f"http_{status}")

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

    status, pending_fx = _fx_used()
    check(
        "R: a pending proposal is invisible to the engine — fx_used unchanged",
        status == 200 and pending_fx is not None and float(pending_fx) == float(before_fx),
        f"iguais={pending_fx == before_fx}",
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


# ---------------------------------------------------------------------------
# AA — batch decision (item 44): tmsi.decide_price_proposal_batch() is
# SECURITY DEFINER and classifies eligibility itself (same rule as
# tmsi.decide_price_proposal(), 0007, unchanged) — a proposal outside the
# caller's branch must be excluded, visibly, from the batch, never silently
# dropped and never failing the ones that WERE eligible. Uses the same
# active fixture product every other post-item-40 block needs (no active
# product survives in the seed catalog, item 40) — created once per run in
# main(), reused here rather than a second fixture.
# ---------------------------------------------------------------------------
def block_batch_decision(finance_token, finance_uuid, bm_token, bm_uuid):
    own_branches = {r[0] for r in psql_rows(f"select branch_id from tmsi.user_roles where user_id = '{bm_uuid}' and role = 'branch_manager' and branch_id is not null;")}
    if not own_branches:
        check("AA: batch decision", True, "SKIP — branch_manager.test has no branch_id role row")
        return
    own_branch = sorted(own_branches)[0]
    own_branches_sql = ",".join(f"'{b}'" for b in own_branches)
    other_candidates = psql_rows(f"select id from tmsi.branches where active and id not in ({own_branches_sql}) limit 1;")
    if not other_candidates:
        check("AA: batch decision", True, "SKIP — no other active branch found")
        return
    other_branch = other_candidates[0][0]

    def propose_override(branch_id, value, reason):
        status, created = http(
            "POST", f"{REST}/price_proposals", token=finance_token,
            body={
                "target_table": "price_overrides", "branch_id": branch_id,
                "payload": {
                    "product_id": SMOKE_FIXTURE_ID, "scope_type": "branch", "scope_id": branch_id,
                    "kind": "margin", "value": value, "reason": reason,
                    "valid_from": str(db_today()), "valid_to": None,
                },
                "reason": reason, "proposed_by": finance_uuid,
            },
            prefer="return=representation",
        )
        return created[0]["id"] if status == 201 and isinstance(created, list) and created else None

    # mixed eligibility: own-branch proposal + another branch's, in one batch
    own_id = propose_override(own_branch, 0.41, "smoke: batch own-branch")
    other_id = propose_override(other_branch, 0.41, "smoke: batch other-branch")
    check("AA: two proposals created for the batch", bool(own_id and other_id), f"own={own_id} other={other_id}")
    if not (own_id and other_id):
        for pid in (own_id, other_id):
            if pid:
                psql_rows(f"delete from tmsi.price_proposals where id = {pid};")
        return

    status, preview = http(
        "POST", f"{REST}/rpc/decide_price_proposal_batch", token=bm_token,
        body={"p_proposal_ids": [own_id, other_id], "p_decision": "approved", "p_reason": None, "p_dry_run": True},
    )
    ok = (
        status == 200 and isinstance(preview, dict) and preview.get("dry_run") is True
        and preview.get("eligible_count") == 1 and preview.get("excluded_count") == 1
        and isinstance(preview.get("changes"), list) and len(preview["changes"]) == 1
        and preview["changes"][0].get("after") == 0.41
    )
    check("AA: preview shows real before/after, not just a count", ok, f"http_{status} body={preview}")
    excluded_ok = (
        isinstance(preview, dict) and isinstance(preview.get("excluded"), list) and len(preview["excluded"]) == 1
        and preview["excluded"][0].get("id") == other_id
    )
    check("AA: the other branch's proposal is excluded, with a reason, not silently dropped", excluded_ok, f"excluded={preview.get('excluded') if isinstance(preview, dict) else preview}")

    audit_before = psql_rows("select count(*) from tmsi.audit_log where table_name='price_proposals' and action='UPDATE';")[0][0]
    status, commit = http(
        "POST", f"{REST}/rpc/decide_price_proposal_batch", token=bm_token,
        body={"p_proposal_ids": [own_id, other_id], "p_decision": "approved", "p_reason": None, "p_dry_run": False},
    )
    ok = status == 200 and isinstance(commit, dict) and commit.get("decided_count") == 1 and commit.get("excluded_count") == 1
    check("AA: commit decides only the eligible one", ok, f"http_{status} body={commit}")

    rows = psql_rows(f"select id, status, decision_batch_id is not null from tmsi.price_proposals where id in ({own_id},{other_id}) order by id;")
    statuses = {r[0]: (r[1], r[2]) for r in rows}
    check(
        "AA: ramo negado — the excluded proposal has no effect on the engine (still pending, no batch)",
        statuses.get(str(other_id)) == ("pending", "f"),
        f"other_id status={statuses.get(str(other_id))}",
    )
    check(
        "AA: the eligible proposal was decided and stamped with the batch",
        statuses.get(str(own_id)) == ("approved", "t"),
        f"own_id status={statuses.get(str(own_id))}",
    )
    audit_after = psql_rows("select count(*) from tmsi.audit_log where table_name='price_proposals' and action='UPDATE';")[0][0]
    check(
        "AA: audit_log granularity — exactly one UPDATE entry for the one decided proposal, not zero, not two",
        int(audit_after) - int(audit_before) == 1,
        f"before={audit_before} after={audit_after}",
    )

    status, engine = http("POST", f"{REST}/rpc/compute_price", token=finance_token, body={"p_product": SMOKE_FIXTURE_ID, "p_scope_type": "branch", "p_scope_id": own_branch})
    engine_row = engine[0] if status == 200 and isinstance(engine, list) and engine else None
    check(
        "AA: motor-vivo — the engine reflects the approved value immediately",
        engine_row is not None and float(engine_row["margin"]) == 0.41,
        f"http_{status} margin={engine_row.get('margin') if engine_row else None}",
    )

    # atomicity: a doomed proposal (nonexistent product_id) alongside a
    # valid one, same batch — both must fail together, nothing residual.
    def propose_doomed(branch_id):
        status, created = http(
            "POST", f"{REST}/price_proposals", token=finance_token,
            body={
                "target_table": "price_overrides", "branch_id": branch_id,
                "payload": {
                    "product_id": "T-0000", "scope_type": "branch", "scope_id": branch_id,
                    "kind": "margin", "value": 0.5, "reason": "smoke: batch doomed",
                    "valid_from": str(db_today()), "valid_to": None,
                },
                "reason": "smoke: batch doomed", "proposed_by": finance_uuid,
            },
            prefer="return=representation",
        )
        return created[0]["id"] if status == 201 and isinstance(created, list) and created else None

    valid_id = propose_override(own_branch, 0.42, "smoke: batch atomic-valid")
    doomed_id = propose_doomed(own_branch)
    overrides_before = psql_rows("select count(*) from tmsi.price_overrides;")[0][0]
    batches_before = psql_rows("select count(*) from tmsi.decision_batches;")[0][0]
    status, failed = http(
        "POST", f"{REST}/rpc/decide_price_proposal_batch", token=bm_token,
        body={"p_proposal_ids": [valid_id, doomed_id], "p_decision": "approved", "p_reason": None, "p_dry_run": False},
    )
    check("AA: atomicidade — the doomed proposal makes the whole commit fail", status >= 400, f"http_{status} body={failed}")
    overrides_after = psql_rows("select count(*) from tmsi.price_overrides;")[0][0]
    batches_after = psql_rows("select count(*) from tmsi.decision_batches;")[0][0]
    check(
        "AA: atomicidade — the valid proposal's write was rolled back too, zero residue",
        overrides_before == overrides_after and batches_before == batches_after,
        f"overrides {overrides_before}->{overrides_after} batches {batches_before}->{batches_after}",
    )
    still_pending = psql_rows(f"select status from tmsi.price_proposals where id in ({valid_id},{doomed_id});")
    check("AA: both proposals from the failed batch are still pending", all(r[0] == "pending" for r in still_pending), f"{still_pending}")
    psql_rows(f"delete from tmsi.price_proposals where id in ({valid_id},{doomed_id});")

    # rejection: refused without a reason, succeeds with one, engine untouched
    reject_id = propose_override(own_branch, 0.60, "smoke: batch reject")
    status, no_reason = http(
        "POST", f"{REST}/rpc/decide_price_proposal_batch", token=bm_token,
        body={"p_proposal_ids": [reject_id], "p_decision": "rejected", "p_reason": None, "p_dry_run": False},
    )
    check("AA: batch rejection without a reason is refused", status >= 400, f"http_{status}")
    status, rejected = http(
        "POST", f"{REST}/rpc/decide_price_proposal_batch", token=bm_token,
        body={"p_proposal_ids": [reject_id], "p_decision": "rejected", "p_reason": "smoke: batch reject reason", "p_dry_run": False},
    )
    check("AA: batch rejection with a reason succeeds", status == 200 and isinstance(rejected, dict) and rejected.get("decided_count") == 1, f"http_{status} body={rejected}")
    status, engine_after_reject = http("POST", f"{REST}/rpc/compute_price", token=finance_token, body={"p_product": SMOKE_FIXTURE_ID, "p_scope_type": "branch", "p_scope_id": own_branch})
    engine_row2 = engine_after_reject[0] if status == 200 and isinstance(engine_after_reject, list) and engine_after_reject else None
    check(
        "AA: a rejected batch never reaches the engine",
        engine_row2 is not None and float(engine_row2["margin"]) != 0.60,
        f"margin={engine_row2.get('margin') if engine_row2 else None}",
    )

    # no residue: revert the fixture's approved override + the batches this
    # block created — child rows (price_proposals, which reference
    # decision_batches by FK) deleted before the parent batch rows, never
    # the other way round.
    psql_rows(f"delete from tmsi.price_overrides where product_id = '{SMOKE_FIXTURE_ID}' and scope_id = '{own_branch}' and kind = 'margin';")
    batch_ids = psql_rows(f"select decision_batch_id from tmsi.price_proposals where id in ({own_id},{reject_id}) and decision_batch_id is not null;")
    psql_rows(f"delete from tmsi.price_proposals where id in ({own_id},{other_id},{reject_id});")
    for (bid,) in batch_ids:
        psql_rows(f"delete from tmsi.decision_batches where id = '{bid}';")
    remaining = psql_rows(f"select count(*) from tmsi.price_proposals where reason like 'smoke: batch%';")[0][0]
    check("AA: no residue — all smoke batch proposals cleaned up", remaining == "0", f"remaining={remaining}")


# ---------------------------------------------------------------------------
# Z — bulk import (item 39): tmsi.run_import_hs_duty()/run_import_products()
# are SECURITY DEFINER RPCs, not RLS policies — a non-admin/non-product_manager
# role has to be refused by the function's own has_role() check, the same
# thing block Y already proves for the two ref_write tables. No admin test
# account exists by design, so only the negative side of run_import_hs_duty
# is provable here; run_import_products accepts product_manager too, so its
# positive path is provable — in DRY-RUN only (never writes, confirmed by a
# fresh count before/after, same discipline as block P/X's BEGIN/ROLLBACK
# checks, just at the HTTP layer since a dry-run genuinely writes nothing to
# roll back). The broken-file branch (restriction 3 of item 39: reject the
# whole file, never a partial write) is exercised the same way — an invalid
# margin, real product count unchanged after.
# ---------------------------------------------------------------------------
def block_audit_content_boundary(cost_no_admin_token, cost_no_admin_uuid):
    """BB — migration 0014: audit_log content boundary.

    The bug this block exists to catch is specific and already happened once:
    0014's first version revoked old_row/new_row at the COLUMN level, which is
    a silent no-op against 0001's table-level grant (column privileges are
    additive, never restrictive — the same class 0003 had already documented).
    It applied with no error and changed nothing; only asking the API for the
    column caught it. So assertion 1 is that request, and it has to be REFUSED
    — a 200 there means the boundary is back to being decorative.

    Assertion 4 is the positive control that makes assertion 3 mean something:
    the view masks profiles rows only. If it ever started returning NULL for
    every table, assertion 3 would still pass while the audit trail had gone
    blind — 4 fails in that case."""
    safe_cols = "id,at,actor,table_name,row_pk,action"

    status, _ = http("GET", f"{REST}/audit_log?select=old_row,new_row&limit=1", token=cost_no_admin_token)
    check(
        "BB: raw audit_log content columns refused to a non-admin cost role (0014 REVOKE is real, not a no-op)",
        status >= 400,
        f"http_{status}",
    )

    status, rows = http("GET", f"{REST}/audit_log?select={safe_cols}&limit=1", token=cost_no_admin_token)
    check(
        "BB: the six safe columns stay readable on the raw table (0014 re-grant)",
        status == 200 and isinstance(rows, list),
        f"http_{status}",
    )

    status, rows = http(
        "GET", f"{REST}/v_audit_log?select=old_row,new_row&table_name=eq.profiles&limit=50",
        token=cost_no_admin_token,
    )
    masked = isinstance(rows, list) and len(rows) > 0 and all(
        r.get("old_row") is None and r.get("new_row") is None for r in rows
    )
    check(
        "BB: v_audit_log masks profiles content for a non-admin (name/email of a colleague)",
        status == 200 and masked,
        f"http_{status} rows={len(rows) if isinstance(rows, list) else '?'}",
    )

    status, rows = http(
        "GET", f"{REST}/v_audit_log?select=old_row,new_row&table_name=eq.products&or=(old_row.not.is.null,new_row.not.is.null)&limit=5",
        token=cost_no_admin_token,
    )
    unmasked = isinstance(rows, list) and len(rows) > 0 and any(
        r.get("old_row") is not None or r.get("new_row") is not None for r in rows
    )
    check(
        "BB: the mask is scoped to profiles — products audit content still visible (positive control)",
        status == 200 and unmasked,
        f"http_{status} rows={len(rows) if isinstance(rows, list) else '?'}",
    )

    counts = psql_rows(
        "select (select count(*) from tmsi.audit_log), (select count(*) from tmsi.v_audit_log);",
        claims_uuid=cost_no_admin_uuid,
    )
    raw_n, view_n = counts[0]
    check(
        "BB: v_audit_log and the raw table agree on which rows exist (the view narrows content, never rows)",
        raw_n == view_n,
        f"raw={raw_n} view={view_n}",
    )

    # The other half of the mask, and what turns assertion 3 into a real
    # differential: admin DOES see profiles content. There is no admin `.test`
    # account and this suite never touches the Pedro's personal one, so the
    # role is granted inside a transaction that is rolled back — the same
    # device block CC uses for `viewer`, and for the same reason.
    rows = psql_rows(
        "begin;\n"
        "insert into tmsi.user_roles (user_id, role) select user_id, 'admin' "
        f"from tmsi.profiles where email = '{TEST_USERS['finance'][0]}';\n"
        "do $$ begin perform set_config('request.jwt.claims', "
        f"'{{\"sub\":\"{cost_no_admin_uuid}\",\"role\":\"authenticated\"}}', false); end $$;\n"
        "set role authenticated;\n"
        "select count(*) filter (where old_row is not null or new_row is not null) "
        "from tmsi.v_audit_log where table_name = 'profiles';\n"
        "reset role;\n"
        "rollback;"
    )
    check(
        "BB: with admin, the same rows come back unmasked (so assertion 3 measures the mask, not an empty table)",
        int(rows[0][0]) > 0,
        f"linhas_com_conteudo={rows[0][0]}",
    )


# ---------------------------------------------------------------------------
# CC — the three roles the suite never had a session for (sales, agent,
# viewer). Deliberately at the DB layer via claims injection, not HTTP: these
# roles have no password file (sales/agent) or no account at all (viewer), and
# the CLAUDE.md rule for RLS/data proofs is claims injection anyway. That also
# makes the block behave identically in all three verify modes.
#
# Nothing is `active` in this database (the real catalog is loaded but still
# draft), so asserting "sales sees no cost" against an empty result set would
# prove nothing. The block therefore activates ONE fictitious product inside
# the transaction it rolls back — never a real one, and never committed.
# ---------------------------------------------------------------------------
_ACTIVATABLE = (
    "p.id not like 'T-1%' and p.hs_code is not null and p.gross_weight_kg is not null "
    "and p.unit is not null and ("
    "(p.primary_branch='SA' and p.sap_code_sa is not null) or "
    "(p.primary_branch='TBM' and p.sap_code_cn is not null) or "
    "(p.primary_branch='CORP' and p.sap_code_us is not null) or "
    "(p.primary_branch='LTD' and p.sap_code_uk is not null))"
)


def _sell_side_block(label, role, claims_uuid, reachable_branches_sql):
    """One sell-side role (sales or agent): sees an active product, sees no
    cost on it, and sees nothing that is not active."""
    rows = psql_rows(
        "begin;\n"
        "update tmsi.products set status='active' where id in ("
        f"  select p.id from tmsi.products p where {_ACTIVATABLE}"
        f"  and p.sold_in && ({reachable_branches_sql}) limit 1);\n"
        "do $$ begin perform set_config('request.jwt.claims', "
        f"'{{\"sub\":\"{claims_uuid}\",\"role\":\"authenticated\"}}', false); end $$;\n"
        "set role authenticated;\n"
        "select count(*), count(exw_price), count(*) filter (where status <> 'active') "
        "from tmsi.v_products;\n"
        "reset role;\n"
        "rollback;"
    )
    visible, with_cost, non_active = (int(x) for x in rows[0])
    check(
        f"CC: {role} sees the activated article but no cost column on it",
        visible >= 1 and with_cost == 0,
        f"{label} visible={visible} com_custo={with_cost}",
    )
    check(
        f"CC: {role} sees nothing that is not active",
        non_active == 0,
        f"{label} nao_active={non_active}",
    )


def block_sell_side_roles(sales_uuid, agent_uuid, logistics_uuid, logistics_email):
    _sell_side_block(
        "sales", "sales", sales_uuid,
        "select coalesce(array_agg(branch_id), '{}') from tmsi.user_roles where role='sales'",
    )
    _sell_side_block(
        "agent", "agent", agent_uuid,
        "select coalesce(array_agg(c.branch_id), '{}') from tmsi.channels c "
        "join tmsi.user_roles ur on ur.channel_id = c.id where ur.role='agent'",
    )

    # viewer: no account exists, so the role is granted inside the rolled-back
    # transaction, to an account that has no cost access of its own. Measuring
    # the same query before and after the grant is what makes this a proof
    # about `viewer` and not about whoever it was granted to.
    rows = psql_rows(
        "begin;\n"
        "do $$ begin perform set_config('request.jwt.claims', "
        f"'{{\"sub\":\"{logistics_uuid}\",\"role\":\"authenticated\"}}', false); end $$;\n"
        "set role authenticated;\n"
        "select 'antes', count(exw_price) from tmsi.v_products;\n"
        "reset role;\n"
        "insert into tmsi.user_roles (user_id, role) select user_id, 'viewer' "
        f"from tmsi.profiles where email = '{logistics_email}';\n"
        "set role authenticated;\n"
        "select 'depois', count(exw_price) from tmsi.v_products;\n"
        "do $$ begin\n"
        "  insert into tmsi.price_proposals (target_table, branch_id, payload, reason, proposed_by)\n"
        "  values ('exchange_rates', null, '{}'::jsonb, 'smoke viewer write attempt', auth.uid());\n"
        "  perform set_config('smoke.viewer_write', 'allowed', true);\n"
        "exception\n"
        "  when insufficient_privilege then perform set_config('smoke.viewer_write', 'refused', true);\n"
        "  when others then perform set_config('smoke.viewer_write', 'erro:'||SQLSTATE, true);\n"
        "end $$;\n"
        "select 'escrita', current_setting('smoke.viewer_write', true);\n"
        "reset role;\n"
        "rollback;"
    )
    measured = {r[0]: r[1] for r in rows}
    check(
        "CC: without viewer, that account reads no cost at all (baseline)",
        int(measured["antes"]) == 0,
        f"com_custo={measured['antes']}",
    )
    check(
        "CC: granting viewer alone turns cost reads on",
        int(measured["depois"]) > 0,
        f"com_custo={measured['depois']}",
    )
    check(
        "CC: viewer reads costs but cannot propose (RLS refuses, not a constraint)",
        measured["escrita"] == "refused",
        f"resultado={measured['escrita']}",
    )


# ---------------------------------------------------------------------------
# DD — `anon` como 9.ª identidade permanente (item 64, decisão do Pedro
# 2026-09-20). Até aqui a suite tinha 8 identidades, todas autenticadas, e foi
# exactamente por isso que a fuga passou: compute_price() devolvia o breakdown
# de custo inteiro a quem não apresentava credencial nenhuma, porque as suas
# guardas começam por `auth.uid() is not null` e tratam "sem sessão" como "de
# confiança". A 0016 fechou o acesso; este bloco existe para isso não voltar
# por outro caminho.
#
# Lista branca medida, não inventada: sem sessão, `anon` alcança
# v_current_branding (a página de login e os templates de email precisam dela)
# e mais nada — `settings` responde mas sem uma única linha, porque a política
# é TO authenticated. Tudo o resto recusa.
# ---------------------------------------------------------------------------
ANON_PODE_LER = {"v_current_branding"}
ANON_VAZIO = {"settings"}
ANON_RECUSADO = ["v_products", "v_branch_prices", "v_selling_prices", "v_audit_log",
                 "products", "price_overrides", "price_proposals", "audit_log",
                 "profiles", "user_roles", "margin_grids", "exchange_rates"]
FUNCOES_INTERNAS = [
    ("branch_margin", {"p_branch": "SA", "p_cost_eur": 1000}),
    ("override_value", {"p_product": "T-0001", "p_scope_type": "branch",
                        "p_scope_id": "SA", "p_kind": "margin"}),
    ("fx_rate", {"p_currency": "CNY"}),
]


def block_anon_boundary(no_cost_token):
    # 1. O caso que originou o item 64: sem credencial, nada de motor.
    status, _ = http("POST", f"{REST}/rpc/compute_price", token=None,
                     body={"p_product": "T-0001", "p_scope_type": "branch", "p_scope_id": "SA"})
    check("DD: compute_price recusado sem credencial (item 64 — dava o breakdown inteiro)",
          status in (401, 403), f"http_{status}")

    # 2. As três funções internas da 0016, pelos dois lados da fronteira.
    for fn, body in FUNCOES_INTERNAS:
        status, _ = http("POST", f"{REST}/rpc/{fn}", token=None, body=body)
        check(f"DD: {fn} recusado sem credencial", status in (401, 403), f"http_{status}")
        status, _ = http("POST", f"{REST}/rpc/{fn}", token=no_cost_token, body=body)
        check(f"DD: {fn} recusado a um papel sem custos (item 59)", status in (401, 403), f"http_{status}")

    # 3. A lista branca, pelos dois lados: o que pode, e que o resto não pode.
    for obj in sorted(ANON_PODE_LER):
        status, rows = http("GET", f"{REST}/{obj}?select=*&limit=1", token=None)
        check(f"DD: anon lê {obj} (a página de login precisa)",
              status == 200 and isinstance(rows, list) and len(rows) > 0, f"http_{status}")

    for obj in sorted(ANON_VAZIO):
        status, rows = http("GET", f"{REST}/{obj}?select=*", token=None)
        check(f"DD: anon vê {obj} sem uma única linha",
              status == 200 and isinstance(rows, list) and len(rows) == 0,
              f"http_{status} linhas={len(rows) if isinstance(rows, list) else '?'}")

    # item 65: o default-deny da 0016 não vale para funções criadas pelo
    # supabase_admin — o ALTER DEFAULT PRIVILEGES dele não suprime o PUBLIC, e
    # a primeira função a estrear esse caminho (is_trusted_db_session, 0017)
    # nasceu aberta. Esta asserção é o que torna a regra verificável em vez de
    # lembrada: qualquer função de tmsi que volte a ter PUBLIC parte o smoke.
    com_public = psql_rows(
        "select coalesce(string_agg(p.proname, ', ' order by p.proname), '') "
        "from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
        "where n.nspname = 'tmsi' "
        "  and (p.proacl is null or array_to_string(p.proacl, ' ') like '=X/%');"
    )
    abertas = com_public[0][0] if com_public and com_public[0] else ""
    check("DD: nenhuma função de tmsi tem EXECUTE a PUBLIC (item 65)",
          abertas == "", f"abertas={abertas or 'nenhuma'}")

    recusados = []
    for obj in ANON_RECUSADO:
        status, _ = http("GET", f"{REST}/{obj}?select=*&limit=1", token=None)
        if status < 400:
            recusados.append(f"{obj}:http_{status}")
    check("DD: todo o resto recusa a quem não tem sessão",
          not recusados, f"abertos={recusados or 'nenhum'}")


def block_bulk_import(logistics_token, pm_token):
    status, _body = http(
        "POST", f"{REST}/rpc/run_import_hs_duty", token=logistics_token,
        body={"p_rows": [{"hs_code": "1234567890", "description": "x", "rate": 0.01}],
              "p_dry_run": True, "p_filename": "x.csv", "p_reason": "smoke"},
    )
    check(
        "Z: run_import_hs_duty refused for a non-admin role",
        status in (400, 403),
        f"http_{status}",
    )

    status, body = http(
        "POST", f"{REST}/rpc/run_import_products", token=logistics_token,
        body={"p_rows": [{"product_id": "T-9699", "article": "x", "item_type": "equipment",
                          "purchase_currency": "EUR", "exw_price": "1", "primary_subsidiary": "Condat SA",
                          "scope_type": "branch", "scope_code": "SA"}],
              "p_dry_run": True, "p_filename": "x.csv", "p_reason": "smoke"},
    )
    check(
        "Z: run_import_products refused for a role with neither admin nor product_manager",
        status in (400, 403),
        f"http_{status}",
    )

    before = psql_rows("select count(*) from tmsi.products where id = 'T-9699';")[0][0]
    status, body = http(
        "POST", f"{REST}/rpc/run_import_products", token=pm_token,
        body={"p_rows": [{"product_id": "T-9699", "article": "smoke test article", "item_type": "equipment",
                          "purchase_currency": "EUR", "exw_price": "1", "primary_subsidiary": "Condat SA",
                          "scope_type": "branch", "scope_code": "SA"}],
              "p_dry_run": True, "p_filename": "smoke.csv", "p_reason": "smoke"},
    )
    ok = status == 200 and isinstance(body, dict) and body.get("ok") is True and body.get("dry_run") is True
    check("Z: product_manager can preview a products import (dry-run)", ok, f"http_{status} body={body}")
    after = psql_rows("select count(*) from tmsi.products where id = 'T-9699';")[0][0]
    check("Z: dry-run wrote nothing — product count unchanged", before == after == "0", f"before={before} after={after}")

    status, body = http(
        "POST", f"{REST}/rpc/run_import_products", token=pm_token,
        body={"p_rows": [{"product_id": "T-9699", "article": "smoke test article", "item_type": "equipment",
                          "purchase_currency": "EUR", "exw_price": "1", "primary_subsidiary": "Condat SA",
                          "scope_type": "branch", "scope_code": "SA", "in_margin": "1.5"}],
              "p_dry_run": True, "p_filename": "smoke-broken.csv", "p_reason": "smoke"},
    )
    ok = (
        status == 200
        and isinstance(body, dict)
        and body.get("ok") is False
        and isinstance(body.get("errors"), list)
        and len(body["errors"]) == 1
        and body["errors"][0].get("column") == "in_margin"
    )
    check("Z: an out-of-range value is rejected with row/column/reason, whole file", ok, f"http_{status} body={body}")


# item 40 F1 (coverage half): blocks P/S/U/X each dynamically discover *an
# active product* to exercise a business rule that only fires on one (EXW->
# review, the propose->approve effect, rounding, interco margin) — by
# design, restriction 2 of the original smoke prompt: never a hardcoded
# literal. Item 40 F3 retired every real product row to inactive/
# discontinued (the whole catalog today is fictitious seed/test residue,
# see docs/STATE.md), so that discovery came up empty and those 4 blocks
# started silently SKIPping instead of actually testing anything — the
# same class of hidden-coupling problem F1 fixed for the `.test` accounts'
# login, just on catalog state instead. Fixed the same way: give them
# something real to discover instead of hoping the catalog happens to have
# one. Superuser insert/delete (bypasses RLS — same pattern block S/T's own
# proposal cleanup already uses), one row, cross-branch (SA + CORP) so
# blocks U/X's own "not the primary branch" requirement is met too, never
# left behind — confirmed by count at the end of main().
SMOKE_FIXTURE_ID = "T-9698"


def create_smoke_fixture_product():
    psql_rows(
        f"""
        insert into tmsi.products
          (id, name, item_type, currency, exw_price, primary_branch, hs_code,
           gross_weight_kg, unit, sap_code_sa, status, sold_in)
        values
          ('{SMOKE_FIXTURE_ID}', 'smoke fixture -- active equipment (test, item 40)', 'equipment',
           'EUR', 1000, 'SA', '842430', 10, 'PCS', 'SMOKE-{SMOKE_FIXTURE_ID}', 'active', '{{SA,CORP}}');
        """
    )


def delete_smoke_fixture_product():
    psql_rows(f"delete from tmsi.products where id = '{SMOKE_FIXTURE_ID}';")
    remaining = psql_rows(f"select count(*) from tmsi.products where id = '{SMOKE_FIXTURE_ID}';")
    check(
        "smoke fixture product cleaned up — no residue",
        remaining and remaining[0][0] == "0",
        f"remaining={remaining[0][0] if remaining else '?'}",
    )


def main():
    print(f"=== TMSI smoke — {BASE} — {date.today().isoformat()} ===")
    block_health()
    block_privacy_notice()

    # UUIDs looked up from TEST_USERS' own emails, not hardcoded alongside
    # them — a test account recreated with a new id would otherwise go
    # silently stale here while TEST_USERS still "worked" (it logs in via
    # email, the claims dict wouldn't notice a mismatch on its own). Needed
    # before tokens now (item 40 F1): jwt mode mints from this uuid instead
    # of asking GoTrue for one.
    claims = {}
    for role, (email, _path) in TEST_USERS.items():
        rows = psql_rows(f"select user_id from tmsi.profiles where email = '{email}';")
        if not rows:
            raise RuntimeError(f"no tmsi.profiles row for {email} — smoke fixture missing")
        claims[role] = rows[0][0]

    tokens = {}
    if VERIFY_MODE == "jwt":
        secret = _load_jwt_secret(JWT_SECRET_ENV_FILE)
        for role in TEST_USERS:
            tokens[role] = mint_jwt(claims[role], secret)
    elif VERIFY_MODE == "login":
        for role, (email, path) in TEST_USERS.items():
            tokens[role] = login(email, path)
    else:
        raise RuntimeError(f"unknown TMSI_VERIFY_MODE: {VERIFY_MODE!r} (expected login|jwt)")

    create_smoke_fixture_product()

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
    block_batch_decision(tokens["finance"], claims["finance"], tokens["branch_manager"], claims["branch_manager"])
    block_bulk_import(tokens["logistics"], tokens["product_manager"])
    block_audit_content_boundary(tokens["finance"], claims["finance"])
    block_anon_boundary(tokens["logistics"])

    # item 56: the three roles with no session of their own. Looked up by the
    # role they hold rather than by a hardcoded address — an account renamed
    # or recreated must not make this silently skip. sales/agent have accounts
    # but no password file (so: claims injection, never a token); viewer has
    # no account at all and is granted inside the rolled-back transaction.
    sell_side = {}
    for role in ("sales", "agent"):
        found = psql_rows(
            "select p.user_id from tmsi.profiles p join tmsi.user_roles r on r.user_id = p.user_id "
            f"where r.role = '{role}' limit 1;"
        )
        sell_side[role] = found[0][0] if found else None
    if sell_side["sales"] and sell_side["agent"]:
        block_sell_side_roles(
            sell_side["sales"], sell_side["agent"],
            claims["logistics"], TEST_USERS["logistics"][0],
        )
    else:
        check("CC: sell-side roles", True, "SKIP — no sales/agent account found in tmsi.user_roles")

    delete_smoke_fixture_product()

    total = len(RESULTS)
    print(f"\n=== {total - FAILURES}/{total} passed ===")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
