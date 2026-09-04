-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0002 — approved by the Pedro 2026-09-04 (E3-i4, F1).
--
-- Real defect in migration 0001, found live while testing the product-edit
-- write path for i4 (not something i4 itself introduced): every write to
-- tmsi.products — a plain INSERT of a new draft, or an UPDATE of an
-- existing row — failed with:
--
--   42501: new row violates row-level security policy for table "price_versions"
--
-- Root cause: tmsi.record_exw_version() (0001, §5) is the AFTER trigger that
-- records a tmsi.price_versions row on every products insert/exw_price/
-- currency change. It was declared plain `language plpgsql`, i.e. SECURITY
-- INVOKER — it ran as the calling `authenticated` role, not as the table
-- owner. tmsi.price_versions has row level security enabled with only a
-- SELECT policy (`versions_read`); there is no INSERT policy at all, so the
-- trigger's own insert was denied for any real authenticated caller,
-- regardless of role (admin included) — confirmed live with a
-- product_manager-role test user, both on INSERT and on UPDATE of
-- exw_price on an already-active product. The 11 pre-existing
-- price_versions rows only exist because the seed script (0001, §9) ran
-- directly as a superuser, never through PostgREST/RLS — that path never
-- actually exercised this trigger as an ordinary authenticated user before
-- this session.
--
-- tmsi.audit() (0001, §5, a few lines above record_exw_version in the same
-- file) already solves the identical category of problem — a
-- trigger-populated system bookkeeping table that ordinary authenticated
-- roles must not write to directly, but must be able to trigger indirectly
-- — by being declared `security definer`. This migration applies the same
-- pattern to record_exw_version().
--
-- Second fix, added on review (the Pedro, before applying): tmsi.audit()
-- itself IS security definer but has NO search_path pinned — the classic
-- Postgres privilege-escalation vector for security-definer functions (an
-- unpinned search_path lets a same-named object in an earlier-resolved,
-- writable schema shadow the intended one). Verified directly against 0001:
-- `create or replace function tmsi.audit() returns trigger language plpgsql
-- security definer as $$` — no SET search_path clause at all. This
-- migration pins search_path on BOTH functions, `tmsi, pg_temp` (not
-- `tmsi, public`, which fx_rate/override_value/branch_margin/compute_price
-- use elsewhere in 0001) — `public` is writable in many Postgres setups and
-- is exactly the schema an attacker would plant a shadow object in;
-- `pg_temp` is the standard safe suffix recommended by PostgreSQL's own
-- docs for SECURITY DEFINER functions.
--
-- Never edit 0001 (already applied). This file is additive.

begin;

alter function tmsi.record_exw_version() security definer set search_path = tmsi, pg_temp;
alter function tmsi.audit() set search_path = tmsi, pg_temp;

commit;
