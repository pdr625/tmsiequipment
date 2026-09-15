-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0013 — bulk import (item 39). Two shapes, one shared batch/undo
-- mechanism: tmsi.run_import_hs_duty() for the HS-code/customs-duty reference
-- payload (item 38 left 12 codes + 48 rates unloaded); tmsi.run_import_products()
-- for products + their per-scope config (transport/margin overrides), the same
-- shape the paridade CSV already uses, one row per product x scope.
--
-- Decision (restriction 1 of the item 39 prompt, design of 2026-09-06, dated and
-- registered here for the first time): the INITIAL bulk load writes DIRECTLY —
-- bypassing tmsi.price_proposals entirely, same exception already used once for
-- the item 38 config seed and, before the 0007 workflow existed at all, for the
-- original fixture seed in this same migration set. A SECOND mode — later
-- imports going through price_proposals as a single grouped proposal — depends
-- on batch approval existing at all (item 44, not designed, not implemented
-- here) and is explicitly deferred, not invented as a third mode.
--
-- Never edit 0001-0012 (already applied). This file is additive.

-- ---------------------------------------------------------------------------
-- 1. Batch tracking + undo. Row-level, not table-level: old_row null means the
--    row was inserted by this batch (undo = delete it); old_row non-null means
--    an existing row was updated (undo = restore old_row). This is what makes
--    "prove the undo, not just the do" (restriction 6) checkable against an
--    UPSERT, not just a pure insert.
-- ---------------------------------------------------------------------------

create table tmsi.import_batches (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('products', 'hs_duty')),
  source_filename text,
  reason          text not null,
  row_count       integer not null,
  status          text not null default 'committed' check (status in ('committed', 'reverted')),
  created_at      timestamptz not null default clock_timestamp(),
  created_by      uuid,
  reverted_at     timestamptz,
  reverted_by     uuid
);

create table tmsi.import_batch_items (
  id            bigint generated always as identity primary key,
  batch_id        uuid not null references tmsi.import_batches(id),
  target_table  text not null,
  target_pk     jsonb not null,
  old_row       jsonb,
  new_row       jsonb not null,
  created_at    timestamptz not null default clock_timestamp()
);
create index import_batch_items_batch_id_idx on tmsi.import_batch_items(batch_id);

alter table tmsi.import_batches enable row level security;
alter table tmsi.import_batch_items enable row level security;

-- Admin-only read (this is an ops/audit surface, not a role-scoped one like
-- price_overrides). No direct-write policy for either — the only writers are
-- the SECURITY DEFINER functions below, same shape audit_log already uses
-- (no app-level INSERT policy on audit_log either, only tmsi.audit()).
create policy import_batches_read on tmsi.import_batches for select
  to authenticated using (tmsi.has_role('admin'));
create policy import_batch_items_read on tmsi.import_batch_items for select
  to authenticated using (tmsi.has_role('admin'));

grant select on tmsi.import_batches, tmsi.import_batch_items to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. tmsi.run_import_hs_duty() — the payload item 38 left unloaded: HS code +
--    description + a single duty rate, written to all 4 zones (restriction:
--    every customs_rates row in this schema is zone-uniform today, confirmed
--    without exception in item 38 — no zone-specific-rate input accepted).
--
--    p_rows shape: [{"hs_code": "...", "description": "...", "rate": 0.017}, ...]
-- ---------------------------------------------------------------------------

create or replace function tmsi.run_import_hs_duty(
  p_rows jsonb, p_dry_run boolean, p_filename text, p_reason text
) returns jsonb language plpgsql security definer set search_path = tmsi, public as $$
declare
  row_obj jsonb;
  idx int := 0;
  hs text; descr text; rate numeric;
  cur_descr text; cur_rate numeric;
  errors jsonb := '[]'::jsonb;
  to_create jsonb := '[]'::jsonb;
  to_update jsonb := '[]'::jsonb;
  unchanged jsonb := '[]'::jsonb;
  v_batch_id uuid;
  zone_row tmsi.customs_zone;
  n int;
