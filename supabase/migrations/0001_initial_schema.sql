-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0001 — initial schema, derived from docs/TMSI_PriceManager_Estrutura_v2.md
-- Target: PostgreSQL 15 (Supabase self-hosted). Idempotent enough to re-run on an
-- empty database; never edit after it has been applied — add a new migration.

begin;

create schema if not exists tmsi;
comment on schema tmsi is 'TMSI Equipment Price Listing — core schema (proprietary)';

-- ---------------------------------------------------------------------------
-- 0. Enumerations
-- ---------------------------------------------------------------------------
create type tmsi.item_type      as enum ('equipment', 'spare_part', 'option', 'service');
create type tmsi.product_status as enum ('draft', 'pending', 'active', 'review', 'inactive', 'discontinued');
create type tmsi.customs_zone   as enum ('EU', 'CN', 'US', 'UK');
create type tmsi.override_kind  as enum ('fx', 'fee', 'transport', 'duty', 'margin', 'coef');
create type tmsi.role_code      as enum ('admin', 'product_manager', 'finance', 'branch_manager',
                                         'logistics', 'sales', 'agent', 'viewer');

-- ---------------------------------------------------------------------------
-- 1. Organisation (O1–O4)
-- ---------------------------------------------------------------------------
create table tmsi.currencies (
  code        char(3) primary key,
  rounding    numeric(10,2) not null default 1 check (rounding > 0),   -- O4: EUR/USD/GBP→1, CNY→10
  active      boolean not null default true
);

create table tmsi.branches (
  id            text primary key,                     -- 'SA','TBM','CORP','LTD'
  name          text not null,
  country       char(2) not null,
  currency      char(3) not null references tmsi.currencies,
  zone          tmsi.customs_zone not null,
  list_coef     numeric(6,3) not null default 1.000 check (list_coef > 0),   -- M4 default
  ref_factor    numeric(6,3) not null default 1.100 check (ref_factor > 0),  -- M5
  active        boolean not null default true
);

-- O2: a channel is a group of agents that sells through a parent branch with a margin delta
create table tmsi.channels (
  id            text primary key,                     -- 'APAC'
  name          text not null,
  branch_id     text not null references tmsi.branches,
  margin_delta  numeric(6,4) not null default 0,      -- APAC: -0.10 on TBM margin
  active        boolean not null default true
);

-- ---------------------------------------------------------------------------
-- 2. Engine parameters — single point of configuration (C, I, T, A, M)
-- ---------------------------------------------------------------------------
-- C1: EUR-based rates with effective date and source. 1 EUR = rate units of currency.
create table tmsi.exchange_rates (
  id              bigint generated always as identity primary key,
  currency        char(3) not null references tmsi.currencies,
  rate_per_eur    numeric(14,6) not null check (rate_per_eur > 0),
  effective_date  date not null,
  source          text not null,                      -- 'SAP' or a mandatory manual source
  created_by      uuid,
  created_at      timestamptz not null default now(),
  unique (currency, effective_date)
);

-- I1: supplier → seller interco fee matrix (default 20 %, diagonal 0 %)
create table tmsi.interco_fees (
  supplier_branch  text not null references tmsi.branches,
  seller_branch    text not null references tmsi.branches,
  fee              numeric(6,4) not null check (fee >= 0 and fee < 1),
  primary key (supplier_branch, seller_branch),
  check ((supplier_branch = seller_branch) = (fee = 0))
);

-- T1/T2: weight tiers per branch, in the branch currency
create table tmsi.transport_tiers (
  branch_id      text not null references tmsi.branches,
  tier           smallint not null check (tier between 1 and 3),
  max_weight_kg  numeric(10,2),                      -- null on the last tier (open-ended)
  cost           numeric(12,2) not null check (cost >= 0),
  currency       char(3) not null references tmsi.currencies,
  primary key (branch_id, tier)
);

-- A1: HS code × destination zone
create table tmsi.hs_codes (
  code         text primary key check (code ~ '^[0-9]{4,10}$'),
  description  text
);
create table tmsi.customs_rates (
  hs_code   text not null references tmsi.hs_codes,
  zone      tmsi.customs_zone not null,
  rate      numeric(6,4) not null check (rate >= 0 and rate < 1),
  primary key (hs_code, zone)
);

