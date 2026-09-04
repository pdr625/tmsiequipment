-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0003 — DB-level protection of tmsi.products' sensitive columns.
-- Approved by the Pedro 2026-09-04, validated empirically (BEGIN/ROLLBACK,
-- real test fixtures for sales/logistics/product_manager/agent roles)
-- before being written here — see docs/STATE.md for the full F1 trail.
--
-- Closes the residual gap the i4 app-level fix (E3-i4) documented: a
-- direct, manually-crafted API request as sales.sa could still read
-- tmsi.products.exw_price (and SAP codes, supplier_id) because RLS on
-- that table only ever gated ROWS, never columns — the app's own .select()
-- discipline was the only thing standing in the way. This migration moves
-- the boundary into the database itself.
--
-- Column list, exactly as instructed ("nunca inventada" — restriction 4
-- of the 0003 prompt): the complement of tmsi.v_selling_prices' own
-- column set (0001 §7) against the full tmsi.products column list (0001
-- §3), split into two named boundaries rather than one, because the
-- literal complement includes physical/logistics fields (hs_code,
-- weight, dimensions...) that the `logistics` role legitimately needs —
-- it already reads tmsi.transport_tiers/tmsi.customs_rates for exactly
-- this reason (0001 §8, config_read) — and is not itself `can_read_costs()`.
--   Safe (ungated, matches v_selling_prices exactly): id, name,
--     category_id, item_type, status, lead_time_days, unit.
--   Operational (tmsi.can_read_operational() — can_read_costs() OR
--     logistics): description, parent_id, origin_country, primary_branch,
--     hs_code, gross_weight_kg, net_weight_kg, volume_m3, dimensions,
--     palletizable, pallets, stackable, sold_in.
--   Financial (tmsi.can_read_costs() only): exw_price, currency,
--     supplier_id, sap_code_sa, sap_code_cn, sap_code_us, sap_code_uk,
--     last_reviewed_at, created_at, updated_at, created_by, updated_by
--     (audit/bookkeeping fields defaulted to the narrower boundary —
--     tmsi.audit_log's own audit_read policy, 0001 §8, already excludes
--     both logistics and product_manager from raw audit trail access;
--     kept these consistent with that rather than the wider operational set).
--
-- Design found by empirical testing in F1, NOT the naive candidate the
-- 0003 prompt itself suggested as a starting point — three things broke
-- it, each caught by BEGIN/ROLLBACK testing against real fixtures before
-- any of this was written for real:
--   1. `REVOKE SELECT (col) ... FROM authenticated` alone is a SILENT
--      NO-OP: column privileges in Postgres are additive on top of
--      table-level ones, and 0001 already ran `grant all on all tables
--      in schema tmsi to authenticated` — that table-level grant keeps
--      authorising every column regardless of a later column-level
--      revoke. The only way to actually restrict columns is to revoke
--      SELECT at the TABLE level first, then re-grant SELECT at the
--      COLUMN level for the safe subset only.
--   2. That alone blocks cost-visible roles (admin/product_manager/...)
--      from reading the protected columns too, since every authenticated
--      user is the SAME Postgres role via PostgREST regardless of their
--      tmsi.user_roles entry — hence the view below.
--   3. A naive view (default ownership, no security_invoker) turned out
--      to bypass RLS entirely: tmsi.products' owner and the connecting
--      admin role both have BYPASSRLS, so a definer-style view querying
--      `select * from tmsi.products` returned ALL rows to a test sales
--      session, not just their scoped subset (13 rows instead of 7,
--      confirmed live) — RLS on the underlying table does not apply when
--      the effective querying identity has BYPASSRLS. Forcing
--      security_invoker=true fixes that leak but then also inherits
--      COLUMN-level privilege checks from the querying role, breaking the
--      CASE-based masking below with a permission error instead of a
--      clean NULL. The working shape: keep default (definer) view
--      semantics for column access, but replicate the row-visibility
--      predicate EXPLICITLY in the view's own WHERE clause instead of
--      relying on inherited RLS — same functions the RLS policy itself
--      calls, not new logic.
--
-- Drift risk of that replicated predicate is closed, not just documented:
-- the row-visibility expression is factored into
-- tmsi.products_visible(), and BOTH tmsi.products' own products_read RLS
-- policy (altered below, not edited in 0001) and this migration's view
-- call that one function. A future change to who can read which products
-- only has one place to change.
--
-- Never edit 0001/0002 (already applied). This file is additive.

begin;

create or replace function tmsi.can_read_operational()
returns boolean language sql stable security definer set search_path = tmsi, pg_temp as $$
  select tmsi.can_read_costs() or tmsi.has_role('logistics');
$$;

