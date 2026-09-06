/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { timingSafeEqual } from 'node:crypto';

// item 18 (docs/BACKLOG.md): consumed by ~/atelier-vps/vps-stats.sh (host,
// outside Docker) to publish per-currency FX staleness in status.json,
// WITHOUT giving that hardened, credential-free collector any Postgres
// access — restriction 1 of the prompt. This is machine-to-machine, not a
// user session: the boundary is a shared bearer token (STATS_INTERNAL_TOKEN,
// its own narrow secret, never the master SERVICE_ROLE_KEY), checked here,
// never the has_role()/RLS model auth-guard.ts's helpers exist for — don't
// confuse the two. A wrong/missing token gets a bare 401, no body, same
// spirit as every other boundary in this app: refuse, don't leak.
function isAuthorized(request: Request): boolean {
  const expected = process.env.STATS_INTERNAL_TOKEN;
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;

  const provided = Buffer.from(header.slice(prefix.length));
  const wanted = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch rather than returning
  // false — checked explicitly first so an attacker can't use response
  // timing to learn the token's length.
  if (provided.length !== wanted.length) return false;
  return timingSafeEqual(provided, wanted);
}

type ExchangeRateRow = { currency: string; effective_date: string; created_at: string };

// today is computed with the container's own clock, not a caller-supplied
// value — safe here specifically because this runs INSIDE tmsi-app, which
// (confirmed live) shares the same UTC clock as supabase-db; this is NOT
// the same situation as scripts/smoke.py's own item-25 bug (a HOST-side
// script, in a different timezone, compared against the DB's clock) — do
// not copy this "new Date() is fine" reasoning into a host-side script.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new Response(null, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Mirrors tmsi.fx_rate()'s own WHERE/ORDER BY verbatim (`where ...
  // effective_date <= p_date order by effective_date desc, created_at
  // desc`) via ordinary PostgREST query params — never a second,
  // hand-copied implementation of that tie-break. Sorting by currency
  // first just groups each currency's own candidates together; within
  // each group the winner (the same row fx_rate() would pick today) is
  // simply the first one Postgres returns, no DISTINCT ON/JS tie-break
  // logic needed on top.
  const url =
    `http://rest:3000/exchange_rates?select=currency,effective_date,created_at` +
    `&effective_date=lte.${today}&order=currency.asc,effective_date.desc,created_at.desc`;

  let rows: ExchangeRateRow[];
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.SERVICE_ROLE_KEY}` },
      cache: 'no-store',
    });
    if (!res.ok) return new Response(null, { status: 502 });
    rows = await res.json();
  } catch {
    return new Response(null, { status: 502 });
  }

  // Currencies come from the data (invariant 16) — never a hardcoded
  // list. EUR is correctly absent: it's the base currency, never stored
  // in exchange_rates, and compute_price() never calls fx_rate() for it
  // (0001 §7: `case when p.currency = 'EUR' then 1 else fx_rate(...) end`).
  const agesDays: Record<string, number> = {};
  const seen = new Set<string>();
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  for (const row of rows) {
    if (seen.has(row.currency)) continue;
    seen.add(row.currency);
    const effMs = Date.parse(`${row.effective_date}T00:00:00Z`);
    agesDays[row.currency] = Math.round((todayMs - effMs) / 86_400_000);
  }
  const values = Object.values(agesDays);
  const maxAgeDays = values.length > 0 ? Math.max(...values) : null;

  return Response.json({ ages_days: agesDays, max_age_days: maxAgeDays });
}