-- M1: margin grid per branch, 4 cost tiers, thresholds in EUR; margin on selling price (M2)
create table tmsi.margin_grids (
  branch_id      text not null references tmsi.branches,
  tier           smallint not null check (tier between 1 and 4),
  max_cost_eur   numeric(12,2),                      -- null on the last tier
  margin         numeric(6,4) not null check (margin >= 0 and margin < 1),
  primary key (branch_id, tier)
);

-- M3 + C3 + L4: global scalar settings
create table tmsi.settings (
  key    text primary key,
  value  jsonb not null,
  note   text
);

-- ---------------------------------------------------------------------------
-- 3. Catalogue (K)
-- ---------------------------------------------------------------------------
create table tmsi.categories (
  id        text primary key,
  name      text not null,
  parent_id text references tmsi.categories
);
create table tmsi.units      (code text primary key, name text);
create table tmsi.suppliers  (id text primary key, name text not null, country char(2));

create table tmsi.products (
  id                text primary key check (id ~ '^T-[0-9]{4}$'),   -- stable TMSI code
  name              text not null,
  description       text,
  category_id       text references tmsi.categories,
  item_type         tmsi.item_type not null,
  parent_id         text references tmsi.products,                -- required for options
  supplier_id       text references tmsi.suppliers,
  origin_country    char(2),
  currency          char(3) not null references tmsi.currencies,
  exw_price         numeric(14,2) not null,                        -- options may be negative (modifier)
  primary_branch    text not null references tmsi.branches,
  hs_code           text references tmsi.hs_codes,
  gross_weight_kg   numeric(10,2) check (gross_weight_kg is null or gross_weight_kg >= 0),
  net_weight_kg     numeric(10,2),
  volume_m3         numeric(10,4),
  dimensions        text,
  palletizable      boolean,
  pallets           smallint check (pallets is null or pallets >= 0),
  stackable         boolean,
  unit              text references tmsi.units,
  lead_time_days    integer check (lead_time_days is null or lead_time_days >= 0),
  sap_code_sa       text unique,
  sap_code_cn       text unique,
  sap_code_us       text unique,
  sap_code_uk       text unique,
  status            tmsi.product_status not null default 'draft',
  sold_in           text[] not null default '{}',                 -- branch ids
  last_reviewed_at  date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  check (item_type <> 'option' or parent_id is not null),
  check (item_type = 'option' or exw_price >= 0),
  check (parent_id is null or parent_id <> id)
);
create index on tmsi.products (status);
create index on tmsi.products (primary_branch);
create index on tmsi.products using gin (sold_in);

-- HS default per article with override per subsidiary / channel / agent (A4)
create table tmsi.product_hs_overrides (
  product_id  text not null references tmsi.products on delete cascade,
  scope_type  text not null check (scope_type in ('branch', 'channel', 'agent')),
  scope_id    text not null,
  hs_code     text not null references tmsi.hs_codes,
  reason      text not null,
  primary key (product_id, scope_type, scope_id)
);

-- Principle 5: no silent defaults — activation is blocked when mandatory data is missing
create or replace function tmsi.check_activation_requirements()
returns trigger language plpgsql as $$
begin
  if new.status in ('active', 'review') then
    -- options and services carry no duty (§2.2), so no HS code is required for them
    if new.item_type not in ('service', 'option') and new.hs_code is null then
      raise exception 'Product % cannot be % without an HS code', new.id, new.status;
    end if;
    if new.item_type in ('equipment', 'spare_part') and new.gross_weight_kg is null then
      raise exception 'Product % cannot be % without a gross weight', new.id, new.status;
    end if;
    if new.unit is null then
      raise exception 'Product % cannot be % without a unit', new.id, new.status;
    end if;
    if (new.primary_branch = 'SA'   and new.sap_code_sa is null)
    or (new.primary_branch = 'TBM'  and new.sap_code_cn is null)
    or (new.primary_branch = 'CORP' and new.sap_code_us is null)
    or (new.primary_branch = 'LTD'  and new.sap_code_uk is null) then
      raise exception 'Product % cannot be % without the SAP code of its supplying branch', new.id, new.status;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_products_activation
  before insert or update on tmsi.products
  for each row execute function tmsi.check_activation_requirements();