begin
  if not tmsi.has_role('admin') then
    raise exception 'Forbidden';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Empty import file';
  end if;

  for row_obj in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    hs := nullif(trim(row_obj->>'hs_code'), '');
    descr := nullif(trim(row_obj->>'description'), '');
    if hs is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'hs_code', 'reason', 'em falta');
      continue;
    end if;
    if hs !~ '^[0-9]{4,10}$' then
      errors := errors || jsonb_build_object('row', idx, 'column', 'hs_code', 'reason', 'formato inválido (4-10 dígitos)');
      continue;
    end if;
    if descr is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'description', 'reason', 'em falta');
      continue;
    end if;
    if row_obj->>'rate' is null or trim(row_obj->>'rate') = '' then
      errors := errors || jsonb_build_object('row', idx, 'column', 'rate', 'reason', 'em falta (célula vazia nunca é 0 — restrição 4)');
      continue;
    end if;
    begin
      rate := (row_obj->>'rate')::numeric;
    exception when others then
      errors := errors || jsonb_build_object('row', idx, 'column', 'rate', 'reason', 'não é um número');
      continue;
    end;
    if rate < 0 or rate >= 1 then
      errors := errors || jsonb_build_object('row', idx, 'column', 'rate', 'reason', 'fora do intervalo [0,1)');
      continue;
    end if;

    select hc.description into cur_descr from tmsi.hs_codes hc where hc.code = hs;
    select cr.rate into cur_rate from tmsi.customs_rates cr
     where cr.hs_code = hs and cr.zone = 'EU' and cr.effective_date <= current_date
     order by cr.effective_date desc, cr.created_at desc limit 1;

    if cur_descr is null then
      to_create := to_create || jsonb_build_object('hs_code', hs, 'description', descr, 'rate', rate);
    elsif cur_descr is distinct from descr or cur_rate is distinct from rate then
      to_update := to_update || jsonb_build_object('hs_code', hs, 'description', descr, 'rate', rate,
                     'was_description', cur_descr, 'was_rate', cur_rate);
    else
      unchanged := unchanged || jsonb_build_object('hs_code', hs, 'description', descr, 'rate', rate);
    end if;
  end loop;

  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', errors,
      'to_create', jsonb_array_length(to_create), 'to_update', jsonb_array_length(to_update),
      'unchanged', jsonb_array_length(unchanged));
  end if;

  if p_dry_run then
    return jsonb_build_object('ok', true, 'dry_run', true,
      'to_create', to_create, 'to_update', to_update, 'unchanged', unchanged);
  end if;

  insert into tmsi.import_batches (kind, source_filename, reason, row_count, created_by)
  values ('hs_duty', p_filename, p_reason, jsonb_array_length(p_rows), auth.uid())
  returning id into v_batch_id;

  for row_obj in select * from jsonb_array_elements(to_create || to_update) loop
    hs := row_obj->>'hs_code'; descr := row_obj->>'description'; rate := (row_obj->>'rate')::numeric;

    select description into cur_descr from tmsi.hs_codes where code = hs;
    if cur_descr is null then
      insert into tmsi.hs_codes (code, description) values (hs, descr);
      insert into tmsi.import_batch_items (batch_id, target_table, target_pk, old_row, new_row)
      values (v_batch_id, 'hs_codes', jsonb_build_object('code', hs), null, jsonb_build_object('code', hs, 'description', descr));
    elsif cur_descr is distinct from descr then
      insert into tmsi.import_batch_items (batch_id, target_table, target_pk, old_row, new_row)
      values (v_batch_id, 'hs_codes', jsonb_build_object('code', hs),
              jsonb_build_object('code', hs, 'description', cur_descr), jsonb_build_object('code', hs, 'description', descr));
      update tmsi.hs_codes set description = descr where code = hs;
    end if;

    for zone_row in select unnest(enum_range(null::tmsi.customs_zone)) loop
      select cr.rate into cur_rate from tmsi.customs_rates cr
       where cr.hs_code = hs and cr.zone = zone_row and cr.effective_date <= current_date
       order by cr.effective_date desc, cr.created_at desc limit 1;
      if cur_rate is null or cur_rate is distinct from rate then
        declare new_id bigint;
        begin
          insert into tmsi.customs_rates (hs_code, zone, rate, created_by)
          values (hs, zone_row, rate, auth.uid())
          returning id into new_id;
          insert into tmsi.import_batch_items (batch_id, target_table, target_pk, old_row, new_row)
          values (v_batch_id, 'customs_rates', jsonb_build_object('id', new_id),
                  case when cur_rate is null then null
                       else jsonb_build_object('hs_code', hs, 'zone', zone_row, 'rate', cur_rate) end,
                  jsonb_build_object('id', new_id, 'hs_code', hs, 'zone', zone_row, 'rate', rate));
        end;
      end if;
    end loop;
  end loop;

  select count(*) into n from tmsi.import_batch_items ibi where ibi.batch_id = v_batch_id;
  return jsonb_build_object('ok', true, 'dry_run', false, 'batch_id', v_batch_id,
    'to_create', jsonb_array_length(to_create), 'to_update', jsonb_array_length(to_update),
    'unchanged', jsonb_array_length(unchanged), 'items_written', n);
