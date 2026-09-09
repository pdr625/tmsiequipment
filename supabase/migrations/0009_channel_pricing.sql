-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0009 — channels and agents in the pricing engine. The gap
-- analysis (docs/MODEL-GAP-ANALYSIS.md, items 5/6) proved what i6 had
-- already registered as a pendency: tmsi.compute_price() never received a
-- channel parameter, and tmsi.channels.margin_delta has zero readers in the
-- whole project. The Excel real publishes a channel (APAC Agents) with its
-- OWN calculation chain, and the Pedro confirmed (09/09) more agent
-- territories are coming — this is a dimension of the business, not a
-- special case.
--
-- The Excel's channel rule, measured (docs/BACKLOG.md item 29):
--   minimum   = (EXW + transport_of_origin_branch) / (1 - channel_margin)
--   reference = minimum × ref_factor                (shared with branches)
--   NO intercompany fee, NO customs duty — ever, regardless of channel name
--   currency = the ORIGIN branch's currency (channels have none of their own)
--   channel margin is per ARTICLE, not banded like a branch's margin_grids
--     (the Excel backs it out from the published price, never states it
--     directly) — so there is no channel-level grid to fall back to; an
--     explicit override is the only path in (principle 5, no silent default).
--
-- Design question 1 (prompt, i6's own pending question): precedence between
-- scopes. A channel price is NOT "the branch price with a delta" — it's an
-- independent calculation from EXW. tmsi.channels.margin_delta assumed the
-- opposite (a delta on top of a branch's own margin), which is exactly why
-- nothing ever read it — the shape doesn't match how the Excel actually
-- prices a channel. It has one row of data (APAC, -0.10) that does not
-- survive into the new model: there is no "channel-level grid" for it to
-- become a delta OF, and channel margins are per-article overrides, not a
-- flat number. Dropped here, not migrated — its value is preserved in this
-- comment for the record, not silently lost. A default channel margin, if
-- the Pedro ever wants one instead of an override per article, is a product
-- decision for a future session, not inferred here.
--
-- Design question 2: how scope reaches compute_price(). An explicit
-- (p_scope_type, p_scope_id) pair, never inferred from session/role — the
-- engine must answer for ANY combination a caller is entitled to ask about;
-- 0003/0004's boundaries keep deciding who sees what, unchanged.
--
-- Never edit 0001-0008 (already applied). This file is additive.

begin;

-- ---------------------------------------------------------------------------
-- 1. The scope type itself, and tmsi.price_overrides generalised to use it
--    (product_hs_overrides, 0001 §3, already has this exact scope_type/
--    scope_id shape for the same reason — this reuses that precedent, not
--    a new idea). price_overrides.branch_id had a hard FK to tmsi.branches
--    that would reject a channel id outright — that FK is what actually
--    blocked channel-scoped overrides from ever existing, structurally.
-- ---------------------------------------------------------------------------

create type tmsi.pricing_scope as enum ('branch', 'channel');

alter table tmsi.price_overrides rename column branch_id to scope_id;
alter table tmsi.price_overrides drop constraint price_overrides_branch_id_fkey;
alter table tmsi.price_overrides add column scope_type tmsi.pricing_scope not null default 'branch';
alter table tmsi.price_overrides alter column scope_type drop default;

drop index tmsi.price_overrides_product_id_branch_id_kind_idx;
create index price_overrides_product_id_scope_kind_idx on tmsi.price_overrides (product_id, scope_type, scope_id, kind);

-- price_proposals.branch_id keeps its name (ripple avoidance — it is read
-- across six target_table kinds, this RLS policy, and decide_price_proposal()
-- below); for target_table='price_overrides' with a channel-scoped payload
-- it now legitimately holds a channel id, so the FK to tmsi.branches — which
-- would reject that — is dropped. Nothing else about the column changes.
alter table tmsi.price_proposals drop constraint price_proposals_branch_id_fkey;

-- ---------------------------------------------------------------------------
-- 2. tmsi.override_value() — same shape, scope_type/scope_id replacing the
--    single branch_id parameter. Drop-then-create: CREATE OR REPLACE cannot
--    change a function's parameter list (0007 already established this
--    pattern for tmsi.branch_margin()).
-- ---------------------------------------------------------------------------

drop function tmsi.override_value(text, text, tmsi.override_kind, date);

create or replace function tmsi.override_value(
  p_product text, p_scope_type tmsi.pricing_scope, p_scope_id text,
  p_kind tmsi.override_kind, p_date date default current_date
) returns numeric language sql stable security definer set search_path = tmsi, public as $$
  select value from tmsi.price_overrides
   where product_id = p_product and scope_type = p_scope_type and scope_id = p_scope_id and kind = p_kind
     and valid_from <= p_date and (valid_to is null or valid_to >= p_date)
   order by created_at desc limit 1;
$$;
revoke execute on function tmsi.override_value(text, tmsi.pricing_scope, text, tmsi.override_kind, date) from public, anon;

-- ---------------------------------------------------------------------------
-- 3. tmsi.compute_price() — new signature (p_product, p_scope_type,
--    p_scope_id, p_date). Every line that already existed for branch scope
--    in 0007 is copied verbatim below and stays reachable on exactly the
--    same condition it always ran under (restriction 1: branch prices do
--    not change) — the new channel path is added alongside it, selected by
--    p_scope_type, never by testing the channel's name (design question 2).
--
--    `b` holds the ORIGIN branch for channel scope too (tmsi.channels.branch_id)
--    — currency, transport tiers and ref_factor all come from there, which is
--    what "shared with branches" (item 4 of the gap analysis) means in
--    practice: no separate channel-level currency/ref_factor to configure.
--    The output column is still named branch_id (kept, not renamed, for the
--    same ripple-avoidance reason as price_proposals above — every existing
--    view/page/export keys off this name); it holds the channel's own id for
--    a channel-scope row via coalesce(ch.id, b.id), b.id for a branch-scope
--    row exactly as before.
-- ---------------------------------------------------------------------------

-- Both views depend on the old compute_price() signature and must go first
-- (Postgres refuses to DROP a function with dependants, by design — caught
-- live by the BEGIN/ROLLBACK validation of this migration, not assumed).
-- tmsi.v_selling_prices' own definition does not change at all (0001 §7,
-- copied verbatim below) — it only needs to be dropped/recreated because it
-- depends on tmsi.v_branch_prices, which does change (§4 below).
drop view tmsi.v_selling_prices;
drop view tmsi.v_branch_prices;
drop function tmsi.compute_price(text, text, date);

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
  see_costs boolean; see_sell boolean;
  cur char(3);
  fx_prod numeric; fx_branch numeric;
  v_fee numeric; v_transport numeric; v_duty_rate numeric; v_margin numeric; v_coef numeric;
  v_exw_local numeric; v_interco numeric; v_duty numeric; v_total numeric; v_total_eur numeric;
  v_min numeric; v_ref numeric; ov text[] := '{}'; err text[] := '{}'; o numeric;
  min_m numeric; tgt_m numeric; parent_margin numeric;
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

  -- caller scoping (§4, 0001/0007 unchanged for branch scope): who may see
  -- costs, who may only see selling prices. Channel scope has no
  -- branch_manager/sales equivalent (a channel is not in my_branches()) —
  -- agent sees their OWN channel directly via my_channels(), ADDITIVE to
  -- the pre-existing branch-scope agent clause below (kept exactly as it
  -- was: an agent still sees the branch-scope row for their channel's
  -- origin branch, restriction 1 never narrows what already worked).
  see_costs := tmsi.has_role('admin') or tmsi.has_role('product_manager') or tmsi.has_role('finance')
            or tmsi.has_role('viewer')
            or (p_scope_type = 'branch' and tmsi.has_role('branch_manager') and b.id = any(tmsi.my_branches()));
  see_sell  := see_costs or tmsi.has_role('logistics')
            or (p_scope_type = 'branch' and tmsi.has_role('sales') and b.id = any(tmsi.my_branches()))
            or (p_scope_type = 'branch' and tmsi.has_role('agent')
                and b.id in (select c.branch_id from tmsi.channels c where c.id = any(tmsi.my_channels())))
            or (p_scope_type = 'channel' and tmsi.has_role('agent') and p_scope_id = any(tmsi.my_channels()));
  if auth.uid() is not null and not see_sell then return; end if;
  if auth.uid() is not null and not see_costs and p.status <> 'active' then return; end if;

  -- FX: product currency -> scope currency via EUR base. No scope_type
  -- branch needed here at all — cur is already the right currency for both
  -- scopes (branch's own, or the channel's origin branch) from above.
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

  -- interco fee: branch scope byte-identical to 0007. Channel scope is a
  -- hard 0 — the Excel's own rule ("APAC: no intercompany fee"), not a
  -- lookup that can be missing, so no error appended either.
  if p_scope_type = 'channel' then
    v_fee := 0;
  else
    o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'fee', p_date);
    if o is not null then v_fee := o; ov := array_append(ov, 'fee');
    elsif p.primary_branch = b.id then v_fee := 0;
    else
      select f.fee into v_fee from tmsi.interco_fees f
       where f.supplier_branch = p.primary_branch and f.seller_branch = b.id
         and f.effective_date <= p_date
       order by f.effective_date desc, f.created_at desc limit 1;
      if v_fee is null then err := array_append(err, 'missing interco fee'); v_fee := 0; end if;
    end if;
  end if;
  v_interco := v_exw_local * (1 + v_fee);

  -- transport: branch scope byte-identical to 0007, including the
  -- primary_branch="home sale" zeroing. Channel scope: always the ORIGIN
  -- branch's own tier for the product's weight — the Excel's channel
  -- formula has no zeroing term, a channel sale is never "at home" — except
  -- option/service, which never ship physically regardless of scope (that
  -- part of the rule is about the ARTICLE, not the scope, so it applies to
  -- both — same override kind, same table, just also checked here first).
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

  -- customs duty: hard 0 for channel scope (Excel: "no customs duty",
  -- ever) — byte-identical lookup to 0007 for branch scope.
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

  -- margin: branch scope byte-identical to 0007 (grid fallback via
  -- tmsi.branch_margin(), the option-inherits-parent path unchanged,
  -- including its own pre-existing 'missing margin grid' wording even when
  -- the real cause is a null parent margin — not changed here, restriction
  -- 1). Channel scope has NO grid to fall back to (item 11 of the gap
  -- analysis: the Excel's channel margins are per article, never banded) —
  -- an explicit override is the only path in; missing is a real, distinct
  -- error, principle 5 (no silent defaults).
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'margin', p_date);
  if o is not null then
    v_margin := o; ov := array_append(ov, 'margin');
  elsif p.item_type = 'option' and p.parent_id is not null then
    select c.margin into parent_margin from tmsi.compute_price(p.parent_id, p_scope_type, p_scope_id, p_date) c;
    v_margin := parent_margin;
    if v_margin is null then err := array_append(err, 'missing margin grid'); v_margin := 0; end if;
  elsif p_scope_type = 'channel' then
    err := array_append(err, 'missing channel margin override'); v_margin := 0;
  else
    v_margin := tmsi.branch_margin(b.id, v_total_eur, p_date);
    if v_margin is null then err := array_append(err, 'missing margin grid'); v_margin := 0; end if;
  end if;

  -- list coefficient: branch scope byte-identical (branches.list_coef
  -- fallback). Channel scope: the Excel's channel formula has no list_coef
  -- term at all — neutral default 1 (never silently multiplies by a
  -- filial's own coefficient, which has no business meaning for a channel
  -- sale), overridable via the same 'coef' kind if that ever changes.
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'coef', p_date);
  if o is not null then v_coef := o; ov := array_append(ov, 'coef');
  elsif p_scope_type = 'channel' then v_coef := 1;
  else v_coef := b.list_coef; end if;

  -- reference price factor: "shared with branches" (item 4 of the gap
  -- analysis) means literally the same column, b.ref_factor — b is the
  -- origin branch for channel scope, so no separate channel-level setting
  -- to configure; still not a code constant, exactly as asked.
  v_min := tmsi.round_to(v_total / (1 - v_margin) * v_coef, (select rounding from tmsi.currencies where code = cur));
  v_ref := tmsi.round_to(v_min * b.ref_factor,               (select rounding from tmsi.currencies where code = cur));

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
-- 4. tmsi.v_branch_prices — the branch half is copied verbatim (same
--    products/branches cross join, same predicate, same lateral call shape
--    aside from the new literal 'branch' argument) — a channel half is
--    unioned alongside it, eligible exactly when the channel's OWN origin
--    branch would have been (sold_in/primary_branch), and active. Row
--    visibility for both halves is still entirely inside compute_price()
--    (security definer) — this view keeps security_invoker = true (0003),
--    unchanged, so RLS/the caller's own session still governs what a
--    lateral call actually returns.
--
--    tmsi.v_selling_prices (0001 §7) needs no change at all — it selects
--    from tmsi.v_branch_prices and filters status='active'; channel rows
--    flow through it automatically once this view includes them.
-- ---------------------------------------------------------------------------