-- ---------------------------------------------------------------------------
-- 4. Overrides — replace an engine INPUT, never a result (principle 4)
-- ---------------------------------------------------------------------------
create table tmsi.price_overrides (
  id           bigint generated always as identity primary key,
  product_id   text not null references tmsi.products on delete cascade,
  branch_id    text not null references tmsi.branches,
  kind         tmsi.override_kind not null,
  value        numeric(14,6) not null,
  reason       text not null,
  valid_from   date not null default current_date,
  valid_to     date,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index on tmsi.price_overrides (product_id, branch_id, kind);

-- ---------------------------------------------------------------------------
-- 5. History and audit (principle 6)
-- ---------------------------------------------------------------------------
create table tmsi.price_versions (
  id           bigint generated always as identity primary key,
  product_id   text not null references tmsi.products on delete cascade,
  version      integer not null,
  currency     char(3) not null,
  exw_price    numeric(14,2) not null,
  changed_by   uuid,
  changed_at   timestamptz not null default now(),
  note         text,
  unique (product_id, version)
);

-- AFTER trigger: the product row must exist before the version references it
create or replace function tmsi.record_exw_version()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.exw_price is distinct from old.exw_price
                      or new.currency  is distinct from old.currency then
    insert into tmsi.price_versions (product_id, version, currency, exw_price, changed_by)
    select new.id,
           coalesce(max(version), 0) + 1,
           new.currency, new.exw_price, new.updated_by
      from tmsi.price_versions where product_id = new.id;
  end if;
  return null;
end $$;
create trigger trg_products_exw_version
  after insert or update of exw_price, currency on tmsi.products
  for each row execute function tmsi.record_exw_version();

-- L3: an EXW change on an active product opens a review (BEFORE, so the row is rewritten)
create or replace function tmsi.open_review_on_exw_change()
returns trigger language plpgsql as $$
begin
  if old.status = 'active' and new.status = 'active'
     and (new.exw_price is distinct from old.exw_price or new.currency is distinct from old.currency) then
    new.status := 'review';
  end if;
  return new;
end $$;
create trigger trg_products_exw_review
  before update of exw_price, currency on tmsi.products
  for each row execute function tmsi.open_review_on_exw_change();

create table tmsi.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  table_name  text not null,
  row_pk      text not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_row     jsonb,
  new_row     jsonb
);
create index on tmsi.audit_log (table_name, row_pk);
create index on tmsi.audit_log (at desc);

