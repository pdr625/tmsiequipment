-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0011 — correction to 0010 (applied minutes earlier, same
-- session), same shape as 0002's own fix to 0001 and 0004's to 0003: a
-- real bug found live, fixed in a new file, 0010 never edited.
--
-- Root cause, confirmed live before writing this: 0010 needed to run as
-- supabase_admin, not postgres — tmsi.v_products (created in 0003, by a
-- session/tool this project never controlled) is owned by supabase_admin,
-- and postgres turns out NOT to be a real superuser in this environment
-- (confirmed: rolsuper=false, only rolbypassrls=true) — postgres cannot
-- CREATE OR REPLACE a view it does not own. Every OTHER object in this
-- schema, including all six existing config tables, is postgres-owned,
-- because every other migration ran as postgres.
--
-- Consequence: tmsi.branch_pricing_params and tmsi.currency_rounding_params
-- (both created fresh in 0010, hence created BY supabase_admin) never
-- picked up the standing `alter default privileges in schema tmsi grant
-- all on tables to authenticated, service_role` rule from 0001 — that rule
-- only fires for objects created BY POSTGRES, the role that issued it, not
-- retroactively and not for a different creating role. Confirmed live,
-- twice: (1) a direct PostgREST read of either new table as finance
-- returned 42501, "permission denied", with Postgres's own error hint
-- naming the exact fix; (2) tmsi.decide_price_proposal() (owned by
-- postgres, SECURITY DEFINER — confirmed still postgres-owned, CREATE OR
-- REPLACE never changes an existing function's owner) failed with the
-- same "permission denied" trying to materialise a branch_pricing_params
-- proposal — table owners always have full implicit rights on their own
-- tables, but postgres was not the owner here, and had no explicit grant
-- either. This means /config's new "Reference price factor" section
-- (item 34, this same session) could not even be READ, and no
-- branch_pricing_params/currency_rounding_params proposal could ever be
-- approved — caught by this session's own F4 verification, not left for
-- the Pedro to find.
--
-- Fix: reassign both new tables to postgres (matching every other config
-- table's ownership — table owners get full implicit rights on their own
-- tables, no grant needed, exactly how postgres already writes to
-- price_overrides/margin_grids/etc. via this same function), plus the
-- explicit SELECT grant to authenticated/service_role that default
-- privileges would have given automatically had postgres created them —
-- default privileges do not apply retroactively, ownership change or not.
--
-- Same root cause bit tmsi.v_products itself (pre-existing, not
-- introduced by this session) — reassigned here too while already fixing
-- this class of bug, so the next migration that needs to replace that
-- view does not hit the exact same wall this one did. Behaviour-neutral:
-- ownership does not affect RLS, existing grants, or query results, only
-- who may issue future DDL on the object.
--
-- Never edit 0001-0010 (already applied). This file is additive.

begin;

alter table tmsi.branch_pricing_params owner to postgres;
alter table tmsi.currency_rounding_params owner to postgres;
alter view tmsi.v_products owner to postgres;

grant select on tmsi.branch_pricing_params to authenticated, service_role;
grant select on tmsi.currency_rounding_params to authenticated, service_role;

commit;
