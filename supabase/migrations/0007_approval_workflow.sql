-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0007 — E4, the approval workflow. L2 decision of the Pedro,
-- 2026-09-06: modifications to published prices are validated by the
-- Branch Manager of the affected branch OR an admin — one approver is
-- enough; "who edits doesn't approve" does NOT apply (admin may approve
-- their own change — a conscious pilot-phase decision, revisited once
-- there are more real users; docs/BACKLOG.md item 9, docs/STATE.md).
--
-- Scope, validated against the real schema before writing any of this
-- (two real discrepancies found and resolved with the Pedro before this
-- file existed — both in docs/STATE.md in full):
--
-- 1. "BM of the affected branch" only has a clean, single, schema-backed
--    meaning for tmsi.transport_tiers, tmsi.margin_grids and
--    tmsi.price_overrides — each has exactly one branch_id column.
--    tmsi.exchange_rates (only `currency`), tmsi.customs_rates (only
--    `zone`) and tmsi.interco_fees (TWO branches, supplier+seller, and
--    branch_manager never had write access to it in the first place) have
--    no single-branch identity to hang BM eligibility on. Decision:
--    these three are admin-only for approval (proposal *creation* keeps
--    exactly the roles that could already write each table directly —
--    unchanged). Deriving "the branch" from currency/zone was considered
--    and rejected: every currency/zone maps to exactly one branch in
--    today's seed data, but that is data, not a schema guarantee — a
--    future second branch on the same currency would silently change who
--    can approve, with nothing in the code flagging the day it happened.
--
-- 2. "Materialise as a new row, never UPDATE a value in effect" (the
--    0005 pattern) only has somewhere to materialise a *new* row on
--    tmsi.exchange_rates and tmsi.price_overrides — both already carry
--    effective-dating (effective_date/created_at, valid_from/valid_to).
--    tmsi.interco_fees, tmsi.transport_tiers, tmsi.customs_rates and
--    tmsi.margin_grids have NO historical mechanism at all: their primary
--    key IS the config's own identity (e.g. (branch_id, tier) on
--    margin_grids) — inserting a "new version" of an existing key would
--    violate that key outright. Decision, the Pedro's, after the
--    trade-off was laid out explicitly: redesign these four tables to
--    carry the same effective_date/created_at versioning
--    tmsi.exchange_rates already has (0005), and have
--    tmsi.compute_price()/tmsi.branch_margin() pick "the latest
--    applicable" from each, exactly the way tmsi.fx_rate() already does.
--    This changes compute_price()'s INTERNAL lookups only — its
--    signature (p_product, p_branch, p_date) and output columns are
--    untouched, so this does not touch the stop condition about changing
--    compute_price()'s contract.
--
-- Product lifecycle is explicitly OUT of scope — draft status and the
-- 0001 activation trigger already gate it; adding this workflow on top
-- would duplicate control without a decision asking for it.
--
-- Never edit 0001-0006 (already applied). This file is additive.

begin;

-- ---------------------------------------------------------------------------
-- 1. Give interco_fees/transport_tiers/customs_rates/margin_grids the same
--    effective-dating tmsi.exchange_rates already has (0005) — surrogate id
--    primary key (the old key can no longer be unique, multiple historical
--    rows per identity are now legitimate), effective_date + created_at
--    (clock_timestamp() default, NOT now() — 0005 already found and
--    documented why now() is transaction-frozen and unsuitable for a
--    same-transaction tie-break), and a lookup index shaped like 0005's own.
--    Existing rows are backfilled to effective_date = current_date (the
--    date this migration runs) — they are not a fabricated history, they
--    are simply "in effect as of today", which is the honest description
--    of values that were never dated before now.
-- ---------------------------------------------------------------------------

alter table tmsi.interco_fees drop constraint interco_fees_pkey;
alter table tmsi.interco_fees
  add column id bigint generated always as identity,
  add column effective_date date not null default current_date,
  add column created_at timestamptz not null default clock_timestamp(),
  add column created_by uuid;
alter table tmsi.interco_fees add primary key (id);
create index interco_fees_lookup_idx on tmsi.interco_fees
  (supplier_branch, seller_branch, effective_date desc, created_at desc);