create or replace function tmsi.audit()
returns trigger language plpgsql security definer as $$
declare pk text;
begin
  pk := coalesce(to_jsonb(coalesce(new, old))->>'id',
                 to_jsonb(coalesce(new, old))::text);
  insert into tmsi.audit_log (actor, table_name, row_pk, action, old_row, new_row)
  values (auth.uid(), tg_table_name, pk, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['products','price_overrides','exchange_rates','interco_fees',
                           'transport_tiers','customs_rates','margin_grids','branches',
                           'channels','settings','product_hs_overrides'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on tmsi.%1$s
                    for each row execute function tmsi.audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Users and roles (U1–U4) — profiles mirror auth.users; roles are scoped
-- ---------------------------------------------------------------------------
create table tmsi.profiles (
  user_id     uuid primary key references auth.users on delete cascade,
  full_name   text,
  email       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table tmsi.user_roles (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references tmsi.profiles on delete cascade,
  role        tmsi.role_code not null,
  branch_id   text references tmsi.branches,        -- scope for branch_manager / sales
  channel_id  text references tmsi.channels,        -- scope for agent
  check (role <> 'branch_manager' or branch_id is not null),
  check (role <> 'sales'          or branch_id is not null),
  check (role <> 'agent'          or channel_id is not null)
);
-- one row per (user, role, scope); NULL scopes are treated as equal
create unique index user_roles_uniq on tmsi.user_roles
  (user_id, role, coalesce(branch_id, ''), coalesce(channel_id, ''));

-- helper predicates used by RLS policies
create or replace function tmsi.has_role(r tmsi.role_code)
returns boolean language sql stable security definer as $$
  select exists (select 1 from tmsi.user_roles where user_id = auth.uid() and role = r);
$$;
create or replace function tmsi.my_branches()
returns text[] language sql stable security definer as $$
  select coalesce(array_agg(distinct branch_id) filter (where branch_id is not null), '{}')
    from tmsi.user_roles where user_id = auth.uid();
$$;
create or replace function tmsi.my_channels()
returns text[] language sql stable security definer as $$
  select coalesce(array_agg(distinct channel_id) filter (where channel_id is not null), '{}')
    from tmsi.user_roles where user_id = auth.uid();
$$;
create or replace function tmsi.can_read_costs()
returns boolean language sql stable security definer as $$
  select tmsi.has_role('admin') or tmsi.has_role('product_manager') or tmsi.has_role('finance')
      or tmsi.has_role('branch_manager') or tmsi.has_role('viewer');
$$;

-- ---------------------------------------------------------------------------
-- 7. Pricing engine (§2.2) — one function, one row per product × branch
-- ---------------------------------------------------------------------------
create or replace function tmsi.fx_rate(p_currency char(3), p_date date default current_date)
returns numeric language sql stable security definer set search_path = tmsi, public as $$
  select rate_per_eur from tmsi.exchange_rates
   where currency = p_currency and effective_date <= p_date
   order by effective_date desc limit 1;
$$;

create or replace function tmsi.round_to(v numeric, step numeric)
returns numeric language sql immutable as $$ select round(v / step) * step; $$;

create or replace function tmsi.override_value(p_product text, p_branch text, p_kind tmsi.override_kind,
                                               p_date date default current_date)
returns numeric language sql stable security definer set search_path = tmsi, public as $$
  select value from tmsi.price_overrides
   where product_id = p_product and branch_id = p_branch and kind = p_kind
     and valid_from <= p_date and (valid_to is null or valid_to >= p_date)
   order by created_at desc limit 1;
$$;

create or replace function tmsi.branch_margin(p_branch text, p_cost_eur numeric)
returns numeric language sql stable security definer set search_path = tmsi, public as $$
  select margin from tmsi.margin_grids
   where branch_id = p_branch and (max_cost_eur is null or p_cost_eur < max_cost_eur)
   order by tier limit 1;
$$;

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

  -- caller scoping (§4): who may see costs for this branch, who may only see selling prices
  see_costs := tmsi.has_role('admin') or tmsi.has_role('product_manager') or tmsi.has_role('finance')
            or tmsi.has_role('viewer')
            or (tmsi.has_role('branch_manager') and b.id = any(tmsi.my_branches()));
  see_sell  := see_costs or tmsi.has_role('logistics')
            or (tmsi.has_role('sales') and b.id = any(tmsi.my_branches()))
            or (tmsi.has_role('agent') and b.id in (select ch.branch_id from tmsi.channels ch where ch.id = any(tmsi.my_channels())));
  if auth.uid() is not null and not see_sell then return; end if;      -- outside the caller's scope
  if auth.uid() is not null and not see_costs and p.status <> 'active' then return; end if;

  -- FX: product currency → branch currency via EUR base
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

  -- interco fee
  o := tmsi.override_value(p.id, b.id, 'fee', p_date);
  if o is not null then v_fee := o; ov := array_append(ov, 'fee');
  elsif p.primary_branch = b.id then v_fee := 0;
  else
    select f.fee into v_fee from tmsi.interco_fees f
     where f.supplier_branch = p.primary_branch and f.seller_branch = b.id;
    if v_fee is null then err := array_append(err, 'missing interco fee'); v_fee := 0; end if;
  end if;
  v_interco := v_exw_local * (1 + v_fee);

  -- transport
  o := tmsi.override_value(p.id, b.id, 'transport', p_date);
  if o is not null then v_transport := o; ov := array_append(ov, 'transport');
  elsif p.primary_branch = b.id or p.item_type in ('option', 'service') then v_transport := 0;
  else
    select t.cost into v_transport from tmsi.transport_tiers t
     where t.branch_id = b.id and (t.max_weight_kg is null or p.gross_weight_kg < t.max_weight_kg)
     order by t.tier limit 1;
    if v_transport is null then err := array_append(err, 'missing transport tier / weight'); v_transport := 0; end if;
  end if;

  -- customs duty (no silent 5 % default)
  o := tmsi.override_value(p.id, b.id, 'duty', p_date);
  if o is not null then v_duty_rate := o; ov := array_append(ov, 'duty');
  elsif p.primary_branch = b.id or p.item_type in ('option', 'service') then v_duty_rate := 0;
  else
    select c.rate into v_duty_rate from tmsi.customs_rates c
     where c.hs_code = coalesce(
             (select h.hs_code from tmsi.product_hs_overrides h
               where h.product_id = p.id and h.scope_type = 'branch' and h.scope_id = b.id),
             p.hs_code)
       and c.zone = b.zone;
    if v_duty_rate is null then err := array_append(err, 'missing customs rate for HS/zone'); v_duty_rate := 0; end if;
  end if;
  v_duty  := v_interco * v_duty_rate;
  v_total := v_interco + v_transport + v_duty;
  v_total_eur := case when cur = 'EUR' then v_total
                      else v_total / coalesce(tmsi.fx_rate(cur, p_date), 1) end;

  -- margin: options inherit the parent's; others read the branch grid
  o := tmsi.override_value(p.id, b.id, 'margin', p_date);
  if o is not null then v_margin := o; ov := array_append(ov, 'margin');
  elsif p.item_type = 'option' and p.parent_id is not null then
    select c.margin into parent_margin from tmsi.compute_price(p.parent_id, b.id, p_date) c;
    v_margin := parent_margin;
  else
    v_margin := tmsi.branch_margin(b.id, v_total_eur);
  end if;
  if v_margin is null then err := array_append(err, 'missing margin grid'); v_margin := 0; end if;

  -- list coefficient and prices
  o := tmsi.override_value(p.id, b.id, 'coef', p_date);
  if o is not null then v_coef := o; ov := array_append(ov, 'coef'); else v_coef := b.list_coef; end if;

  v_min := tmsi.round_to(v_total / (1 - v_margin) * v_coef, (select rounding from tmsi.currencies where code = cur));
  v_ref := tmsi.round_to(v_min * b.ref_factor,               (select rounding from tmsi.currencies where code = cur));

  select (value->>0)::numeric into min_m from tmsi.settings where key = 'margin_min';
  select (value->>0)::numeric into tgt_m from tmsi.settings where key = 'margin_target';

  if auth.uid() is not null and not see_costs then
    -- U4: sales / agent / logistics never see costs, fees, margins or overrides
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

-- Per-branch computed list: every product × every branch it is sold in (never stored).
-- Scoping is enforced inside compute_price() (security definer): rows outside the
-- caller's branches are not returned, and cost columns are NULL for sales/agent/logistics.
create or replace view tmsi.v_branch_prices as
  select c.*
    from tmsi.products p
    cross join tmsi.branches b
    cross join lateral tmsi.compute_price(p.id, b.id) c
   where b.id = any(p.sold_in) or b.id = p.primary_branch;

-- Sales / agent view — selling prices only (U4)
create or replace view tmsi.v_selling_prices as
  select v.product_id, p.name, p.category_id, p.item_type, p.status, v.branch_id, v.currency,
         v.min_price, v.ref_price, p.lead_time_days, p.unit
    from tmsi.v_branch_prices v join tmsi.products p on p.id = v.product_id
   where p.status = 'active';

-- ---------------------------------------------------------------------------
-- 8. Row Level Security — scaffolding; per-table write policies follow in 0002
-- ---------------------------------------------------------------------------
alter table tmsi.products         enable row level security;
alter table tmsi.price_overrides  enable row level security;
alter table tmsi.exchange_rates   enable row level security;
alter table tmsi.interco_fees     enable row level security;
alter table tmsi.transport_tiers  enable row level security;
alter table tmsi.customs_rates    enable row level security;
alter table tmsi.margin_grids     enable row level security;
alter table tmsi.settings         enable row level security;
alter table tmsi.audit_log        enable row level security;
alter table tmsi.price_versions   enable row level security;
alter table tmsi.profiles         enable row level security;
alter table tmsi.user_roles       enable row level security;

-- product.read (§4): admin/pm/finance/logistics/viewer → all; branch_manager → own branches;
-- sales → own branches, active only; agent → channel's branch, active only
create policy products_read on tmsi.products for select to authenticated using (
     tmsi.has_role('admin') or tmsi.has_role('product_manager') or tmsi.has_role('finance')
  or tmsi.has_role('logistics') or tmsi.has_role('viewer')
  or (tmsi.has_role('branch_manager') and (primary_branch = any(tmsi.my_branches()) or sold_in && tmsi.my_branches()))
  or (tmsi.has_role('sales') and status = 'active' and sold_in && tmsi.my_branches())
  or (tmsi.has_role('agent') and status = 'active'
      and sold_in && (select coalesce(array_agg(branch_id), '{}') from tmsi.channels where id = any(tmsi.my_channels())))
);
create policy products_write_pm on tmsi.products for all to authenticated
  using (tmsi.has_role('admin') or tmsi.has_role('product_manager'))
  with check (tmsi.has_role('admin') or tmsi.has_role('product_manager'));

create policy config_read on tmsi.exchange_rates  for select to authenticated using (tmsi.can_read_costs());
create policy config_read on tmsi.interco_fees    for select to authenticated using (tmsi.can_read_costs());
create policy config_read on tmsi.transport_tiers for select to authenticated using (tmsi.can_read_costs() or tmsi.has_role('logistics'));
create policy config_read on tmsi.customs_rates   for select to authenticated using (tmsi.can_read_costs() or tmsi.has_role('logistics'));
create policy config_read on tmsi.margin_grids    for select to authenticated using (tmsi.can_read_costs());
create policy config_read on tmsi.settings        for select to authenticated using (true);
create policy config_write on tmsi.exchange_rates for all to authenticated using (tmsi.has_role('admin') or tmsi.has_role('finance')) with check (tmsi.has_role('admin') or tmsi.has_role('finance'));
create policy config_write on tmsi.interco_fees   for all to authenticated using (tmsi.has_role('admin') or tmsi.has_role('finance')) with check (tmsi.has_role('admin') or tmsi.has_role('finance'));
create policy config_write on tmsi.margin_grids   for all to authenticated using (tmsi.has_role('admin') or tmsi.has_role('finance')) with check (tmsi.has_role('admin') or tmsi.has_role('finance'));
create policy config_write on tmsi.settings       for all to authenticated using (tmsi.has_role('admin') or tmsi.has_role('finance')) with check (tmsi.has_role('admin') or tmsi.has_role('finance'));
create policy config_write on tmsi.transport_tiers for all to authenticated using (tmsi.has_role('admin') or tmsi.has_role('finance') or tmsi.has_role('logistics')) with check (tmsi.has_role('admin') or tmsi.has_role('finance') or tmsi.has_role('logistics'));
create policy config_write on tmsi.customs_rates  for all to authenticated using (tmsi.has_role('admin') or tmsi.has_role('finance') or tmsi.has_role('logistics')) with check (tmsi.has_role('admin') or tmsi.has_role('finance') or tmsi.has_role('logistics'));

create policy overrides_read on tmsi.price_overrides for select to authenticated
  using (tmsi.can_read_costs() and (tmsi.has_role('admin') or tmsi.has_role('finance')
         or tmsi.has_role('product_manager') or tmsi.has_role('viewer') or branch_id = any(tmsi.my_branches())));
create policy overrides_write on tmsi.price_overrides for all to authenticated
  using (tmsi.has_role('admin') or tmsi.has_role('finance')
         or (tmsi.has_role('branch_manager') and branch_id = any(tmsi.my_branches()) and kind in ('transport','margin','coef'))
         or (tmsi.has_role('logistics') and kind = 'duty'))
  with check (tmsi.has_role('admin') or tmsi.has_role('finance')
         or (tmsi.has_role('branch_manager') and branch_id = any(tmsi.my_branches()) and kind in ('transport','margin','coef'))
         or (tmsi.has_role('logistics') and kind = 'duty'));

create policy audit_read on tmsi.audit_log for select to authenticated
  using (tmsi.has_role('admin') or tmsi.has_role('finance') or tmsi.has_role('viewer') or tmsi.has_role('branch_manager'));
create policy versions_read on tmsi.price_versions for select to authenticated using (tmsi.can_read_costs());
create policy profiles_self on tmsi.profiles for select to authenticated using (user_id = auth.uid() or tmsi.has_role('admin'));
create policy profiles_admin on tmsi.profiles for all to authenticated using (tmsi.has_role('admin')) with check (tmsi.has_role('admin'));
create policy roles_self on tmsi.user_roles for select to authenticated using (user_id = auth.uid() or tmsi.has_role('admin'));
create policy roles_admin on tmsi.user_roles for all to authenticated using (tmsi.has_role('admin')) with check (tmsi.has_role('admin'));

-- reference tables: readable by everyone signed in, writable by admin
do $$
declare t text;
begin
  foreach t in array array['currencies','branches','channels','hs_codes','categories','units','suppliers','product_hs_overrides'] loop
    execute format('alter table tmsi.%1$s enable row level security', t);
    execute format('create policy ref_read  on tmsi.%1$s for select to authenticated using (true)', t);
    execute format('create policy ref_write on tmsi.%1$s for all to authenticated using (tmsi.has_role(''admin'')) with check (tmsi.has_role(''admin''))', t);
  end loop;
end $$;

-- expose the schema through PostgREST
grant usage on schema tmsi to anon, authenticated, service_role;
grant all on all tables in schema tmsi to authenticated, service_role;
grant select on tmsi.settings to anon;
grant execute on all functions in schema tmsi to authenticated, service_role;
-- compute_price() is self-protecting (definer + caller scoping); its helpers stay internal
revoke execute on function tmsi.override_value(text, text, tmsi.override_kind, date) from public, anon;
revoke execute on function tmsi.branch_margin(text, numeric) from public, anon;
revoke execute on function tmsi.compute_price(text, text, date) from anon;
alter view tmsi.v_branch_prices  set (security_invoker = true);
alter view tmsi.v_selling_prices set (security_invoker = true);
alter default privileges in schema tmsi grant all on tables to authenticated, service_role;
alter default privileges in schema tmsi grant execute on functions to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Reference data — starting values from the spec (§3), NOT real product data
-- ---------------------------------------------------------------------------
insert into tmsi.currencies (code, rounding) values ('EUR',1), ('USD',1), ('GBP',1), ('CNY',10);

insert into tmsi.branches (id, name, country, currency, zone) values
  ('SA',   'Condat SA',   'FR', 'EUR', 'EU'),
  ('TBM',  'Condat TBM',  'CN', 'CNY', 'CN'),
  ('CORP', 'Condat Corp', 'US', 'USD', 'US'),
  ('LTD',  'Condat Ltd',  'GB', 'GBP', 'UK');

insert into tmsi.channels (id, name, branch_id, margin_delta) values ('APAC', 'APAC Agents', 'TBM', -0.10);

insert into tmsi.exchange_rates (currency, rate_per_eur, effective_date, source) values
  ('CNY', 8.2576, '2025-11-01', 'SAP'),
  ('USD', 1.1587, '2025-11-01', 'SAP'),
  ('GBP', 0.8689, '2025-11-01', 'SAP');

insert into tmsi.interco_fees
  select s.id, b.id, case when s.id = b.id then 0 else 0.20 end
    from tmsi.branches s cross join tmsi.branches b;

insert into tmsi.transport_tiers (branch_id, tier, max_weight_kg, cost, currency) values
  ('SA',1,30,75,'EUR'),   ('SA',2,100,200,'EUR'),   ('SA',3,null,400,'EUR'),
  ('TBM',1,30,50,'CNY'),  ('TBM',2,100,150,'CNY'),  ('TBM',3,null,300,'CNY'),   -- T2: currency to confirm
  ('CORP',1,30,100,'USD'),('CORP',2,100,250,'USD'), ('CORP',3,null,500,'USD'),
  ('LTD',1,30,80,'GBP'),  ('LTD',2,100,220,'GBP'),  ('LTD',3,null,450,'GBP');

insert into tmsi.margin_grids (branch_id, tier, max_cost_eur, margin) values
  ('SA',1,100,0.60),  ('SA',2,1000,0.50),  ('SA',3,5000,0.35),  ('SA',4,null,0.30),
  ('CORP',1,100,0.60),('CORP',2,1000,0.50),('CORP',3,5000,0.35),('CORP',4,null,0.30),
  ('LTD',1,100,0.60), ('LTD',2,1000,0.50), ('LTD',3,5000,0.35), ('LTD',4,null,0.30),
  ('TBM',1,100,0.70), ('TBM',2,1000,0.60), ('TBM',3,5000,0.50), ('TBM',4,null,0.35);

insert into tmsi.settings (key, value, note) values
  ('margin_min',    '0.15', 'M3 — below this the alert is critical'),
  ('margin_target', '0.25', 'M3 — below this the alert is warning'),
  ('margin_good',   '0.35', 'M3'),
  ('fx_tolerance',  '0.03', 'C3 — FX move that opens a price review (to confirm)'),
  ('review_days',   '90',   'L4 — periodic review'),
  ('fx_source',     '"SAP"','C1 — default rate source');

insert into tmsi.units (code, name) values ('PCS','piece'),('SET','set'),('KG','kilogram'),('L','litre'),('M','metre'),('MONTH','month');

insert into tmsi.categories (id, name, parent_id) values
  ('FOAM_SYS','Foam systems',null), ('FOAM_GEN','Foam generators',null), ('PUMPS','Pumps',null),
  ('BRUSH','Brush systems',null), ('ACCESS','Accessories',null), ('DIGITAL','Digital services',null);

commit;