-- Exact copy of products_read's own USING expression (0001 §8),
-- parameterised so it can be called from both the RLS policy and the
-- view below — single source of truth for "which products can this
-- caller see", never duplicated inline again.
create or replace function tmsi.products_visible(
  p_primary_branch text, p_sold_in text[], p_status tmsi.product_status
) returns boolean language sql stable security definer set search_path = tmsi, pg_temp as $$
  select tmsi.has_role('admin') or tmsi.has_role('product_manager') or tmsi.has_role('finance')
      or tmsi.has_role('logistics') or tmsi.has_role('viewer')
      or (tmsi.has_role('branch_manager') and (p_primary_branch = any(tmsi.my_branches()) or p_sold_in && tmsi.my_branches()))
      or (tmsi.has_role('sales') and p_status = 'active' and p_sold_in && tmsi.my_branches())
      or (tmsi.has_role('agent') and p_status = 'active'
          and p_sold_in && (select coalesce(array_agg(branch_id), '{}') from tmsi.channels where id = any(tmsi.my_channels())));
$$;

-- Retrofit, not a new rule: same predicate the policy already enforced,
-- now named. Legitimate ALTER on an already-applied policy via a new
-- migration — 0001 itself is untouched.
alter policy products_read on tmsi.products
  using (tmsi.products_visible(primary_branch, sold_in, status));

-- Same retrofit for the two existing policies that already duplicated
-- "can_read_costs() or logistics" inline (0001 §8, config_read on
-- transport_tiers/customs_rates) — now both call the named boundary too.
alter policy config_read on tmsi.transport_tiers using (tmsi.can_read_operational());
alter policy config_read on tmsi.customs_rates using (tmsi.can_read_operational());

-- The actual column-privilege change. Table-level SELECT revoked first
-- (see design note above — a column-level revoke alone would be a
-- no-op against 0001's table-level grant), then column-level SELECT
-- re-granted for exactly the safe set (== tmsi.v_selling_prices' own
-- column list). INSERT/UPDATE/DELETE untouched — write eligibility stays
-- entirely governed by tmsi.products_write_pm (RLS), unaffected by this;
-- confirmed live (F1) that plain INSERT/UPDATE with no RETURNING, and the
-- non-security-definer activation trigger's NEW.<col> access, both keep
-- working exactly as before.
revoke select on tmsi.products from authenticated;
grant select (id, name, category_id, item_type, status, lead_time_days, unit)
  on tmsi.products to authenticated;

-- The read path for anything beyond the safe set. Default view ownership
-- (security_invoker = false, explicit below) is required for the CASE
-- masking to work at all (see design note above); row visibility is
-- NOT inherited from RLS on the underlying table (which a BYPASSRLS
-- owner would bypass) but explicitly re-checked via
-- tmsi.products_visible() in the WHERE clause, using the same predicate
-- products_read enforces.
create view tmsi.v_products as
  select
    id, name, category_id, item_type, status, lead_time_days, unit,
    case when tmsi.can_read_operational() then description end as description,
    case when tmsi.can_read_operational() then parent_id end as parent_id,
    case when tmsi.can_read_operational() then origin_country end as origin_country,
    case when tmsi.can_read_operational() then primary_branch end as primary_branch,
    case when tmsi.can_read_operational() then hs_code end as hs_code,
    case when tmsi.can_read_operational() then gross_weight_kg end as gross_weight_kg,
    case when tmsi.can_read_operational() then net_weight_kg end as net_weight_kg,
    case when tmsi.can_read_operational() then volume_m3 end as volume_m3,
    case when tmsi.can_read_operational() then dimensions end as dimensions,
    case when tmsi.can_read_operational() then palletizable end as palletizable,
    case when tmsi.can_read_operational() then pallets end as pallets,
    case when tmsi.can_read_operational() then stackable end as stackable,
    case when tmsi.can_read_operational() then sold_in end as sold_in,
    case when tmsi.can_read_costs() then exw_price end as exw_price,
    case when tmsi.can_read_costs() then currency end as currency,
    case when tmsi.can_read_costs() then supplier_id end as supplier_id,
    case when tmsi.can_read_costs() then sap_code_sa end as sap_code_sa,
    case when tmsi.can_read_costs() then sap_code_cn end as sap_code_cn,
    case when tmsi.can_read_costs() then sap_code_us end as sap_code_us,
    case when tmsi.can_read_costs() then sap_code_uk end as sap_code_uk,
    case when tmsi.can_read_costs() then last_reviewed_at end as last_reviewed_at,
    case when tmsi.can_read_costs() then created_at end as created_at,
    case when tmsi.can_read_costs() then updated_at end as updated_at,
    case when tmsi.can_read_costs() then created_by end as created_by,
    case when tmsi.can_read_costs() then updated_by end as updated_by
  from tmsi.products
  where tmsi.products_visible(primary_branch, sold_in, status);

alter view tmsi.v_products set (security_invoker = false);
grant select on tmsi.v_products to authenticated, service_role;

commit;
