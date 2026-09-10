-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0012 — interco margin becomes a property of the article, not of
-- the (supplier_branch, seller_branch) pair. Pedro's own words (2026-09-10
-- session, comparing the real paridade sample against the engine): "ela
-- representa a comissão obtida pela filial de origem para comprar o produto
-- e o vender às restantes filiais" — a single value per article, the same
-- regardless of which branch is buying, variable article to article, never
-- charged when the selling branch is the article's own origin branch (that
-- last rule is already correct in the engine since 0001 — only the SOURCE
-- of the value changes here, not the zero-when-self-selling rule).
--
-- tmsi.interco_fees (per supplier_branch/seller_branch pair, 0001) is left
-- in place with its history intact — audit trail, never dropped — but the
-- engine stops reading it as of this migration. Its /config proposal UI is
-- removed in the same app commit as this migration (config/page.tsx,
-- forms.tsx, actions.ts, propose-change.ts) since a config screen the
-- engine no longer reads would be actively misleading, not merely unused.
--
-- Never edit 0001-0011 (already applied). This file is additive.

-- ---------------------------------------------------------------------------
-- 1. tmsi.products gains interco_margin. Same domain tmsi.interco_fees.fee
--    already had (0001): numeric(6,4), 0 <= x < 1. `not null default 0` so
--    the 13 real products already in the catalogue keep working (0%
--    interco margin, same behaviour as "fee row missing" gave before this
--    migration) until Pedro fills in the real value per article.
alter table tmsi.products
  add column interco_margin numeric(6,4) not null default 0
    check (interco_margin >= 0 and interco_margin < 1);

-- ---------------------------------------------------------------------------
-- 1b. tmsi.v_products (0003/0004/0010) gains interco_margin, same cost tier
--     as exw_price (gated by can_read_costs()) — it is exactly as
--     commercially sensitive. Postgres will not let CREATE OR REPLACE VIEW
--     insert a column mid-list (view columns are positional; confirmed live
--     — "cannot change name of view column ... to interco_margin" when
--     tried right after exw_price) so it is appended at the very end of
--     the select list instead, same column list/order as 0010's own
--     create-or-replace otherwise, unchanged. (Also confirmed live: this
--     view is owned by `postgres`, not `supabase_admin` — the 0010-era
--     ownership quirk does not apply here, plain `-U postgres` is enough.)
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
    case when tmsi.can_read_costs() then updated_by end as updated_by,
    case when tmsi.can_read_costs() then interco_margin end as interco_margin
  from tmsi.products
  where tmsi.products_visible(primary_branch, sold_in, status);

-- ---------------------------------------------------------------------------
-- 2. compute_price() — byte-identical to 0010 except the interco fee
--    sourcing block (was: override -> flat-priced=0 -> channel=0 ->
--    self-sale=0 -> else lookup tmsi.interco_fees(primary_branch, b.id),
--    missing-row error). Same signature, same return shape as 0009/0010 —
--    a plain create or replace, no view drops needed (nothing here touches
--    tmsi.v_products or any other dependent view).
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
  bp  tmsi.branch_pricing_params%rowtype;  -- (E, 0010) latest ref_factor/list_coef for b
  see_costs boolean; see_sell boolean;
  cur char(3);
  fx_prod numeric; fx_branch numeric;
  v_fee numeric; v_transport numeric; v_duty_rate numeric; v_margin numeric; v_coef numeric;
  v_exw_local numeric; v_interco numeric; v_duty numeric; v_total numeric; v_total_eur numeric;
  v_min numeric; v_ref numeric; ov text[] := '{}'; err text[] := '{}'; o numeric;
  min_m numeric; tgt_m numeric;
  v_round_step numeric;
  is_flat_priced boolean;  -- (0010-B): option/service, margin zero, fee zero
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

  select bpp.* into bp from tmsi.branch_pricing_params bpp
   where bpp.branch_id = b.id and bpp.effective_date <= p_date
   order by bpp.effective_date desc, bpp.created_at desc limit 1;

  select crp.rounding into v_round_step from tmsi.currency_rounding_params crp
   where crp.currency = cur and crp.effective_date <= p_date
   order by crp.effective_date desc, crp.created_at desc limit 1;

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

  -- interco fee (0012): now the article's own tmsi.products.interco_margin
  -- — a single value per article, not looked up per (origin, destination)
  -- branch pair any more (tmsi.interco_fees kept for history, no longer
  -- read here). Same priority order as before this migration: an explicit
  -- override still wins over everything, flat-priced items and channel
  -- scope still hard-zero, and selling from the article's own origin
  -- branch still never charges itself. The "missing interco fee" error is
  -- gone with it — interco_margin is not null on every article, so this
  -- branch of the if/elsif can no longer fail to produce a value.
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
    v_fee := p.interco_margin;
  end if;
  v_interco := v_exw_local * (1 + v_fee);

  -- transport: byte-identical to 0009/0010.
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

  -- customs duty: byte-identical to 0009/0010.
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

  -- margin: byte-identical to 0010.
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

  -- list coefficient: byte-identical to 0010.
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'coef', p_date);
  if o is not null then v_coef := o; ov := array_append(ov, 'coef');
  elsif p_scope_type = 'channel' then v_coef := 1;
  else v_coef := bp.list_coef; end if;

  -- rounding: byte-identical to 0010.
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