alter table tmsi.transport_tiers drop constraint transport_tiers_pkey;
alter table tmsi.transport_tiers
  add column id bigint generated always as identity,
  add column effective_date date not null default current_date,
  add column created_at timestamptz not null default clock_timestamp(),
  add column created_by uuid;
alter table tmsi.transport_tiers add primary key (id);
create index transport_tiers_lookup_idx on tmsi.transport_tiers
  (branch_id, tier, effective_date desc, created_at desc);

alter table tmsi.customs_rates drop constraint customs_rates_pkey;
alter table tmsi.customs_rates
  add column id bigint generated always as identity,
  add column effective_date date not null default current_date,
  add column created_at timestamptz not null default clock_timestamp(),
  add column created_by uuid;
alter table tmsi.customs_rates add primary key (id);
create index customs_rates_lookup_idx on tmsi.customs_rates
  (hs_code, zone, effective_date desc, created_at desc);

alter table tmsi.margin_grids drop constraint margin_grids_pkey;
alter table tmsi.margin_grids
  add column id bigint generated always as identity,
  add column effective_date date not null default current_date,
  add column created_at timestamptz not null default clock_timestamp(),
  add column created_by uuid;
alter table tmsi.margin_grids add primary key (id);
create index margin_grids_lookup_idx on tmsi.margin_grids
  (branch_id, tier, effective_date desc, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. tmsi.branch_margin() gains p_date (mirrors tmsi.fx_rate()'s own
--    signature) and picks the latest-effective row PER TIER before
--    applying the existing "smallest tier whose max_cost_eur still covers
--    the cost" selection — the DISTINCT ON is required precisely because
--    "latest per identity" and "smallest applicable tier" are two
--    different selections layered on top of each other; picking one
--    latest row across ALL tiers would silently pick the wrong tier
--    whenever tiers were edited on different days. CREATE OR REPLACE
--    cannot change a function's parameter list — the old 2-arg version is
--    dropped explicitly first, and its REVOKE (0001 §8) re-issued against
--    the new signature so the access boundary doesn't silently widen.
-- ---------------------------------------------------------------------------

drop function tmsi.branch_margin(text, numeric);

create or replace function tmsi.branch_margin(p_branch text, p_cost_eur numeric, p_date date default current_date)
returns numeric language sql stable security definer set search_path = tmsi, public as $$
  select latest.margin from (
    select distinct on (mg.tier) mg.tier, mg.max_cost_eur, mg.margin
      from tmsi.margin_grids mg
     where mg.branch_id = p_branch and mg.effective_date <= p_date
     order by mg.tier, mg.effective_date desc, mg.created_at desc
  ) latest
   where latest.max_cost_eur is null or p_cost_eur < latest.max_cost_eur
   order by latest.tier limit 1;
$$;
revoke execute on function tmsi.branch_margin(text, numeric, date) from public, anon;

-- ---------------------------------------------------------------------------
-- 3. tmsi.compute_price() — same signature, same output columns, same
--    security-scoping logic (§4 of 0001, untouched below); only the three
--    inline lookups against interco_fees/transport_tiers/customs_rates
--    gain the same effective-dating discipline branch_margin() just got,
--    and the branch_margin() call passes p_date through. Every other line
--    is copied verbatim from 0001 — diff this against 0001 §7 to confirm
--    nothing else moved.
-- ---------------------------------------------------------------------------

create or replace function tmsi.compute_price(p_product text, p_branch text, p_date date default current_date)
returns table (
  product_id text, branch_id text, currency char(3),
  fx_used numeric, exw_local numeric, fee numeric, interco numeric,
  transport numeric, duty_rate numeric, duty numeric, total_cost numeric, total_cost_eur numeric,
  margin numeric, list_coef numeric, min_price numeric, ref_price numeric,
  alert text, overrides text[], errors text[]
) language plpgsql stable security definer set search_path = tmsi, public as $$
declare
  p   tmsi.products%rowtype;
  b   tmsi.branches%rowtype;
  see_costs boolean; see_sell boolean;
  cur char(3);
  fx_prod numeric; fx_branch numeric;
  v_fee numeric; v_transport numeric; v_duty_rate numeric; v_margin numeric; v_coef numeric;
  v_exw_local numeric; v_interco numeric; v_duty numeric; v_total numeric; v_total_eur numeric;
  v_min numeric; v_ref numeric; ov text[] := '{}'; err text[] := '{}'; o numeric;
  min_m numeric; tgt_m numeric; parent_margin numeric;
begin
  select * into p from tmsi.products where id = p_product;
  select * into b from tmsi.branches where id = p_branch;
  if p.id is null or b.id is null then return; end if;
  cur := b.currency;

  see_costs := tmsi.has_role('admin') or tmsi.has_role('product_manager') or tmsi.has_role('finance')
            or tmsi.has_role('viewer')
            or (tmsi.has_role('branch_manager') and b.id = any(tmsi.my_branches()));
  see_sell  := see_costs or tmsi.has_role('logistics')
            or (tmsi.has_role('sales') and b.id = any(tmsi.my_branches()))
            or (tmsi.has_role('agent') and b.id in (select ch.branch_id from tmsi.channels ch where ch.id = any(tmsi.my_channels())));
  if auth.uid() is not null and not see_sell then return; end if;
  if auth.uid() is not null and not see_costs and p.status <> 'active' then return; end if;

  o := tmsi.override_value(p.id, b.id, 'fx', p_date);
  if o is not null then
    fx_used := o; ov := array_append(ov, 'fx');
  else
    fx_prod   := case when p.currency = 'EUR' then 1 else tmsi.fx_rate(p.currency, p_date) end;
    fx_branch := case when cur = 'EUR' then 1 else tmsi.fx_rate(cur, p_date) end;
    if fx_prod is null or fx_branch is null then
      err := array_append(err, 'missing exchange rate'); fx_used := null;
    else
      fx_used := fx_branch / fx_prod;
    end if;
  end if;
  v_exw_local := p.exw_price * coalesce(fx_used, 0);

  -- interco fee: latest effective row for this (supplier, seller) pair
  o := tmsi.override_value(p.id, b.id, 'fee', p_date);
  if o is not null then v_fee := o; ov := array_append(ov, 'fee');
  elsif p.primary_branch = b.id then v_fee := 0;
  else
    select f.fee into v_fee from tmsi.interco_fees f
     where f.supplier_branch = p.primary_branch and f.seller_branch = b.id
       and f.effective_date <= p_date
     order by f.effective_date desc, f.created_at desc limit 1;
    if v_fee is null then err := array_append(err, 'missing interco fee'); v_fee := 0; end if;
  end if;
  v_interco := v_exw_local * (1 + v_fee);

  -- transport: latest row per tier as of p_date, then the existing
  -- smallest-applicable-tier selection on top of that snapshot
  o := tmsi.override_value(p.id, b.id, 'transport', p_date);
  if o is not null then v_transport := o; ov := array_append(ov, 'transport');
  elsif p.primary_branch = b.id or p.item_type in ('option', 'service') then v_transport := 0;
  else
    select t.cost into v_transport from (
      select distinct on (tt.tier) tt.tier, tt.max_weight_kg, tt.cost
        from tmsi.transport_tiers tt
       where tt.branch_id = b.id and tt.effective_date <= p_date
       order by tt.tier, tt.effective_date desc, tt.created_at desc
    ) t
     where t.max_weight_kg is null or p.gross_weight_kg < t.max_weight_kg
     order by t.tier limit 1;
    if v_transport is null then err := array_append(err, 'missing transport tier / weight'); v_transport := 0; end if;
  end if;

  -- customs duty: latest effective row for this (hs_code, zone) pair
  o := tmsi.override_value(p.id, b.id, 'duty', p_date);
  if o is not null then v_duty_rate := o; ov := array_append(ov, 'duty');
  elsif p.primary_branch = b.id or p.item_type in ('option', 'service') then v_duty_rate := 0;
  else
    select c.rate into v_duty_rate from tmsi.customs_rates c
     where c.hs_code = coalesce(
             (select h.hs_code from tmsi.product_hs_overrides h
               where h.product_id = p.id and h.scope_type = 'branch' and h.scope_id = b.id),
             p.hs_code)
       and c.zone = b.zone
       and c.effective_date <= p_date
     order by c.effective_date desc, c.created_at desc limit 1;
    if v_duty_rate is null then err := array_append(err, 'missing customs rate for HS/zone'); v_duty_rate := 0; end if;
  end if;
  v_duty  := v_interco * v_duty_rate;
  v_total := v_interco + v_transport + v_duty;
  v_total_eur := case when cur = 'EUR' then v_total
                      else v_total / coalesce(tmsi.fx_rate(cur, p_date), 1) end;

  o := tmsi.override_value(p.id, b.id, 'margin', p_date);
  if o is not null then v_margin := o; ov := array_append(ov, 'margin');
  elsif p.item_type = 'option' and p.parent_id is not null then
    select c.margin into parent_margin from tmsi.compute_price(p.parent_id, b.id, p_date) c;
    v_margin := parent_margin;
  else
    v_margin := tmsi.branch_margin(b.id, v_total_eur, p_date);
  end if;
  if v_margin is null then err := array_append(err, 'missing margin grid'); v_margin := 0; end if;

  o := tmsi.override_value(p.id, b.id, 'coef', p_date);
  if o is not null then v_coef := o; ov := array_append(ov, 'coef'); else v_coef := b.list_coef; end if;

  v_min := tmsi.round_to(v_total / (1 - v_margin) * v_coef, (select rounding from tmsi.currencies where code = cur));
  v_ref := tmsi.round_to(v_min * b.ref_factor,               (select rounding from tmsi.currencies where code = cur));

  select (value->>0)::numeric into min_m from tmsi.settings where key = 'margin_min';
  select (value->>0)::numeric into tgt_m from tmsi.settings where key = 'margin_target';

  if auth.uid() is not null and not see_costs then
    return query select p.id, b.id, cur,
      null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
      null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
      v_min, v_ref, null::text, null::text[], null::text[];
    return;
  end if;

  return query select p.id, b.id, cur,
    fx_used, v_exw_local, v_fee, v_interco, v_transport, v_duty_rate, v_duty, v_total, v_total_eur,
    v_margin, v_coef, v_min, v_ref,
    case when array_length(err, 1) > 0 then 'error'
         when v_margin < coalesce(min_m, 0.15) then 'critical'
         when v_margin < coalesce(tgt_m, 0.25) then 'warning' else 'ok' end,
    ov, err;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The proposals table. One generic table for all six target types
--    rather than six near-identical ones — the workflow logic (who
--    proposes, who approves, materialise-on-approval) is genuinely the
--    same shape for all six; six copies would multiply the RLS/audit
--    surface six-fold for no behavioural difference. payload carries
--    exactly the columns the target table's own INSERT needs; branch_id
--    is denormalised out of payload for indexable RLS/approval-eligibility
--    checks, NULL for the three admin-only-approval types (§ note above
--    the migration's own header).
-- ---------------------------------------------------------------------------

create table tmsi.price_proposals (
  id               bigint generated always as identity primary key,
  target_table     text not null check (target_table in
                     ('exchange_rates','interco_fees','transport_tiers',
                      'customs_rates','margin_grids','price_overrides')),
  branch_id        text references tmsi.branches,
  payload          jsonb not null,
  reason           text not null,
  status           text not null default 'pending' check (status in ('pending','approved','rejected')),
  proposed_by      uuid not null,
  proposed_at      timestamptz not null default clock_timestamp(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_reason  text,
  materialized_id  bigint,
  check (status = 'pending' or (decided_by is not null and decided_at is not null)),
  check (status <> 'rejected' or decision_reason is not null),
  check (status <> 'pending' or (decided_by is null and decided_at is null and materialized_id is null))
);
create index price_proposals_status_idx on tmsi.price_proposals (status, target_table);
create trigger trg_audit_price_proposals after insert or update or delete on tmsi.price_proposals
  for each row execute function tmsi.audit();

alter table tmsi.price_proposals enable row level security;

-- Visibility mirrors tmsi.overrides_read's own shape (0001 §8): the
-- broadly-cost-visible roles see everything, branch_manager only their
-- own branch's proposals, and — new here, since a proposer might not
-- otherwise have any read access at all (logistics has no
-- tmsi.can_read_costs()) — anyone always sees their own proposals.
create policy proposals_read on tmsi.price_proposals for select to authenticated using (
  proposed_by = auth.uid()
  or tmsi.has_role('admin') or tmsi.has_role('finance') or tmsi.has_role('product_manager') or tmsi.has_role('viewer')
  or (tmsi.has_role('branch_manager') and branch_id is not null and branch_id = any(tmsi.my_branches()))
);

-- Proposal-creation eligibility is exactly today's write eligibility per
-- target table (0001 §8's config_write/overrides_write, unchanged) — this
-- policy is the ONLY place that boundary now lives; those old policies
-- are dropped below. branch_id must match what the payload itself claims
-- for the three branch-scoped types, so a caller cannot declare a branch
-- that doesn't match their own payload to fool the approval-eligibility
-- check later.
create policy proposals_insert on tmsi.price_proposals for insert to authenticated with check (
  proposed_by = auth.uid()
  and (
    (target_table = 'exchange_rates' and branch_id is null
      and (tmsi.has_role('admin') or tmsi.has_role('finance')))
    or (target_table = 'interco_fees' and branch_id is null
      and (tmsi.has_role('admin') or tmsi.has_role('finance')))
    or (target_table = 'customs_rates' and branch_id is null
      and (tmsi.has_role('admin') or tmsi.has_role('finance') or tmsi.has_role('logistics')))
    or (target_table = 'transport_tiers' and branch_id = (payload->>'branch_id')
      and (tmsi.has_role('admin') or tmsi.has_role('finance') or tmsi.has_role('logistics')))
    or (target_table = 'margin_grids' and branch_id = (payload->>'branch_id')
      and (tmsi.has_role('admin') or tmsi.has_role('finance')))
    or (target_table = 'price_overrides' and branch_id = (payload->>'branch_id') and (
          tmsi.has_role('admin') or tmsi.has_role('finance')
          or (tmsi.has_role('branch_manager') and branch_id = any(tmsi.my_branches())
              and (payload->>'kind') in ('transport','margin','coef'))
          or (tmsi.has_role('logistics') and (payload->>'kind') = 'duty')
        ))
  )
);

-- No UPDATE/DELETE policy for authenticated at all: a proposal's status
-- moves only through tmsi.decide_price_proposal() below, which runs as
-- the table owner (security definer) and is therefore not itself subject
-- to this RLS gap — this is the enforcement, not an oversight. A proposer
-- editing their own pending row, or self-approving via a raw UPDATE, are
-- both impossible: there is no policy that would permit either.

-- ---------------------------------------------------------------------------
-- 5. The decision function. has_role('admin')/branch match re-checked
--    INSIDE the function (0006's own pattern for admin_revoke_sessions) —
--    never trusts the calling Server Action's own gate. Fully schema-
--    qualified throughout, search_path = pg_temp only (0006's strictest
--    convention, tightened past 0002's tmsi,pg_temp): this function does
--    real, consequential writes across six possible target tables, and an
--    unqualified name anywhere in it would be exactly the privilege-
--    escalation vector 0002 first flagged. Explicit column lists per
--    target_table, never a dynamically-built column/table identifier from
--    payload — target_table is already constrained by its own CHECK to
--    one of six literal values, but the INSERT statements below use that
--    checked value only to choose a branch, never to build SQL text.
-- ---------------------------------------------------------------------------

create or replace function tmsi.decide_price_proposal(p_proposal_id bigint, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = pg_temp
as $$
declare
  pr tmsi.price_proposals%rowtype;
  new_id bigint;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select * into pr from tmsi.price_proposals where id = p_proposal_id;
  if pr.id is null then
    raise exception 'Proposal % not found', p_proposal_id;
  end if;
  if pr.status <> 'pending' then
    raise exception 'Proposal % is already %, not pending', p_proposal_id, pr.status;
  end if;

  if not (
    tmsi.has_role('admin')
    or (pr.branch_id is not null and tmsi.has_role('branch_manager') and pr.branch_id = any(tmsi.my_branches()))
  ) then
    raise exception 'Forbidden';
  end if;

  if p_decision = 'rejected' then
    if p_reason is null or p_reason = '' then
      raise exception 'A reason is required to reject a proposal';
    end if;
    update tmsi.price_proposals
       set status = 'rejected', decided_by = auth.uid(), decided_at = clock_timestamp(), decision_reason = p_reason
     where id = p_proposal_id;
    return;
  end if;

  -- approved: materialise into the real target table, explicit columns
  -- per table, then record the decision + the id of the row just created.
  if pr.target_table = 'exchange_rates' then
    insert into tmsi.exchange_rates (currency, rate_per_eur, effective_date, source, created_by)
    values ((pr.payload->>'currency')::char(3), (pr.payload->>'rate_per_eur')::numeric,
            (pr.payload->>'effective_date')::date, pr.payload->>'source', pr.proposed_by)
    returning id into new_id;
  elsif pr.target_table = 'interco_fees' then
    insert into tmsi.interco_fees (supplier_branch, seller_branch, fee, effective_date, created_by)
    values (pr.payload->>'supplier_branch', pr.payload->>'seller_branch', (pr.payload->>'fee')::numeric,
            coalesce((pr.payload->>'effective_date')::date, current_date), pr.proposed_by)
    returning id into new_id;
  elsif pr.target_table = 'transport_tiers' then
    insert into tmsi.transport_tiers (branch_id, tier, max_weight_kg, cost, currency, effective_date, created_by)
    values (pr.payload->>'branch_id', (pr.payload->>'tier')::smallint, (pr.payload->>'max_weight_kg')::numeric,
            (pr.payload->>'cost')::numeric, pr.payload->>'currency',
            coalesce((pr.payload->>'effective_date')::date, current_date), pr.proposed_by)
    returning id into new_id;
  elsif pr.target_table = 'customs_rates' then
    insert into tmsi.customs_rates (hs_code, zone, rate, effective_date, created_by)
    values (pr.payload->>'hs_code', (pr.payload->>'zone')::tmsi.customs_zone, (pr.payload->>'rate')::numeric,
            coalesce((pr.payload->>'effective_date')::date, current_date), pr.proposed_by)
    returning id into new_id;
  elsif pr.target_table = 'margin_grids' then
    insert into tmsi.margin_grids (branch_id, tier, max_cost_eur, margin, effective_date, created_by)
    values (pr.payload->>'branch_id', (pr.payload->>'tier')::smallint, (pr.payload->>'max_cost_eur')::numeric,
            (pr.payload->>'margin')::numeric,
            coalesce((pr.payload->>'effective_date')::date, current_date), pr.proposed_by)
    returning id into new_id;
  elsif pr.target_table = 'price_overrides' then
    insert into tmsi.price_overrides (product_id, branch_id, kind, value, reason, valid_from, valid_to, created_by)
    values (pr.payload->>'product_id', pr.payload->>'branch_id', (pr.payload->>'kind')::tmsi.override_kind,
            (pr.payload->>'value')::numeric, pr.payload->>'reason',
            coalesce((pr.payload->>'valid_from')::date, current_date), (pr.payload->>'valid_to')::date, pr.proposed_by)
    returning id into new_id;
  else
    raise exception 'Unhandled target_table: %', pr.target_table;
  end if;

  update tmsi.price_proposals
     set status = 'approved', decided_by = auth.uid(), decided_at = clock_timestamp(),
         decision_reason = p_reason, materialized_id = new_id
   where id = p_proposal_id;
end;
$$;
revoke execute on function tmsi.decide_price_proposal(bigint, text, text) from public, anon;

-- ---------------------------------------------------------------------------
-- 6. Remove direct-write access to the six target tables — proposals are
--    now the only path in. overrides_write's own USING clause (0001 §8)
--    doubled as logistics' only read access to duty-kind overrides (the
--    OR-combination of permissive policies achado already documented in
--    docs/VERIFICATION-PROTOCOL.md, tarefa 5 F0) — folded into
--    overrides_read explicitly below so dropping overrides_write doesn't
--    silently take that read visibility with it.
-- ---------------------------------------------------------------------------

alter policy overrides_read on tmsi.price_overrides
  using (tmsi.can_read_costs() and (tmsi.has_role('admin') or tmsi.has_role('finance')
         or tmsi.has_role('product_manager') or tmsi.has_role('viewer') or branch_id = any(tmsi.my_branches()))
         or (tmsi.has_role('logistics') and kind = 'duty'));

drop policy overrides_write on tmsi.price_overrides;
drop policy config_write on tmsi.exchange_rates;
drop policy config_write on tmsi.interco_fees;
drop policy config_write on tmsi.transport_tiers;
drop policy config_write on tmsi.customs_rates;
drop policy config_write on tmsi.margin_grids;
-- tmsi.settings' config_write is untouched — out of scope (0007 F0): it
-- tunes alert thresholds, not a value compute_price() returns to a caller.

commit;
