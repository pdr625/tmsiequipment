-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0010 — five small fixes bundled in one session, none reopening
-- the channel design (0009):
--   (A) rounding by currency (EUR/USD/GBP to cents, CNY stays tens; the
--       published minimum rounds UP, never down; the reference price
--       rounds from the already-rounded minimum) — decision of the Pedro,
--       2026-09-10.
--   (B) item 30 (docs/MODEL-GAP-ANALYSIS.md item 11): option/service lines
--       get fee=0 and margin=0 (flat EXW pricing), not an inherited or
--       grid margin.
--   (C) item 31: origin_country moved to the cost tier of tmsi.v_products,
--       matching the Pedro's own decision already recorded for supplier_id.
--   (D) the logistics/channel over-reach the 0009 verification found:
--       has_role('logistics') no longer grants channel sell-price
--       visibility unconditionally — only for branch scope, its original
--       (0001) intent.
--   (E) item 34: tmsi.branches.ref_factor/list_coef become a proper
--       effective-dated config table (tmsi.branch_pricing_params, same
--       shape 0007 already gave transport_tiers/margin_grids/etc.), wired
--       into the 0007 approval workflow — "materialise as a new row, never
--       UPDATE a value in effect" applies here exactly as everywhere else
--       in this schema, so this is a new table, not an UPDATE-in-place
--       special case. Currency rounding gets the same treatment
--       (tmsi.currency_rounding_params) for the same reason — kept append-
--       only and workflow-gated like everything else the engine reads,
--       even though it will rarely change.
--
-- Never edit 0001-0009 (already applied). This file is additive.

begin;

-- ---------------------------------------------------------------------------
-- 1. (E, part 1) Currency rounding — its own effective-dated table.
--    tmsi.currencies.rounding was a flat, unversioned column, the only
--    engine-consumed parameter in this schema that was never brought into
--    the 0005/0007 effective-dating discipline. Backfilled from today's
--    values (not fabricated history — "in effect as of today", same wording
--    0007 already used for its own backfill), old column dropped once the
--    new table is confirmed to hold the same values.
-- ---------------------------------------------------------------------------

create table tmsi.currency_rounding_params (
  id              bigint generated always as identity primary key,
  currency        char(3) not null references tmsi.currencies,
  rounding        numeric(10,2) not null check (rounding > 0),  -- same scale tmsi.currencies.rounding had
  effective_date  date not null default current_date,
  created_at      timestamptz not null default clock_timestamp(),
  created_by      uuid
);
create index currency_rounding_params_lookup_idx on tmsi.currency_rounding_params
  (currency, effective_date desc, created_at desc);
create trigger trg_audit_currency_rounding_params after insert or update or delete on tmsi.currency_rounding_params
  for each row execute function tmsi.audit();
alter table tmsi.currency_rounding_params enable row level security;
create policy currency_rounding_read on tmsi.currency_rounding_params for select to authenticated
  using (tmsi.can_read_costs());
-- No write policy for authenticated — proposals (tmsi.decide_price_proposal())
-- are the only path in, same shape as every other config table since 0007.

-- Decision (A): EUR/USD/GBP round to cents (0.01), CNY keeps tens (10) —
-- backfilled as the value "in effect as of today", the same convention
-- 0007 used, not a fabricated history.
insert into tmsi.currency_rounding_params (currency, rounding, effective_date)
select code, case when code = 'CNY' then 10 else 0.01 end, current_date
  from tmsi.currencies;

alter table tmsi.currencies drop column rounding;

-- ---------------------------------------------------------------------------
-- 2. (E, part 2) Branch pricing params — ref_factor/list_coef pulled out of
--    tmsi.branches into their own effective-dated table, same reasoning as
--    above. tmsi.branches keeps its identity columns (name/country/
--    currency/zone/active) — those aren't priced, they don't need history.
-- ---------------------------------------------------------------------------

