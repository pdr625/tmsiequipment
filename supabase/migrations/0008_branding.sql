-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0008 — item 26, white-label/branding (opção B, decisão do Pedro
-- 2026-09-06). Identity/text config for the app's own UI title and for the
-- documents (Excel export, print view) — editable by an admin, never part
-- of the 0007 approval workflow (this is presentation, not a published
-- price; restriction 3 of the prompt, registered here and in STATE.md).
--
-- Append-only like every other config table in this project (0005/0007
-- pattern) — editing branding INSERTs a new full snapshot, never UPDATEs
-- one in place; "current" is simply the latest row. Two tables, not one:
-- tmsi.branding_logos holds the (rare, occasionally large) binary upload,
-- tmsi.branding holds the small text/colour fields and references a logo
-- by id. Keeping them separate means editing just the footer text doesn't
-- re-insert an unchanged multi-hundred-KB logo (and doesn't re-audit it —
-- tmsi.audit() does to_jsonb(new), which would hex-encode a bytea column
-- and roughly double its size in tmsi.audit_log on every single edit).
--
-- Logo storage: Postgres bytea, not a new volume/service. This stack has
-- no object storage (deliberately, in this "magro" self-hosted setup) —
-- a new volume would mean a new backup path, outside pg_dump's existing,
-- already-proven restore procedure (docs/DISASTER-DRILL.md). A logo is
-- small (capped server-side, see app/src/app/config/branding/actions.ts)
-- and rarely written; bytea in the same database that already backs up
-- nightly is the smallest new surface. PNG/JPEG only, not SVG: exceljs's
-- own addImage() (used to embed the logo in the .xlsx export) only
-- accepts png/jpeg/gif, and an SVG accepted here but silently unusable in
-- one of the two document types this migration exists to brand would be
-- a worse inconsistency than just not offering it.
--
-- anon (not just authenticated) can read tmsi.branding (not
-- tmsi.branding_logos, no logo in emails, see below) — used by the
-- GoTrue invite/recovery email templates (app/src/app/email-templates/),
-- which run with no user session at all. Safe specifically because this
-- table carries zero cost-sensitive data (display_name/tagline/footer/
-- legal text/colour/font only) — nothing adjacent to the 0003/0004
-- boundary, restriction 3 of the prompt.
--
-- Never edit 0001-0007 (already applied). This file is additive.

begin;

create table tmsi.branding_logos (
  id           bigint generated always as identity primary key,
  data         bytea not null,
  mime_type    text not null check (mime_type in ('image/png', 'image/jpeg')),
  filename     text,
  byte_size    integer not null check (byte_size > 0),
  created_at   timestamptz not null default clock_timestamp(),
  created_by   uuid not null
);

create table tmsi.branding (
  id              bigint generated always as identity primary key,
  display_name    text not null check (display_name <> ''),
  tagline         text not null default '',
  footer_text     text not null default '',
  legal_text      text not null default '',
  primary_color   text not null default '#1f2937' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  font_family     text not null default 'Arial',
  logo_id         bigint references tmsi.branding_logos,
  created_at      timestamptz not null default clock_timestamp(),
  created_by      uuid not null
);
create index branding_created_at_idx on tmsi.branding (created_at desc);

create trigger trg_audit_branding_logos after insert or update or delete on tmsi.branding_logos
  for each row execute function tmsi.audit();
create trigger trg_audit_branding after insert or update or delete on tmsi.branding
  for each row execute function tmsi.audit();

alter table tmsi.branding_logos enable row level security;
alter table tmsi.branding enable row level security;

-- tmsi.branding: readable by anon too (email templates, see header
-- comment) — nothing cost-sensitive here, unlike every other config
-- table in this project. tmsi.branding_logos stays authenticated-only:
-- only the app's own document routes (print view, exports), always a
-- real session, ever need the actual logo bytes.
create policy branding_logos_read on tmsi.branding_logos for select to authenticated using (true);
create policy branding_read on tmsi.branding for select to authenticated, anon using (true);

-- RLS policies filter rows for a role that already has the underlying
-- GRANT — they never grant it themselves. 0001's own `alter default
-- privileges ... grant all on tables to authenticated, service_role`
-- (§8) already covers every new table for those two roles, which is why
-- authenticated works above with no explicit grant here; anon was
-- deliberately left OUT of that default and only ever gets one-off
-- per-table grants (0001's own `grant select on tmsi.settings to anon`)
-- — this is that same one-off, for the one table anon genuinely needs.
grant select on tmsi.branding to anon;

-- branding_logos ALSO needs a bare GRANT for anon, even though anon has
-- no read POLICY on it and must never see a row directly — confirmed
-- live: without this, v_current_branding's LEFT JOIN to branding_logos
-- raises a hard "permission denied for table branding_logos" for an
-- anon caller, because Postgres checks the underlying GRANT before RLS
-- is even relevant (missing GRANT is not something a policy can excuse).
-- WITH the grant but no anon-scoped policy, RLS still filters anon down
-- to zero rows from branding_logos itself — the LEFT JOIN then behaves
-- exactly as intended, logo_mime_type simply comes back null for anon.
grant select on tmsi.branding_logos to anon;

-- Write is admin-only (item 26 §1(b): "página de edição... gate de
-- admin") — not admin-or-finance like tmsi.settings' own config_write,
-- and deliberately NOT routed through tmsi.price_proposals: this is
-- presentation, never a published price, so the 0007 workflow does not
-- apply (restriction 3 of the prompt). No UPDATE/DELETE policy for
-- authenticated on either table — append-only is the only path in, same
-- shape as tmsi.price_proposals' own missing UPDATE/DELETE policy (0007).
create policy branding_logos_write on tmsi.branding_logos for insert to authenticated
  with check (tmsi.has_role('admin') and created_by = auth.uid());
create policy branding_write on tmsi.branding for insert to authenticated
  with check (tmsi.has_role('admin') and created_by = auth.uid());

-- Convenience read of "the branding in effect right now" — every reader
-- (UI title, export routes, print view, email templates) wants exactly
-- this row, never the full history. A plain view, not a function: no
-- privilege escalation involved (branding_read already grants anon/
-- authenticated select on the base table), so no SECURITY DEFINER
-- needed here — unlike 0007's decide_price_proposal(), there is no
-- caller-insufficient-privilege gap to bridge for a plain "give me the
-- latest row" read. security_invoker=true so the LEFT JOIN correctly
-- defers to branding_logos' own (authenticated-only) policy per caller —
-- an anon caller gets logo_mime_type=null (never an error), which is
-- exactly right since anon callers (the email templates) never need it.
create view tmsi.v_current_branding
with (security_invoker = true) as
select b.id, b.display_name, b.tagline, b.footer_text, b.legal_text, b.primary_color, b.font_family,
       b.logo_id, l.mime_type as logo_mime_type, b.created_at
  from tmsi.branding b
  left join tmsi.branding_logos l on l.id = b.logo_id
 order by b.created_at desc
 limit 1;
grant select on tmsi.v_current_branding to anon;

commit;
