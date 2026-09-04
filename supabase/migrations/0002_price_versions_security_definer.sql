-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0002 — PROPOSED, NOT APPLIED (E3-i4, 2026-09-04).
--
-- Real defect in migration 0001, found live while testing the product-edit
-- write path for i4 (not something i4 itself introduced): every write to
-- tmsi.products — a plain INSERT of a new draft, or an UPDATE of an
-- existing row — fails with:
--
--   42501: new row violates row-level security policy for table "price_versions"
--
-- Root cause: tmsi.record_exw_version() (0001, §5) is the AFTER trigger that
-- records a tmsi.price_versions row on every products insert/exw_price/
-- currency change. It is declared plain `language plpgsql`, i.e. SECURITY
-- INVOKER — it runs as the calling `authenticated` role, not as the table
-- owner. tmsi.price_versions has row level security enabled with only a
-- SELECT policy (`versions_read`); there is no INSERT policy at all, so the
-- trigger's own insert is denied for any real authenticated caller,
-- regardless of role (admin included) — confirmed live with a
-- product_manager-role test user, both on INSERT and on UPDATE of
-- exw_price on an already-active product. The 11 existing price_versions
-- rows only exist because the seed script (0001, §9) ran directly as a
-- superuser, never through PostgREST/RLS — that path never actually
-- exercised this trigger as an ordinary authenticated user before now.
--
-- tmsi.audit() (0001, §5, a few lines above record_exw_version in the same
-- file) already solves the identical category of problem — a
-- trigger-populated system bookkeeping table that ordinary authenticated
-- roles must not write to directly, but must be able to trigger indirectly
-- — by being declared `security definer`. This migration applies the exact
-- same, already-established pattern to record_exw_version(), plus an
-- explicit search_path (matching tmsi.compute_price/fx_rate/branch_margin/
-- override_value's existing style in 0001, defence in depth against
-- search_path hijacking even though this function only ever touches
-- schema-qualified relations).
--
-- Never edit 0001 (already applied). This file is additive and, at the
-- time of writing, NOT applied to the live database — proposed for the
-- Pedro's review per E3-i4's own stop condition ("no RLS write path for
-- what the screen needs -> propose 0002, don't apply").

begin;

alter function tmsi.record_exw_version() security definer set search_path = tmsi, public;

commit;