create table tmsi.branch_pricing_params (
  id              bigint generated always as identity primary key,
  branch_id       text not null references tmsi.branches,
  ref_factor      numeric(6,3) not null check (ref_factor > 0),
  list_coef       numeric(6,3) not null check (list_coef > 0),
  effective_date  date not null default current_date,
  created_at      timestamptz not null default clock_timestamp(),
  created_by      uuid
);
create index branch_pricing_params_lookup_idx on tmsi.branch_pricing_params
  (branch_id, effective_date desc, created_at desc);
create trigger trg_audit_branch_pricing_params after insert or update or delete on tmsi.branch_pricing_params
  for each row execute function tmsi.audit();
alter table tmsi.branch_pricing_params enable row level security;
create policy branch_pricing_params_read on tmsi.branch_pricing_params for select to authenticated
  using (tmsi.can_read_costs());

insert into tmsi.branch_pricing_params (branch_id, ref_factor, list_coef, effective_date)
select id, ref_factor, list_coef, current_date from tmsi.branches;

alter table tmsi.branches drop column ref_factor;
alter table tmsi.branches drop column list_coef;

-- ---------------------------------------------------------------------------
-- 3. tmsi.round_up_to() — the "never down" half of decision (A). Mirrors
--    tmsi.round_to()'s own shape (0001 §7) exactly; round_to itself is
--    untouched and still used for the reference price (nearest, from the
--    already-rounded minimum — decision 3 of (A), already how the code
--    computed v_ref even before this migration, confirmed reading 0009's
--    body: v_ref already used v_min, the rounded value, not the raw total).
-- ---------------------------------------------------------------------------

create or replace function tmsi.round_up_to(v numeric, step numeric)
returns numeric language sql immutable as $$ select ceil(v / step) * step; $$;

-- ---------------------------------------------------------------------------
-- 4. tmsi.v_products (0003/0004) — (C) origin_country moves from the
--    operational tier to the cost tier, matching supplier_id exactly (the
--    Pedro's own decision, docs/MODEL-GAP-ANALYSIS.md item 9: "Supplier e
--    Origin Country ficam atrás da fronteira de custos"). Same column
--    list/order/types as 0004's own create-or-replace (0004 §only
--    statement) — only the origin_country expression changes tier.
-- ---------------------------------------------------------------------------

create or replace view tmsi.v_products as
  select
    id, name, category_id, item_type, status, lead_time_days, unit,
    case when tmsi.can_read_operational() then description end as description,
    case when tmsi.can_read_operational() then parent_id end as parent_id,
    case when tmsi.can_read_costs() then origin_country end as origin_country,
    primary_branch,
    case when tmsi.can_read_operational() then hs_code end as hs_code,
    case when tmsi.can_read_operational() then gross_weight_kg end as gross_weight_kg,
    case when tmsi.can_read_operational() then net_weight_kg end as net_weight_kg,
    case when tmsi.can_read_operational() then volume_m3 end as volume_m3,
    case when tmsi.can_read_operational() then dimensions end as dimensions,
    case when tmsi.can_read_operational() then palletizable end as palletizable,
    case when tmsi.can_read_operational() then pallets end as pallets,
    case when tmsi.can_read_operational() then stackable end as stackable,
    sold_in,
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

-- ---------------------------------------------------------------------------
-- 5. tmsi.compute_price() — same signature as 0009 (no callers change),
--    body updated for (A)/(B)/(D). Every branch-scope line not touched by
--    one of these three fixes is copied verbatim from 0009.
-- ---------------------------------------------------------------------------