end $$;

grant execute on function tmsi.run_import_hs_duty(jsonb, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. tmsi.undo_import_batch() — generic across both kinds, driven entirely by
--    tmsi.import_batch_items (old_row null -> delete; old_row set -> restore).
--    Processed in reverse insertion order so a row updated more than once in
--    the same batch unwinds correctly (not expected today, defensive anyway).
-- ---------------------------------------------------------------------------

create or replace function tmsi.undo_import_batch(p_batch_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = tmsi, public as $$
declare
  b tmsi.import_batches%rowtype;
  item tmsi.import_batch_items%rowtype;
  n int := 0;
begin
  if not tmsi.has_role('admin') then
    raise exception 'Forbidden';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required';
  end if;

  select * into b from tmsi.import_batches where id = p_batch_id;
  if b.id is null then
    raise exception 'Batch % not found', p_batch_id;
  end if;
  if b.status <> 'committed' then
    raise exception 'Batch % is already %, not committed', p_batch_id, b.status;
  end if;

  for item in
    select * from tmsi.import_batch_items where batch_id = p_batch_id order by id desc
  loop
    if item.target_table = 'hs_codes' then
      if item.old_row is null then
        delete from tmsi.hs_codes where code = item.target_pk->>'code';
      else
        update tmsi.hs_codes set description = item.old_row->>'description' where code = item.target_pk->>'code';
      end if;
    elsif item.target_table = 'customs_rates' then
      if item.old_row is null then
        delete from tmsi.customs_rates where id = (item.target_pk->>'id')::bigint;
      else
        -- old_row here is the PRIOR active rate, itself a historical row, not
        -- this row's own former values (customs_rates is append-only) -- undo
        -- of an "update" case removes the row this batch inserted, same as a
        -- pure insert; the prior rate is still there, untouched, and becomes
        -- current again automatically (latest effective_date/created_at wins).
        delete from tmsi.customs_rates where id = (item.target_pk->>'id')::bigint;
      end if;
    elsif item.target_table = 'products' then
      if item.old_row is null then
        delete from tmsi.products where id = item.target_pk->>'id';
      else
        update tmsi.products set
          name = item.old_row->>'name',
          item_type = (item.old_row->>'item_type')::tmsi.item_type,
          category_id = item.old_row->>'category_id',
          sap_code_sa = item.old_row->>'sap_code_sa',
          hs_code = item.old_row->>'hs_code',
          gross_weight_kg = (item.old_row->>'gross_weight_kg')::numeric,
          currency = item.old_row->>'currency',
          exw_price = (item.old_row->>'exw_price')::numeric,
          primary_branch = item.old_row->>'primary_branch',
          interco_margin = (item.old_row->>'interco_margin')::numeric,
          sold_in = coalesce((select array_agg(x) from jsonb_array_elements_text(item.old_row->'sold_in') x), '{}')
        where id = item.target_pk->>'id';
      end if;
    elsif item.target_table = 'price_overrides' then
      -- always this batch's own insert (price_overrides is append-only,
      -- never touched in place by the importer either) -- undo = delete.
      delete from tmsi.price_overrides where id = (item.target_pk->>'id')::bigint;
    else
      raise exception 'Unhandled target_table in batch item: %', item.target_table;
    end if;
    n := n + 1;
  end loop;

  update tmsi.import_batches
     set status = 'reverted', reverted_at = clock_timestamp(), reverted_by = auth.uid()
   where id = p_batch_id;

  return jsonb_build_object('ok', true, 'batch_id', p_batch_id, 'items_undone', n);
end $$;

grant execute on function tmsi.undo_import_batch(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. tmsi.run_import_products() — one row per product x scope, same shape the
--    paridade CSV (item 38) already used. product_id is new versus that CSV
--    (item 38's own "ref" was only ever a comparison-row index, never a real
--    T-#### key -- "upsert by article code" is not implementable without an
--    explicit one). item_type is new too -- item 38 inferred it by hand from
--    a free-text category label, too fragile for an automated importer.
--    interco_margin (0012) is read once per product, from its non-origin
--    branch rows' in_interco_fee, validated consistent, not per scope-row.
--    in_hs_local and in_duty_pct are accepted but IGNORED, same reason as
--    item 38's own finding (Local HS Code corrupted by drag-fill in the
--    source Excel; duty is a separate, zone-uniform concern handled entirely
--    by tmsi.run_import_hs_duty(), not duplicated here).
--
--    p_rows shape, one element per product x scope row:
--    {"product_id","article","item_type","category","sap_code_sa","hs_code_ref",
--     "gross_weight_kg","purchase_currency","exw_price","primary_subsidiary",
--     "in_interco_fee","scope_type","scope_code","in_transport","in_margin"}
-- ---------------------------------------------------------------------------

create or replace function tmsi.run_import_products(
  p_rows jsonb, p_dry_run boolean, p_filename text, p_reason text
) returns jsonb language plpgsql security definer set search_path = tmsi, public as $$
declare
  row_obj jsonb;
  idx int := 0;
  pid text;
  errors jsonb := '[]'::jsonb;
  product_ids text[] := '{}';
  one_pid text;
  grp jsonb;
  first_row jsonb;
  field text;
  fields text[] := array['article','item_type','category','sap_code_sa','hs_code_ref',
                          'gross_weight_kg','purchase_currency','exw_price','primary_subsidiary'];
  branch_id text;
  category_id text;
  interco_margin numeric;
  fee_val text;
  sold_in text[];
  existing tmsi.products%rowtype;
  new_row jsonb;
  products_create jsonb := '[]'::jsonb;
  products_update jsonb := '[]'::jsonb;
  products_unchanged jsonb := '[]'::jsonb;
  overrides_create jsonb := '[]'::jsonb;
  overrides_unchanged jsonb := '[]'::jsonb;
  v_batch_id uuid;
  n int;
  scope_row jsonb;
  cur_val numeric;
begin
  if not tmsi.has_role('admin') and not tmsi.has_role('product_manager') then
    raise exception 'Forbidden';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Empty import file';
  end if;

  -- pass 1: per-row required-field presence + format, collecting distinct product_ids
  idx := 0;
  for row_obj in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    pid := nullif(trim(row_obj->>'product_id'), '');
    if pid is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'product_id', 'reason', 'em falta'); continue;
    end if;
    if pid !~ '^T-[0-9]{4}$' then
      errors := errors || jsonb_build_object('row', idx, 'column', 'product_id', 'reason', 'formato inválido (T-####)'); continue;
    end if;
    if nullif(trim(row_obj->>'article'), '') is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'article', 'reason', 'em falta'); continue;
    end if;
    if nullif(trim(row_obj->>'item_type'), '') is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'item_type', 'reason', 'em falta'); continue;
    end if;
    if row_obj->>'item_type' not in ('equipment','spare_part','option','service') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'item_type', 'reason', 'valor desconhecido'); continue;
    end if;
    if nullif(trim(row_obj->>'purchase_currency'), '') is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'purchase_currency', 'reason', 'em falta'); continue;
    end if;
    if not exists (select 1 from tmsi.currencies where code = row_obj->>'purchase_currency' and active) then
      errors := errors || jsonb_build_object('row', idx, 'column', 'purchase_currency', 'reason', 'moeda desconhecida'); continue;
    end if;
    if nullif(trim(row_obj->>'exw_price'), '') is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'exw_price', 'reason', 'em falta'); continue;
    end if;
    begin
      if (row_obj->>'exw_price')::numeric < 0 then
        errors := errors || jsonb_build_object('row', idx, 'column', 'exw_price', 'reason', 'negativo'); continue;
      end if;
    exception when others then
      errors := errors || jsonb_build_object('row', idx, 'column', 'exw_price', 'reason', 'não é um número'); continue;
    end;
    if nullif(trim(row_obj->>'primary_subsidiary'), '') is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'primary_subsidiary', 'reason', 'em falta'); continue;
    end if;
    if not exists (select 1 from tmsi.branches where name = row_obj->>'primary_subsidiary') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'primary_subsidiary', 'reason', 'filial desconhecida'); continue;
    end if;
    if row_obj->>'scope_type' not in ('branch','channel') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'scope_type', 'reason', 'tem de ser branch ou channel'); continue;
    end if;
    if nullif(trim(row_obj->>'scope_code'), '') is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'scope_code', 'reason', 'em falta'); continue;
    end if;
    if row_obj->>'scope_type' = 'branch' and not exists (select 1 from tmsi.branches where id = row_obj->>'scope_code') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'scope_code', 'reason', 'filial desconhecida'); continue;
    end if;
    if row_obj->>'scope_type' = 'channel' and not exists (select 1 from tmsi.channels where id = row_obj->>'scope_code') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'scope_code', 'reason', 'canal desconhecido'); continue;
    end if;
    if nullif(trim(row_obj->>'category'), '') is not null
       and not exists (select 1 from tmsi.categories where id = row_obj->>'category' or name = row_obj->>'category') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'category', 'reason', 'categoria desconhecida'); continue;
    end if;
    if nullif(trim(row_obj->>'hs_code_ref'), '') is not null
       and not exists (select 1 from tmsi.hs_codes where code = row_obj->>'hs_code_ref') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'hs_code_ref', 'reason', 'código HS desconhecido — correr o ficheiro de direitos primeiro'); continue;
    end if;
    if nullif(trim(row_obj->>'gross_weight_kg'), '') is not null then
      begin
        if (row_obj->>'gross_weight_kg')::numeric < 0 then
          errors := errors || jsonb_build_object('row', idx, 'column', 'gross_weight_kg', 'reason', 'negativo'); continue;
        end if;
      exception when others then
        errors := errors || jsonb_build_object('row', idx, 'column', 'gross_weight_kg', 'reason', 'não é um número'); continue;
      end;
    end if;
    if nullif(trim(row_obj->>'in_interco_fee'), '') is not null then
      begin
        fee_val := row_obj->>'in_interco_fee';
        if fee_val::numeric < 0 or fee_val::numeric >= 1 then
          errors := errors || jsonb_build_object('row', idx, 'column', 'in_interco_fee', 'reason', 'fora do intervalo [0,1)'); continue;
        end if;
      exception when others then
        errors := errors || jsonb_build_object('row', idx, 'column', 'in_interco_fee', 'reason', 'não é um número'); continue;
      end;
    end if;
    if nullif(trim(row_obj->>'in_transport'), '') is not null then
      begin
        if (row_obj->>'in_transport')::numeric < 0 then
          errors := errors || jsonb_build_object('row', idx, 'column', 'in_transport', 'reason', 'negativo'); continue;
        end if;
      exception when others then
        errors := errors || jsonb_build_object('row', idx, 'column', 'in_transport', 'reason', 'não é um número'); continue;
      end;
    end if;
    if nullif(trim(row_obj->>'in_margin'), '') is not null then
      begin
        if (row_obj->>'in_margin')::numeric < 0 or (row_obj->>'in_margin')::numeric >= 1 then
          errors := errors || jsonb_build_object('row', idx, 'column', 'in_margin', 'reason', 'fora do intervalo [0,1)'); continue;
        end if;
      exception when others then
        errors := errors || jsonb_build_object('row', idx, 'column', 'in_margin', 'reason', 'não é um número'); continue;
      end;
    end if;

    if not (pid = any(product_ids)) then
      product_ids := array_append(product_ids, pid);
    end if;
  end loop;

  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', errors);
  end if;

  -- pass 2: per-product consistency + derive the product-level row
  foreach one_pid in array product_ids loop
    grp := (select jsonb_agg(r) from jsonb_array_elements(p_rows) r where r->>'product_id' = one_pid);
    first_row := grp->0;

    foreach field in array fields loop
      if exists (
        select 1 from jsonb_array_elements(grp) r
         where coalesce(r->>field, '') is distinct from coalesce(first_row->>field, '')
      ) then
        errors := errors || jsonb_build_object('row', 0, 'column', field,
          'reason', format('inconsistente entre linhas do artigo %s', one_pid));
      end if;
    end loop;

    -- interco_margin: from non-origin branch rows' in_interco_fee, must agree
    select id into branch_id from tmsi.branches where name = first_row->>'primary_subsidiary';
    select distinct r->>'in_interco_fee' into fee_val
      from jsonb_array_elements(grp) r
     where r->>'scope_type' = 'branch' and r->>'scope_code' <> branch_id
       and nullif(trim(r->>'in_interco_fee'), '') is not null;
    if (select count(distinct r->>'in_interco_fee') from jsonb_array_elements(grp) r
         where r->>'scope_type' = 'branch' and r->>'scope_code' <> branch_id
           and nullif(trim(r->>'in_interco_fee'), '') is not null) > 1 then
      errors := errors || jsonb_build_object('row', 0, 'column', 'in_interco_fee',
        'reason', format('inconsistente entre filiais não-origem do artigo %s', one_pid));
    end if;
    interco_margin := coalesce(fee_val::numeric, 0);

    if nullif(trim(first_row->>'category'), '') is not null then
      select id into category_id from tmsi.categories where id = first_row->>'category' or name = first_row->>'category';
    else
      category_id := null;
    end if;

    select array_agg(distinct r->>'scope_code') into sold_in
      from jsonb_array_elements(grp) r where r->>'scope_type' = 'branch' and r->>'scope_code' <> branch_id;
    sold_in := coalesce(sold_in, '{}');

    new_row := jsonb_build_object(
      'id', one_pid, 'name', first_row->>'article', 'item_type', first_row->>'item_type',
      'category_id', category_id, 'sap_code_sa', nullif(trim(first_row->>'sap_code_sa'), ''),
      'hs_code', nullif(trim(first_row->>'hs_code_ref'), ''),
      'gross_weight_kg', nullif(trim(first_row->>'gross_weight_kg'), ''),
      'currency', first_row->>'purchase_currency', 'exw_price', (first_row->>'exw_price')::numeric,
      'primary_branch', branch_id, 'interco_margin', interco_margin, 'sold_in', to_jsonb(sold_in)
    );

    select * into existing from tmsi.products where id = one_pid;
    if existing.id is null then
      products_create := products_create || new_row;
    elsif existing.name is distinct from new_row->>'name'
       or existing.item_type::text is distinct from new_row->>'item_type'
       or existing.category_id is distinct from new_row->>'category_id'
       or existing.sap_code_sa is distinct from new_row->>'sap_code_sa'
       or existing.hs_code is distinct from new_row->>'hs_code'
       or existing.gross_weight_kg is distinct from (new_row->>'gross_weight_kg')::numeric
       or existing.currency is distinct from new_row->>'currency'
       or existing.exw_price is distinct from (new_row->>'exw_price')::numeric
       or existing.primary_branch is distinct from new_row->>'primary_branch'
       or existing.interco_margin is distinct from (new_row->>'interco_margin')::numeric
       or existing.sold_in is distinct from sold_in
    then
      products_update := products_update || new_row;
    else
      products_unchanged := products_unchanged || new_row;
    end if;
  end loop;

  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', errors);
  end if;

  -- pass 3: per-row overrides (transport, margin)
  idx := 0;
  for row_obj in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    if nullif(trim(row_obj->>'in_transport'), '') is not null then
      select value into cur_val from tmsi.price_overrides
       where product_id = row_obj->>'product_id' and scope_type = (row_obj->>'scope_type')::tmsi.pricing_scope
         and scope_id = row_obj->>'scope_code' and kind = 'transport' and valid_from <= current_date
         and (valid_to is null or valid_to >= current_date)
       order by valid_from desc, created_at desc limit 1;
      if cur_val is distinct from (row_obj->>'in_transport')::numeric then
        overrides_create := overrides_create || jsonb_build_object(
          'product_id', row_obj->>'product_id', 'scope_type', row_obj->>'scope_type',
          'scope_id', row_obj->>'scope_code', 'kind', 'transport', 'value', (row_obj->>'in_transport')::numeric);
      else
        overrides_unchanged := overrides_unchanged || jsonb_build_object('row', idx, 'kind', 'transport');
      end if;
    end if;
    if nullif(trim(row_obj->>'in_margin'), '') is not null then
      select value into cur_val from tmsi.price_overrides
       where product_id = row_obj->>'product_id' and scope_type = (row_obj->>'scope_type')::tmsi.pricing_scope
         and scope_id = row_obj->>'scope_code' and kind = 'margin' and valid_from <= current_date
         and (valid_to is null or valid_to >= current_date)
       order by valid_from desc, created_at desc limit 1;
      if cur_val is distinct from (row_obj->>'in_margin')::numeric then
        overrides_create := overrides_create || jsonb_build_object(
          'product_id', row_obj->>'product_id', 'scope_type', row_obj->>'scope_type',
          'scope_id', row_obj->>'scope_code', 'kind', 'margin', 'value', (row_obj->>'in_margin')::numeric);
      else
        overrides_unchanged := overrides_unchanged || jsonb_build_object('row', idx, 'kind', 'margin');
      end if;
    end if;
  end loop;

  if p_dry_run then
    return jsonb_build_object('ok', true, 'dry_run', true,
      'products_create', products_create, 'products_update', products_update, 'products_unchanged', products_unchanged,
      'overrides_create', jsonb_array_length(overrides_create), 'overrides_unchanged', jsonb_array_length(overrides_unchanged));
  end if;

  insert into tmsi.import_batches (kind, source_filename, reason, row_count, created_by)
  values ('products', p_filename, p_reason, jsonb_array_length(p_rows), auth.uid())
  returning id into v_batch_id;

  for row_obj in select * from jsonb_array_elements(products_create || products_update) loop
    select * into existing from tmsi.products where id = row_obj->>'id';
    if existing.id is null then
      insert into tmsi.products (id, name, item_type, category_id, sap_code_sa, hs_code, gross_weight_kg,
        currency, exw_price, primary_branch, interco_margin, sold_in)
      values (row_obj->>'id', row_obj->>'name', (row_obj->>'item_type')::tmsi.item_type, row_obj->>'category_id',
        row_obj->>'sap_code_sa', row_obj->>'hs_code', (row_obj->>'gross_weight_kg')::numeric,
        row_obj->>'currency', (row_obj->>'exw_price')::numeric, row_obj->>'primary_branch',
        (row_obj->>'interco_margin')::numeric,
        coalesce((select array_agg(x) from jsonb_array_elements_text(row_obj->'sold_in') x), '{}'));
      insert into tmsi.import_batch_items (batch_id, target_table, target_pk, old_row, new_row)
      values (v_batch_id, 'products', jsonb_build_object('id', row_obj->>'id'), null, to_jsonb(row_obj));
    else
      insert into tmsi.import_batch_items (batch_id, target_table, target_pk, old_row, new_row)
      values (v_batch_id, 'products', jsonb_build_object('id', row_obj->>'id'), to_jsonb(existing), to_jsonb(row_obj));
      update tmsi.products set
        name = row_obj->>'name', item_type = (row_obj->>'item_type')::tmsi.item_type,
        category_id = row_obj->>'category_id', sap_code_sa = row_obj->>'sap_code_sa',
        hs_code = row_obj->>'hs_code', gross_weight_kg = (row_obj->>'gross_weight_kg')::numeric,
        currency = row_obj->>'currency', exw_price = (row_obj->>'exw_price')::numeric,
        primary_branch = row_obj->>'primary_branch', interco_margin = (row_obj->>'interco_margin')::numeric,
        sold_in = coalesce((select array_agg(x) from jsonb_array_elements_text(row_obj->'sold_in') x), '{}')
      where id = row_obj->>'id';
    end if;
  end loop;

  for row_obj in select * from jsonb_array_elements(overrides_create) loop
    declare new_id bigint;
    begin
      insert into tmsi.price_overrides (product_id, scope_type, scope_id, kind, value, reason, created_by)
      values (row_obj->>'product_id', (row_obj->>'scope_type')::tmsi.pricing_scope, row_obj->>'scope_id',
              (row_obj->>'kind')::tmsi.override_kind, (row_obj->>'value')::numeric,
              format('Importação em massa (lote %s): %s', v_batch_id, p_reason), auth.uid())
      returning id into new_id;
      insert into tmsi.import_batch_items (batch_id, target_table, target_pk, old_row, new_row)
      values (v_batch_id, 'price_overrides', jsonb_build_object('id', new_id), null, row_obj || jsonb_build_object('id', new_id));
    end;
  end loop;

  select count(*) into n from tmsi.import_batch_items ibi where ibi.batch_id = v_batch_id;
  return jsonb_build_object('ok', true, 'dry_run', false, 'batch_id', v_batch_id,
    'products_created', jsonb_array_length(products_create), 'products_updated', jsonb_array_length(products_update),
    'products_unchanged', jsonb_array_length(products_unchanged), 'overrides_created', jsonb_array_length(overrides_create),
    'overrides_unchanged', jsonb_array_length(overrides_unchanged), 'items_written', n);
end $$;

grant execute on function tmsi.run_import_products(jsonb, boolean, text, text) to authenticated;
