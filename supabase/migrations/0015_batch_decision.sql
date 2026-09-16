-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0015 — item 44, batch decision on tmsi.price_proposals. Mechanics
-- only (restriction 1 of the prompt): the exact same eligibility rule 0007
-- wrote — admin, or the branch_manager of the affected branch — decides
-- whether a proposal makes it into a batch at all. Nothing here changes who
-- can approve what; a batch can never do what the caller couldn't do one at
-- a time (proven live, not by reading this comment — see docs/STATE.md).
--
-- Why this exists (item 38's own measurement): 48 approvals for one customs
-- review (12 HS codes x 4 zones), 163 config entries for 13 articles. At
-- 50-70 real products that's hundreds of individual clicks, all on one
-- account, for anything that's admin-only (item 44 of docs/BACKLOG.md,
-- registered, not resolved by this migration either — see the new backlog
-- item this session also writes).
--
-- The danger this migration is built against: batch approval is the
-- easiest way to reintroduce exactly what item 38's own F1 adenda refused
-- — approving without reading. A button that swallows 800 rows without the
-- approver knowing what was in them keeps the DB-level enforcement but
-- turns the human decision into a reflex; that defeats 0007's whole point.
-- So: dry-run by default (the 0013 shape, same as run_import_products()),
-- ineligible proposals excluded up front with a reason (never silently
-- skipped, never fail the whole batch), and the dry-run response carries
-- real before/after values per proposal — never just a count — so a
-- caller has something to actually read before committing.
--
-- Design decision, refactor not duplication: tmsi.decide_price_proposal()
-- (0007, extended by 0009/0010) gains a 5th parameter, p_batch_id uuid
-- default null — fully backward compatible (every existing 3-positional-arg
-- caller, including app/src/app/proposals/actions.ts, is unaffected; named-
-- arg RPC calls never even see the new parameter unless they pass it). The
-- alternative — copying its ~60-line per-target_table materialisation
-- logic into a second function — would create exactly the maintenance trap
-- 0007's own header warns about (a 9th target_table added later would need
-- remembering to update in two places). CREATE OR REPLACE cannot add a
-- parameter to an existing signature (0007's own lesson, re: branch_margin())
-- — the old 3-arg function is dropped explicitly first.
--
-- Lesson from 0014, applied here even though nothing in this migration
-- REVOKEs a column: any REVOKE this migration or a future one adds to
-- price_proposals/decision_batches must be table-level, then column-level
-- GRANT back — never a column-level REVOKE alone against the schema-wide
-- table grant from 0001. Nothing here needs it today (decision_batches has
-- no sensitive-beyond-price_proposals-itself column to hide), noted for
-- whoever touches this table next.
--
-- Never edit 0001-0014 (already applied). This file is additive.

-- ---------------------------------------------------------------------------
-- 1. tmsi.decision_batches — one row per batch decision, same spirit as
--    0013's tmsi.import_batches (a real identifier, not a bare uuid
--    scattered across rows). No payload column: decision_batches is a
--    summary of a decision already fully recorded, proposal by proposal,
--    in tmsi.price_proposals + audit_log — this table exists so "which
--    proposals were decided together, by whom, when, why" is one row away,
--    not a self-join on timestamps.
-- ---------------------------------------------------------------------------

create table tmsi.decision_batches (
  id              uuid primary key default gen_random_uuid(),
  decision        text not null check (decision in ('approved', 'rejected')),
  reason          text,
  decided_count   integer not null check (decided_count >= 0),
  excluded_count  integer not null default 0 check (excluded_count >= 0),
  decided_by      uuid not null,
  decided_at      timestamptz not null default clock_timestamp(),
  check (decision <> 'rejected' or reason is not null)
);

alter table tmsi.decision_batches enable row level security;

-- Same broad-visibility set as proposals_read (0007), plus always your own
-- batch even outside that set — a branch_manager who decides a batch of
-- their own branch's proposals can always see the batch they just made.
create policy decision_batches_read on tmsi.decision_batches for select to authenticated using (
  decided_by = auth.uid()
  or tmsi.has_role('admin') or tmsi.has_role('finance') or tmsi.has_role('product_manager') or tmsi.has_role('viewer')
);
-- No insert/update/delete policy for authenticated at all — only
-- tmsi.decide_price_proposal_batch() below writes this table, running as
-- its owner (security definer), same enforcement-by-absence as 0007's own
-- price_proposals (no UPDATE/DELETE policy there either).

grant select on tmsi.decision_batches to authenticated;

alter table tmsi.price_proposals
  add column decision_batch_id uuid references tmsi.decision_batches;

