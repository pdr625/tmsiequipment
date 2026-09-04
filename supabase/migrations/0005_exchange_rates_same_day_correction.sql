-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0005 — same-day exchange rate correction. Approved by the
-- Pedro 2026-09-04 (E3-i5, F1), validated empirically (BEGIN/ROLLBACK)
-- before being written here.
--
-- Real usability defect the Pedro hit live: tmsi.exchange_rates has
-- `unique (currency, effective_date)` — only one entry per currency per
-- calendar day. A mistaken entry (wrong rate typed in) could not be
-- corrected until the next day; the /config UI could only append
-- (0001 §2 comment: 1 EUR = rate units, no update path was ever intended
-- for this append-only table — see E3-i5, STATE.md), and the unique
-- constraint blocked a same-day second attempt outright.
--
-- Checked before designing anything (condition 1 of the approval):
-- tmsi.fx_rate() (0001 §7) is the ONLY reader of this table for price
-- calculation — grepped the schema and the app; every other function/view
-- that needs an FX rate goes through fx_rate(), never touches
-- tmsi.exchange_rates directly. The app's /config page reads the table
-- directly too, but only to list history for display — not a calculation
-- path, and updated in this same change (F3) to mark same-day superseded
-- entries instead of leaving them unexplained.
--
-- Fix: relax the unique constraint (more than one entry per currency per
-- day now allowed) and have fx_rate() break ties on insertion recency —
-- among entries with the same (latest applicable) effective_date, the one
-- inserted last wins.
--
-- Found during F1 testing, not assumed: created_at's existing default,
-- `now()`, is FROZEN for the lifetime of a transaction (confirmed live —
-- two inserts in the same transaction got byte-identical now() values,
-- making the tie-break non-deterministic between them). In real usage
-- each /config form submission is its own separate transaction, so
-- now() would normally still differ between two genuine corrections a
-- minute apart — but relying on that undocumented-in-practice nuance is
-- fragile, and the whole point of this column is now also to break ties
-- reliably. Switched the default to clock_timestamp(), which always
-- reflects the true statement-execution moment regardless of transaction
-- boundaries — confirmed live to resolve even the worst case (two
-- corrections inserted in the very same transaction).
--
-- Never edit 0001/0002/0003/0004 (already applied). This file is additive.

begin;

alter table tmsi.exchange_rates drop constraint exchange_rates_currency_effective_date_key;
alter table tmsi.exchange_rates alter column created_at set default clock_timestamp();
create index exchange_rates_lookup_idx on tmsi.exchange_rates (currency, effective_date desc, created_at desc);

create or replace function tmsi.fx_rate(p_currency char(3), p_date date default current_date)
returns numeric language sql stable security definer set search_path = tmsi, public as $$
  select rate_per_eur from tmsi.exchange_rates
   where currency = p_currency and effective_date <= p_date
   order by effective_date desc, created_at desc limit 1;
$$;

commit;