create or replace function tmsi.compute_price(
  p_product text, p_scope_type tmsi.pricing_scope, p_scope_id text, p_date date default current_date
)
returns table (
  product_id text, branch_id text, currency char(3),
  fx_used numeric, exw_local numeric, fee numeric, interco numeric,
  transport numeric, duty_rate numeric, duty numeric, total_cost numeric, total_cost_eur numeric,
  margin numeric, list_coef numeric, min_price numeric, ref_price numeric,
  alert text, overrides text[], errors text[], scope_type tmsi.pricing_scope
) language plpgsql stable security definer set search_path = tmsi, public as $$
declare
  p   tmsi.products%rowtype;
  b   tmsi.branches%rowtype;  -- the ORIGIN branch for channel scope too
  ch  tmsi.channels%rowtype;
  bp  tmsi.branch_pricing_params%rowtype;  -- (E) latest ref_factor/list_coef for b
  see_costs boolean; see_sell boolean;
  cur char(3);
  fx_prod numeric; fx_branch numeric;
  v_fee numeric; v_transport numeric; v_duty_rate numeric; v_margin numeric; v_coef numeric;
  v_exw_local numeric; v_interco numeric; v_duty numeric; v_total numeric; v_total_eur numeric;
  v_min numeric; v_ref numeric; ov text[] := '{}'; err text[] := '{}'; o numeric;
  min_m numeric; tgt_m numeric;
  v_round_step numeric;
  is_flat_priced boolean;  -- (B): option/service, margin zero, fee zero
