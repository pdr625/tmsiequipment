-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0006 — password management without email (i9). Decision of
-- the Pedro, 2026-09-05: the pilot onboarding no longer depends on email
-- delivery (the EOP/M365 quarantine blocking S/T stays open, demoted from
-- blocker to improvement — docs/STATE.md, E5-VPS). Admin can force a
-- reset (manual or a generated one-time temporary password); any
-- authenticated user can change their own password without an email link.
--
-- Consequence for numbering (docs/ROADMAP.md): this takes 0006, the
-- number previously reserved for E4's functional migration — E4 moves to
-- 0007.
--
-- Never edit 0001-0005 (already applied). This file is additive.

begin;

-- 1. Flag forcing the change-password page until cleared. Read is already
-- covered by the existing profiles_self policy (0001 §8: own row or
-- admin); nothing here needs a new read policy.
alter table tmsi.profiles
  add column must_change_password boolean not null default false;

-- 2. profiles was deliberately left out of the generic audit trigger in
-- 0001 (no self-service write existed on it yet). This migration adds the
-- first one, so it needs the same audit coverage every other writable
-- table already has. auth.uid() (what tmsi.audit() records as actor) is a
-- session-level setting, not tied to a function's owner/security-definer
-- boundary, so it stays correct across the security-definer functions
-- below: a true transition (false->true) is an admin-initiated reset,
-- actor = the admin, row_pk = the target user; a false transition
-- (true->false) is that user's own completed change, actor = themself.
-- No bespoke event-type/description column needed for that — the
-- structured old_row/new_row + actor already say who did what to whom.
-- (profiles has no plain `id` column, so tmsi.audit()'s `->>'id'`
-- extraction falls back to the whole row as text for row_pk — the same
-- pre-existing behaviour tmsi.settings already has, PK'd on `key` — not a
-- new quirk introduced here.)
create trigger trg_audit_profiles after insert or update or delete on tmsi.profiles
  for each row execute function tmsi.audit();

-- 3. Self-service completion: clears the flag for the caller's own row
-- only. Deliberately narrow — a general self-update RLS policy on
-- profiles would also let a non-admin edit full_name/email/active on
-- their own row, which nothing in the app offers today and is out of
-- scope here. search_path pinned to `pg_temp` only (tighter than most
-- existing functions' `tmsi, public` — this one runs off a boolean flag
-- flip a user can trigger themselves, so every name inside is schema-
-- qualified rather than relying on any search path at all, matching the
-- rationale 0002 already established for security-definer functions).
create or replace function tmsi.mark_password_changed()
returns void
language sql
security definer
set search_path = pg_temp
as $$
  update tmsi.profiles set must_change_password = false where user_id = auth.uid();
$$;

-- 4. Admin-forced session revocation. GoTrue v2.189.0's Admin API has no
-- session-revocation endpoint — confirmed by source inspection during the
-- E3-i1 secret incident (docs/STATE.md), where the only working route was
-- a direct delete against GoTrue's own schema. auth.sessions.user_id ->
-- auth.refresh_tokens cascades via session_id (confirmed live on this
-- database, 2026-09-05), so one DELETE on auth.sessions is enough.
-- has_role('admin') is re-checked INSIDE the function, not just by the
-- calling Server Action's isAdmin() gate — 0001's
-- `alter default privileges ... grant execute on functions to
-- authenticated` means this would otherwise be callable, and able to
-- revoke ANY user's sessions, by any signed-in user.
create or replace function tmsi.admin_revoke_sessions(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_temp
as $$
begin
  if not tmsi.has_role('admin') then
    raise exception 'Forbidden';
  end if;
  delete from auth.sessions where user_id = target_user_id;
end;
$$;

commit;
