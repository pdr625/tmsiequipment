-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0014 — items 47+48 F2. tmsi.audit_log had column-level SELECT on
-- old_row/new_row granted to `authenticated` with no REVOKE (0001 never
-- touched it — the cost boundary 0003/0004 only ever reached the live
-- tables/views, never this one). Item 42 measured this as a privacy finding
-- (a `profiles` audit row's old_row/new_row carries a colleague's real name
-- and email, in the clear); items 47+48 re-measured it specifically for
-- COSTS and found that leak does NOT exist — tmsi.audit_log has exactly one
-- RLS policy (audit_read: admin/finance/viewer/branch_manager), a strict
-- subset of can_read_costs()'s role set, so no audited table's content
-- (products included) can reach a no-cost role through this path — proven
-- live, real sessions, before this file was written (docs/BACKLOG.md item 47).
--
-- What this migration actually closes is narrower than "audit_log leaks
-- costs" (it doesn't) and narrower than "audit_log leaks everything" (a
-- blanket REVOKE would break app/src/app/products/[id]/page.tsx's own,
-- legitimate old_row/new_row read — the per-product change history a
-- cost-visible role is meant to see). It closes exactly the item 42 finding:
-- a `profiles` row's content is personal data, not price data, and reaches
-- finance/branch_manager/viewer — roles with no reason to see another
-- colleague's name/email history — same shape as the origin_country fix in
-- 0010 (item 31): move ONE column pair behind a narrower gate, change
-- nothing else.
--
-- tmsi.v_audit_log: same six columns products/[id] and /audit already read,
-- old_row/new_row nulled out when table_name='profiles' unless the caller is
-- admin (who already manages profiles directly via /admin/users — seeing
-- this history is the same responsibility, not new exposure). Row visibility
-- is re-implemented explicitly in the view's WHERE clause, not inherited
-- from RLS — same reason v_products does this (0003/0004): the view is
-- owned by `postgres`, which has rolbypassrls=true on this instance
-- (confirmed live, not assumed), so without an explicit WHERE the view would
-- silently show every row to everyone.
--
-- Never edit 0001-0013 (already applied). This file is additive.

-- Table-level SELECT revoked first, then column-level SELECT re-granted for
-- exactly the safe set — a column-level REVOKE alone would be a no-op
-- against 0001's table-level `grant all on all tables in schema tmsi to
-- authenticated` (column privileges are additive over table-level ones,
-- never restrictive of them). The exact bug 0003 already found once for
-- tmsi.products, found again live here before this file was finalised: the
-- first version of this migration tried the column-level REVOKE alone,
-- applied cleanly with no error, and changed nothing — caught only by
-- testing the actual grant afterward, not by the DDL succeeding.
revoke select on tmsi.audit_log from authenticated;
grant select (id, at, actor, table_name, row_pk, action) on tmsi.audit_log to authenticated;

create or replace view tmsi.v_audit_log as
  select
    id, at, actor, table_name, row_pk, action,
    case when table_name = 'profiles' and not tmsi.has_role('admin') then null else old_row end as old_row,
    case when table_name = 'profiles' and not tmsi.has_role('admin') then null else new_row end as new_row
  from tmsi.audit_log
  where tmsi.has_role('admin') or tmsi.has_role('finance') or tmsi.has_role('viewer')
     or tmsi.has_role('branch_manager');

grant select on tmsi.v_audit_log to authenticated;