-- ---------------------------------------------------------------------------
-- 2. tmsi.decide_price_proposal() — same signature plus one optional
--    trailing parameter, same eligibility check (byte-identical to 0007's,
--    diff this against 0007 to confirm), same materialisation per
--    target_table (byte-identical to the live function this migration
--    replaces — diff against \df+ output taken before this file was
--    written, docs/STATE.md). The only two lines that change are the two
--    UPDATE statements gaining decision_batch_id = p_batch_id.
-- ---------------------------------------------------------------------------

drop function tmsi.decide_price_proposal(bigint, text, text);

create or replace function tmsi.decide_price_proposal(
  p_proposal_id bigint, p_decision text, p_reason text default null, p_batch_id uuid default null
)
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
       set status = 'rejected', decided_by = auth.uid(), decided_at = clock_timestamp(),
           decision_reason = p_reason, decision_batch_id = p_batch_id
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
         decision_reason = p_reason, materialized_id = new_id, decision_batch_id = p_batch_id
   where id = p_proposal_id;
end;
$$;
revoke execute on function tmsi.decide_price_proposal(bigint, text, text, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- 3. tmsi.decide_price_proposal_batch() — the new entry point. p_dry_run
--    defaults true (0013's own default), so the common mistake ("forgot to
--    ask for a preview") fails safe. Eligibility check here is the exact
--    same boolean as step 2's, kept in the open (not a shared helper) on
--    purpose: this function only ever READS with it (to classify, never to
--    write) — the actual decision, and therefore the actual eligibility
--    enforcement that matters, always happens inside
--    tmsi.decide_price_proposal() itself. A caller who somehow slipped an
--    ineligible id past THIS classification would still be refused there,
--    which is what aborts the whole batch (restriction 2: a batch can
--    never do what the caller couldn't do one at a time).
-- ---------------------------------------------------------------------------

create or replace function tmsi.decide_price_proposal_batch(
  p_proposal_ids bigint[], p_decision text, p_reason text default null, p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = tmsi, pg_temp
as $$
declare
  v_id bigint;
  v_pr tmsi.price_proposals%rowtype;
  v_eligible bigint[] := '{}';
  v_excluded jsonb := '[]'::jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_before numeric;
  v_after numeric;
  v_key text;
  v_batch_id uuid;
  v_decided_count integer;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;
  if p_decision = 'rejected' and (p_reason is null or p_reason = '') then
    raise exception 'A reason is required to reject a batch';
  end if;
  if p_proposal_ids is null or array_length(p_proposal_ids, 1) is null then
    raise exception 'No proposal ids given';
  end if;

  -- classify: eligible vs excluded (with reason), deduplicating the input
  foreach v_id in array (select array_agg(distinct x) from unnest(p_proposal_ids) x) loop
    select * into v_pr from tmsi.price_proposals where id = v_id;
    if v_pr.id is null then
      v_excluded := v_excluded || jsonb_build_object('id', v_id, 'reason', 'not found');
    elsif v_pr.status <> 'pending' then
      v_excluded := v_excluded || jsonb_build_object('id', v_id, 'reason', 'already ' || v_pr.status, 'target_table', v_pr.target_table);
    elsif not (
      tmsi.has_role('admin')
      or (v_pr.branch_id is not null and tmsi.has_role('branch_manager') and v_pr.branch_id = any(tmsi.my_branches()))
    ) then
      v_excluded := v_excluded || jsonb_build_object(
        'id', v_id, 'reason', 'not eligible for your role/branch',
        'target_table', v_pr.target_table, 'branch_id', v_pr.branch_id
      );
    else
      v_eligible := array_append(v_eligible, v_id);
    end if;
  end loop;

  -- legibility (restriction 3): a real before/after per eligible proposal,
  -- not a bare count. "Before" is the same latest-effective lookup
  -- compute_price()/fx_rate()/branch_margin() already use per table — never
  -- a placeholder, never derived from the proposal's own payload.
  foreach v_id in array v_eligible loop
    select * into v_pr from tmsi.price_proposals where id = v_id;
    v_before := null; v_key := null; v_after := null;

    if v_pr.target_table = 'exchange_rates' then
      v_key := v_pr.payload->>'currency';
      v_after := (v_pr.payload->>'rate_per_eur')::numeric;
      select rate_per_eur into v_before from tmsi.exchange_rates
       where currency = (v_pr.payload->>'currency')::char(3) order by effective_date desc, created_at desc limit 1;
    elsif v_pr.target_table = 'interco_fees' then
      v_key := (v_pr.payload->>'supplier_branch') || '->' || (v_pr.payload->>'seller_branch');
      v_after := (v_pr.payload->>'fee')::numeric;
      select fee into v_before from tmsi.interco_fees
       where supplier_branch = v_pr.payload->>'supplier_branch' and seller_branch = v_pr.payload->>'seller_branch'
       order by effective_date desc, created_at desc limit 1;
    elsif v_pr.target_table = 'transport_tiers' then
      v_key := (v_pr.payload->>'branch_id') || '/tier ' || (v_pr.payload->>'tier');
      v_after := (v_pr.payload->>'cost')::numeric;
      select cost into v_before from tmsi.transport_tiers
       where branch_id = v_pr.payload->>'branch_id' and tier = (v_pr.payload->>'tier')::smallint
       order by effective_date desc, created_at desc limit 1;
    elsif v_pr.target_table = 'customs_rates' then
      v_key := (v_pr.payload->>'hs_code') || '/' || (v_pr.payload->>'zone');
      v_after := (v_pr.payload->>'rate')::numeric;
      select rate into v_before from tmsi.customs_rates
       where hs_code = v_pr.payload->>'hs_code' and zone = (v_pr.payload->>'zone')::tmsi.customs_zone
       order by effective_date desc, created_at desc limit 1;
    elsif v_pr.target_table = 'margin_grids' then
      v_key := (v_pr.payload->>'branch_id') || '/tier ' || (v_pr.payload->>'tier');
      v_after := (v_pr.payload->>'margin')::numeric;
      select margin into v_before from tmsi.margin_grids
       where branch_id = v_pr.payload->>'branch_id' and tier = (v_pr.payload->>'tier')::smallint
       order by effective_date desc, created_at desc limit 1;
    elsif v_pr.target_table = 'price_overrides' then
      v_key := (v_pr.payload->>'product_id') || '/' || (v_pr.payload->>'scope_id') || '/' || (v_pr.payload->>'kind');
      v_after := (v_pr.payload->>'value')::numeric;
      select value into v_before from tmsi.price_overrides
       where product_id = v_pr.payload->>'product_id' and scope_type = (v_pr.payload->>'scope_type')::tmsi.pricing_scope
         and scope_id = v_pr.payload->>'scope_id' and kind = (v_pr.payload->>'kind')::tmsi.override_kind
         and valid_from <= current_date and (valid_to is null or valid_to >= current_date)
       order by valid_from desc, created_at desc limit 1;
    elsif v_pr.target_table = 'branch_pricing_params' then
      v_key := (v_pr.payload->>'branch_id') || '/ref_factor';
      v_after := (v_pr.payload->>'ref_factor')::numeric;
      select ref_factor into v_before from tmsi.branch_pricing_params
       where branch_id = v_pr.payload->>'branch_id' order by effective_date desc, created_at desc limit 1;
    elsif v_pr.target_table = 'currency_rounding_params' then
      v_key := (v_pr.payload->>'currency') || '/rounding';
      v_after := (v_pr.payload->>'rounding')::numeric;
      select rounding into v_before from tmsi.currency_rounding_params
       where currency = (v_pr.payload->>'currency')::char(3) order by effective_date desc, created_at desc limit 1;
    end if;

    v_changes := v_changes || jsonb_build_object(
      'id', v_id, 'target_table', v_pr.target_table, 'key', v_key,
      'before', v_before, 'after', v_after, 'reason', v_pr.reason
    );
  end loop;

  if p_dry_run then
    return jsonb_build_object(
      'ok', true, 'dry_run', true,
      'eligible_count', array_length(v_eligible, 1),
      'excluded_count', jsonb_array_length(v_excluded),
      'excluded', v_excluded, 'changes', v_changes
    );
  end if;

  -- commit: atomic by construction — a single function invocation is one
  -- transaction; any exception from decide_price_proposal() (including its
  -- own internal eligibility re-check, or a row decided by someone else
  -- since the preview) aborts everything decided so far in this call too.
  v_decided_count := coalesce(array_length(v_eligible, 1), 0);
  v_batch_id := gen_random_uuid();

  insert into tmsi.decision_batches (id, decision, reason, decided_count, excluded_count, decided_by)
  values (v_batch_id, p_decision, p_reason, v_decided_count, jsonb_array_length(v_excluded), auth.uid());

  foreach v_id in array v_eligible loop
    perform tmsi.decide_price_proposal(v_id, p_decision, p_reason, v_batch_id);
  end loop;

  return jsonb_build_object(
    'ok', true, 'dry_run', false, 'batch_id', v_batch_id,
    'decided_count', v_decided_count, 'excluded_count', jsonb_array_length(v_excluded), 'excluded', v_excluded
  );
end;
$$;
revoke execute on function tmsi.decide_price_proposal_batch(bigint[], text, text, boolean) from public, anon;