begin
  select * into p from tmsi.products where id = p_product;

  if p_scope_type = 'channel' then
    select * into ch from tmsi.channels where id = p_scope_id and active;
    if ch.id is null then return; end if;
    select * into b from tmsi.branches where id = ch.branch_id;
  else
    select * into b from tmsi.branches where id = p_scope_id;
  end if;
  if p.id is null or b.id is null then return; end if;
  cur := b.currency;
  is_flat_priced := p.item_type in ('option', 'service');

  -- table-aliased and column-qualified throughout, not just style: a bare
  -- `branch_id` here is genuinely ambiguous against this function's own
  -- OUT parameter of the same name (RETURNS TABLE(..., branch_id text, ...)
  -- makes it an implicit PL/pgSQL variable too) — caught live by this
  -- migration's own BEGIN/ROLLBACK validation, not assumed; every other
  -- lookup in this function already aliases for the same reason (tt./f./c.).
  select bpp.* into bp from tmsi.branch_pricing_params bpp
   where bpp.branch_id = b.id and bpp.effective_date <= p_date
   order by bpp.effective_date desc, bpp.created_at desc limit 1;

  -- same ambiguity risk as branch_pricing_params above — `currency` is
  -- also this function's own OUT parameter name — aliased pre-emptively,
  -- not found the hard way twice.
  select crp.rounding into v_round_step from tmsi.currency_rounding_params crp
   where crp.currency = cur and crp.effective_date <= p_date
   order by crp.effective_date desc, crp.created_at desc limit 1;

  -- caller scoping (§4, 0001/0007/0009 unchanged for branch scope), (D):
  -- has_role('logistics') now only grants channel-agnostic sell visibility
  -- for BRANCH scope — its original (0001) intent, shipping/operational,
  -- never had an unbounded reach across every channel a future agent
  -- territory might add. An agent still sees their own channel(s) via the
  -- clause below, unchanged.
  see_costs := tmsi.has_role('admin') or tmsi.has_role('product_manager') or tmsi.has_role('finance')
            or tmsi.has_role('viewer')
            or (p_scope_type = 'branch' and tmsi.has_role('branch_manager') and b.id = any(tmsi.my_branches()));
  see_sell  := see_costs
            or (p_scope_type = 'branch' and tmsi.has_role('logistics'))
            or (p_scope_type = 'branch' and tmsi.has_role('sales') and b.id = any(tmsi.my_branches()))
            or (p_scope_type = 'branch' and tmsi.has_role('agent')
                and b.id in (select c.branch_id from tmsi.channels c where c.id = any(tmsi.my_channels())))
            or (p_scope_type = 'channel' and tmsi.has_role('agent') and p_scope_id = any(tmsi.my_channels()));
  if auth.uid() is not null and not see_sell then return; end if;
  if auth.uid() is not null and not see_costs and p.status <> 'active' then return; end if;

  -- FX: unchanged, cur already correct for both scopes.
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'fx', p_date);
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

  -- interco fee: (B) option/service is always 0 ("preço interco = EXW"),
  -- checked before the channel-hard-zero and the home-sale zero — an
  -- override still wins over all three (principle 4, replace an input,
  -- never a result), same priority order the rest of this function uses.
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'fee', p_date);
  if o is not null then
    v_fee := o; ov := array_append(ov, 'fee');
  elsif is_flat_priced then
    v_fee := 0;
  elsif p_scope_type = 'channel' then
    v_fee := 0;
  elsif p.primary_branch = b.id then
    v_fee := 0;
  else
    select f.fee into v_fee from tmsi.interco_fees f
     where f.supplier_branch = p.primary_branch and f.seller_branch = b.id
       and f.effective_date <= p_date
     order by f.effective_date desc, f.created_at desc limit 1;
    if v_fee is null then err := array_append(err, 'missing interco fee'); v_fee := 0; end if;
  end if;
  v_interco := v_exw_local * (1 + v_fee);

  -- transport: byte-identical to 0009 (item_type check already covered
  -- option/service here before this migration; unchanged).
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'transport', p_date);
  if o is not null then v_transport := o; ov := array_append(ov, 'transport');
  elsif p.item_type in ('option', 'service') then v_transport := 0;
  elsif p_scope_type = 'branch' and p.primary_branch = b.id then v_transport := 0;
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

  -- customs duty: byte-identical to 0009 (option/service and channel scope
  -- already zero here; unchanged).
  if p_scope_type = 'channel' then
    v_duty_rate := 0;
  else
    o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'duty', p_date);
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
  end if;
  v_duty  := v_interco * v_duty_rate;
  v_total := v_interco + v_transport + v_duty;
  v_total_eur := case when cur = 'EUR' then v_total
                      else v_total / coalesce(tmsi.fx_rate(cur, p_date), 1) end;

  -- margin: (B) option/service is always 0 ("margem zero"), checked before
  -- the channel-missing-override error and the branch grid fallback — an
  -- override still wins (same priority as fee above). The old
  -- option-inherits-parent-margin path (0001-0009) is removed: it does not
  -- match the Excel's own rule (docs/MODEL-GAP-ANALYSIS.md item 11) and is
  -- superseded by this flat rule for every option, not just some — if the
  -- real catalogue turns out to need a DIFFERENT rule for some subset of
  -- options ("opções com ajuste" vs a bundled/component option that should
  -- still inherit), that is a follow-up needing a sub-type distinction this
  -- schema does not have yet, not solved here (restriction: minimal
  -- solution, not the most elegant one).
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'margin', p_date);
  if o is not null then
    v_margin := o; ov := array_append(ov, 'margin');
  elsif is_flat_priced then
    v_margin := 0;
  elsif p_scope_type = 'channel' then
    err := array_append(err, 'missing channel margin override'); v_margin := 0;
  else
    v_margin := tmsi.branch_margin(b.id, v_total_eur, p_date);
    if v_margin is null then err := array_append(err, 'missing margin grid'); v_margin := 0; end if;
  end if;

  -- list coefficient: (E) now from tmsi.branch_pricing_params, not
  -- tmsi.branches directly — same fallback shape as before (channel scope
  -- neutral default 1, no list_coef term in the Excel's channel formula).
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'coef', p_date);
  if o is not null then v_coef := o; ov := array_append(ov, 'coef');
  elsif p_scope_type = 'channel' then v_coef := 1;
  else v_coef := bp.list_coef; end if;

  -- (A) rounding: only the two PUBLISHED prices round, nothing intermediate
  -- above did. The minimum rounds UP (never down — a floor rounded down
  -- would authorise a sale below the calculated floor); the reference
  -- price is computed from that already-rounded minimum, then rounds to
  -- the NEAREST step (not up) — it is a suggested list price, not a floor,
  -- so it carries none of the "never below cost" risk the minimum does.
  v_min := tmsi.round_up_to(v_total / (1 - v_margin) * v_coef, v_round_step);
  v_ref := tmsi.round_to(v_min * bp.ref_factor, v_round_step);

  select (value->>0)::numeric into min_m from tmsi.settings where key = 'margin_min';
  select (value->>0)::numeric into tgt_m from tmsi.settings where key = 'margin_target';

  if auth.uid() is not null and not see_costs then
    return query select p.id, coalesce(ch.id, b.id), cur,
      null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
      null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
      v_min, v_ref, null::text, null::text[], null::text[], p_scope_type;
    return;
  end if;

  return query select p.id, coalesce(ch.id, b.id), cur,
    fx_used, v_exw_local, v_fee, v_interco, v_transport, v_duty_rate, v_duty, v_total, v_total_eur,
    v_margin, v_coef, v_min, v_ref,
    case when array_length(err, 1) > 0 then 'error'
         when v_margin < coalesce(min_m, 0.15) then 'critical'
         when v_margin < coalesce(tgt_m, 0.25) then 'warning' else 'ok' end,
    ov, err, p_scope_type;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Workflow (0007) — two new target_table values, each wired the way its