create or replace view tmsi.v_branch_prices as
  select c.*
    from tmsi.products p
    cross join tmsi.branches b
    cross join lateral tmsi.compute_price(p.id, 'branch', b.id) c
   where b.id = any(p.sold_in) or b.id = p.primary_branch
  union all
  select c.*
    from tmsi.products p
    cross join tmsi.channels ch
    cross join lateral tmsi.compute_price(p.id, 'channel', ch.id) c
   where ch.active and (ch.branch_id = any(p.sold_in) or ch.branch_id = p.primary_branch);

-- Fresh objects (dropped above to clear the compute_price() dependency, not
-- ALTERed in place) lose any per-object setting the old ones had — both
-- security_invoker (0001 §7/0003) and the SELECT grant (0001 §8's `grant
-- all on all tables in schema tmsi to authenticated, service_role` only
-- ever ran once, against what existed at that moment) have to be reapplied
-- explicitly here, confirmed live by this migration's own BEGIN/ROLLBACK
-- validation rather than assumed from 0001's original ordering.
alter view tmsi.v_branch_prices set (security_invoker = true);
grant select on tmsi.v_branch_prices to authenticated, service_role;

-- tmsi.v_selling_prices — copied verbatim from 0001 §7, not changed at all;
-- recreated only because it depends on tmsi.v_branch_prices above.
create view tmsi.v_selling_prices as
  select v.product_id, p.name, p.category_id, p.item_type, p.status, v.branch_id, v.currency,
         v.min_price, v.ref_price, p.lead_time_days, p.unit
    from tmsi.v_branch_prices v join tmsi.products p on p.id = v.product_id
   where p.status = 'active';
alter view tmsi.v_selling_prices set (security_invoker = true);
grant select on tmsi.v_selling_prices to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Workflow (restriction 4 of the prompt): channel-scoped price_overrides
--    follow the SAME approval path as branch-scoped ones — proposals_insert
--    (RLS) is rewritten to also recognise a channel-scoped price_overrides
--    payload, admin/finance only (no branch_manager-equivalent role exists
--    for a channel), restricted to kind IN ('margin','transport') — fee/duty
--    are never legitimate for a channel (the engine hard-zeroes them
--    regardless, so allowing them to be proposed would be a dead,
--    confusing path); coef/fx are not part of the Excel's channel rule
--    either, left out rather than opened speculatively.
--
--    decide_price_proposal() (0007 §5) needs ONE change: its INSERT for
--    target_table='price_overrides' now reads scope_type/scope_id from the
--    payload instead of a bare branch_id. Its APPROVAL eligibility check
--    (has_role('admin') or (branch_manager AND pr.branch_id = any(my_branches())))
--    needs NO change at all — a channel id can never equal a member of
--    my_branches() (channels and branches are different id spaces), so a
--    channel-scoped proposal already falls through to admin-only approval
--    by the EXISTING logic, exactly the same mechanism 0007 already relies
--    on for exchange_rates/interco_fees/customs_rates (branch_id null there
--    for the identical reason: no branch identity to hang BM eligibility on).
-- ---------------------------------------------------------------------------

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
-- 6. tmsi.price_overrides read policy — the branch_manager clause moves to
--    scope_type='branch' explicitly (a channel id can never match
--    my_branches(), so this is a clarity change, not a behaviour change);
--    no new clause for 'agent' — an agent sees the RESULT (min_price/
--    ref_price via v_branch_prices) for their own channel, never the raw
--    override row, matching how 'sales' already works for branches today.
-- ---------------------------------------------------------------------------

drop policy overrides_read on tmsi.price_overrides;
create policy overrides_read on tmsi.price_overrides for select to authenticated
  using (
    (tmsi.can_read_costs() and (tmsi.has_role('admin') or tmsi.has_role('finance')
       or tmsi.has_role('product_manager') or tmsi.has_role('viewer')
       or (scope_type = 'branch' and scope_id = any(tmsi.my_branches()))))
    or (tmsi.has_role('logistics') and kind = 'duty')
  );

commit;