--    own identity actually works: branch_pricing_params has a branch_id
--    (same admin/finance-propose, admin-or-own-branch_manager-approve
--    shape as margin_grids — decide_price_proposal()'s existing approval
--    check needs no change, it already matches on branch_id generically);
--    currency_rounding_params has none (mirrors exchange_rates — admin/
--    finance propose, admin-only approve, same existing generic mechanism).
-- ---------------------------------------------------------------------------

alter table tmsi.price_proposals drop constraint price_proposals_target_table_check;
alter table tmsi.price_proposals add constraint price_proposals_target_table_check
  check (target_table in ('exchange_rates','interco_fees','transport_tiers','customs_rates',
                           'margin_grids','price_overrides','branch_pricing_params','currency_rounding_params'));

drop policy proposals_insert on tmsi.price_proposals;
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
    or (target_table = 'price_overrides' and (payload->>'scope_type') = 'branch'
        and branch_id = (payload->>'scope_id') and (
          tmsi.has_role('admin') or tmsi.has_role('finance')
          or (tmsi.has_role('branch_manager') and branch_id = any(tmsi.my_branches())
              and (payload->>'kind') in ('transport','margin','coef'))
          or (tmsi.has_role('logistics') and (payload->>'kind') = 'duty')
        ))
    or (target_table = 'price_overrides' and (payload->>'scope_type') = 'channel'
        and branch_id = (payload->>'scope_id') and (payload->>'kind') in ('margin','transport')
        and (tmsi.has_role('admin') or tmsi.has_role('finance')))
    or (target_table = 'branch_pricing_params' and branch_id = (payload->>'branch_id')
      and (tmsi.has_role('admin') or tmsi.has_role('finance')))
    or (target_table = 'currency_rounding_params' and branch_id is null
      and (tmsi.has_role('admin') or tmsi.has_role('finance')))
  )
);

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
    insert into tmsi.price_overrides (product_id, scope_type, scope_id, kind, value, reason, valid_from, valid_to, created_by)
    values (pr.payload->>'product_id', (pr.payload->>'scope_type')::tmsi.pricing_scope, pr.payload->>'scope_id',
            (pr.payload->>'kind')::tmsi.override_kind,
            (pr.payload->>'value')::numeric, pr.payload->>'reason',
            coalesce((pr.payload->>'valid_from')::date, current_date), (pr.payload->>'valid_to')::date, pr.proposed_by)
    returning id into new_id;
  elsif pr.target_table = 'branch_pricing_params' then
    insert into tmsi.branch_pricing_params (branch_id, ref_factor, list_coef, effective_date, created_by)
    values (pr.payload->>'branch_id', (pr.payload->>'ref_factor')::numeric, (pr.payload->>'list_coef')::numeric,
            coalesce((pr.payload->>'effective_date')::date, current_date), pr.proposed_by)
    returning id into new_id;
  elsif pr.target_table = 'currency_rounding_params' then
    insert into tmsi.currency_rounding_params (currency, rounding, effective_date, created_by)
    values ((pr.payload->>'currency')::char(3), (pr.payload->>'rounding')::numeric,
            coalesce((pr.payload->>'effective_date')::date, current_date), pr.proposed_by)
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

commit;
