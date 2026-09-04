/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { canReadDashboard } from '@/lib/auth-guard';
import { BarChart, type BarDatum } from './bar-chart';

type ProductRow = { id: string; name: string; status: string };
type BranchPriceRow = { product_id: string; branch_id: string; margin: number | null };
type Branch = { id: string; name: string };
type ExchangeRateRow = { currency: string; effective_date: string; created_at: string };
type Currency = { code: string };
type PriceOverride = {
  id: number;
  product_id: string;
  branch_id: string;
  kind: string;
  value: number;
  reason: string;
  valid_from: string;
  valid_to: string | null;
  created_by: string | null;
};
type Profile = { user_id: string; email: string | null };
type AuditEntry = { id: number; at: string; actor: string | null; table_name: string; row_pk: string; action: string };

// Fixed order (prompt §1.1) — tmsi.product_status (0001 §1), not
// re-derived from whatever happens to be present in the seed.
const STATUSES = ['draft', 'pending', 'active', 'review', 'inactive', 'discontinued'] as const;

// i8 prompt §1.3: threshold commented, not buried. 30 days is the value
// named in the prompt itself, not chosen freely.
const STALE_RATE_DAYS = 30;

const RECENT_ACTIVITY_LIMIT = 10;
const OVERRIDES_LIST_LIMIT = 5;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function ageDays(dateStr: string): number {
  const ms = Date.now() - new Date(`${dateStr}T00:00:00Z`).getTime();
  return Math.floor(ms / 86400000);
}

function WarnBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ background: 'var(--state-warn-bg)', color: 'var(--state-warn-text)', border: '1px solid var(--state-warn-border)' }}
    >
      <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" style={{ color: 'var(--state-warn-border)' }}>
        <circle cx="5" cy="5" r="4.5" fill="none" stroke="currentColor" />
        <line x1="5" y1="2.3" x2="5" y2="5.6" stroke="currentColor" strokeWidth="1" />
        <circle cx="5" cy="7.4" r="0.6" fill="currentColor" />
      </svg>
      {children}
    </span>
  );
}

function Tile({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${warn ? '' : 'border-gray-200'}`} style={warn ? { borderColor: 'var(--state-warn-border)' } : undefined}>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
        <span>{label}</span>
        {warn && <WarnBadge>needs review</WarnBadge>}
      </div>
    </div>
  );
}

// Access: can_read_costs() only (prompt §1) — everyone else redirected.
// This is the app-level convenience gate; the tables/views below still
// carry their own real RLS regardless of this check (restriction 2).
export default async function DashboardPage() {
  if (!(await canReadDashboard())) {
    redirect('/');
  }

  const supabase = await createSupabaseServerClient();
  const today = todayStr();

  const [
    { data: products },
    { data: branchPrices },
    { data: branches },
    { data: exchangeRates },
    { data: currencies },
    { data: overrides },
    { data: profiles },
    { data: auditEntries },
  ] = await Promise.all([
    // tmsi.v_products (E3-0003/0004) — same view /products already uses,
    // never the raw table. id/name/status are all in the safe/ungated
    // tier, present for every role that reaches this page.
    supabase.schema('tmsi').from('v_products').select('id, name, status').overrideTypes<ProductRow[], { merge: false }>(),
    // tmsi.v_branch_prices — same view /prices uses for cost-visible
    // roles. Rows outside the caller's own scope (a branch_manager's
    // other branches) simply don't come back; compute_price() itself
    // decides that, not this page.
    supabase.schema('tmsi').from('v_branch_prices').select('product_id, branch_id, margin').overrideTypes<BranchPriceRow[], { merge: false }>(),
    supabase.schema('tmsi').from('branches').select('id, name').eq('active', true).order('id').overrideTypes<Branch[], { merge: false }>(),
    // Read directly, same as /config — tmsi.fx_rate()'s own tiebreak
    // (effective_date desc, created_at desc, migration 0005) is
    // replicated below for "freshest per currency", never a new rule.
    supabase.schema('tmsi').from('exchange_rates').select('currency, effective_date, created_at').overrideTypes<ExchangeRateRow[], { merge: false }>(),
    supabase.schema('tmsi').from('currencies').select('code').eq('active', true).overrideTypes<Currency[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('price_overrides')
      .select('id, product_id, branch_id, kind, value, reason, valid_from, valid_to, created_by')
      .overrideTypes<PriceOverride[], { merge: false }>(),
    supabase.schema('tmsi').from('profiles').select('user_id, email').overrideTypes<Profile[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('audit_log')
      .select('id, at, actor, table_name, row_pk, action')
      .order('at', { ascending: false })
      .limit(RECENT_ACTIVITY_LIMIT)
      .overrideTypes<AuditEntry[], { merge: false }>(),
  ]);

  const productById = new Map<string, ProductRow>();
  for (const p of products ?? []) productById.set(p.id, p);
  const emailFor = (id: string | null) => (id ? (profiles?.find((p) => p.user_id === id)?.email ?? id) : '—');

  // 1. Status tiles
  const statusCounts = new Map<string, number>();
  for (const p of products ?? []) statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1);

  // 2. Margin by branch — active products only (a draft's margin isn't a
  // real pricing decision yet); rule §1.2 calls this "a peça central da
  // revisão de margens", so mixing in draft/discontinued noise would
  // misrepresent it. Restricted to rows Postgres already returned (the
  // caller's own RLS/branch scope), never widened here.
  const marginByBranch = new Map<string, { sum: number; n: number }>();
  for (const row of branchPrices ?? []) {
    if (row.margin === null) continue;
    if (productById.get(row.product_id)?.status !== 'active') continue;
    const acc = marginByBranch.get(row.branch_id) ?? { sum: 0, n: 0 };
    acc.sum += row.margin;
    acc.n += 1;
    marginByBranch.set(row.branch_id, acc);
  }
  const marginData: BarDatum[] = (branches ?? [])
    .filter((b) => marginByBranch.has(b.id))
    .map((b) => {
      const acc = marginByBranch.get(b.id)!;
      return { key: b.id, label: b.id, value: acc.sum / acc.n };
    });

  // 3. Exchange rate freshness — freshest row per currency, same
  // ordering tmsi.fx_rate() uses (migration 0005): effective_date desc,
  // then created_at desc as the same-day tiebreak.
  const freshestByCurrency = new Map<string, ExchangeRateRow>();
  for (const r of exchangeRates ?? []) {
    if (r.effective_date > today) continue;
    const cur = freshestByCurrency.get(r.currency);
    if (!cur || r.effective_date > cur.effective_date || (r.effective_date === cur.effective_date && r.created_at > cur.created_at)) {
      freshestByCurrency.set(r.currency, r);
    }
  }
  // EUR is the base currency (compute_price() never calls fx_rate() for
  // it, 0001 §7) — excluded here, not just absent from the seed.
  const trackedCurrencies = (currencies ?? []).map((c) => c.code).filter((c) => c !== 'EUR');

  // 4. Active overrides — same valid_from/valid_to range
  // tmsi.override_value() itself evaluates (0001 §7), read-only display.
  const activeOverrides = (overrides ?? []).filter((o) => o.valid_from <= today && (o.valid_to === null || o.valid_to >= today));

  return (
    // dashboard-charts: the state-colour tokens (--state-warn-*) are used
    // by Tile/WarnBadge/the currency tiles below, not just by <BarChart>
    // itself, so the scope has to cover the whole page — CSS custom
    // properties inherit through descendants once defined here (globals.css).
    <div className="dashboard-charts mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Link href="/" className="text-sm text-gray-600 underline">
          Back
        </Link>
      </div>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Products by status</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STATUSES.map((s) => (
            <Tile key={s} label={s} value={statusCounts.get(s) ?? 0} warn={s === 'review'} />
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Average margin by branch</h2>
        <BarChart
          title="Average margin"
          data={marginData}
          format={(v) => `${(v * 100).toFixed(1)}%`}
          caption="Active products only. Bars scaled to the highest average margin shown, not an absolute 0–100% scale."
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Exchange rate freshness</h2>
        {trackedCurrencies.length === 0 && <p className="text-sm text-gray-500">No data for this period.</p>}
        {trackedCurrencies.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {trackedCurrencies.map((code) => {
              const rate = freshestByCurrency.get(code);
              if (!rate) {
                return (
                  <div key={code} className="rounded-lg border border-gray-200 p-4">
                    <div className="text-sm font-medium">{code}</div>
                    <div className="mt-1 text-xs text-gray-500">no rate on file</div>
                  </div>
                );
              }
              const age = ageDays(rate.effective_date);
              const stale = age > STALE_RATE_DAYS;
              return (
                <div key={code} className={`rounded-lg border p-4 ${stale ? '' : 'border-gray-200'}`} style={stale ? { borderColor: 'var(--state-warn-border)' } : undefined}>
                  <div className="text-sm font-medium">{code}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {age} day{age === 1 ? '' : 's'} old (effective {rate.effective_date})
                  </div>
                  {stale && (
                    <div className="mt-1">
                      <WarnBadge>older than {STALE_RATE_DAYS}d</WarnBadge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Active price overrides</h2>
          <Link href="/overrides" className="text-xs text-gray-600 underline">
            Manage overrides
          </Link>
        </div>
        <div className="mb-3">
          <Tile label="active overrides" value={activeOverrides.length} />
        </div>
        {activeOverrides.length === 0 && <p className="text-sm text-gray-500">No active overrides.</p>}
        {activeOverrides.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Kind</th>
                <th className="py-2 pr-4">Author</th>
                <th className="py-2 pr-4">Valid</th>
              </tr>
            </thead>
            <tbody>
              {activeOverrides.slice(0, OVERRIDES_LIST_LIMIT).map((o) => (
                <tr key={o.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={`/products/${o.product_id}`} className="underline">
                      {productById.get(o.product_id)?.name ?? o.product_id}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{o.kind}</td>
                  <td className="py-2 pr-4">{emailFor(o.created_by)}</td>
                  <td className="py-2 pr-4">
                    {o.valid_from} → {o.valid_to ?? 'open'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {activeOverrides.length > OVERRIDES_LIST_LIMIT && (
          <p className="mt-2 text-xs text-gray-500">
            +{activeOverrides.length - OVERRIDES_LIST_LIMIT} more — see{' '}
            <Link href="/overrides" className="underline">
              /overrides
            </Link>
            .
          </p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Recent activity</h2>
          <Link href="/audit" className="text-xs text-gray-600 underline">
            Full audit log
          </Link>
        </div>
        {(!auditEntries || auditEntries.length === 0) && (
          <p className="text-sm text-gray-500">No recent activity visible for your role.</p>
        )}
        {auditEntries && auditEntries.length > 0 && (
          <ul className="space-y-1 text-sm">
            {auditEntries.map((a) => (
              <li key={a.id} className="text-gray-600">
                {new Date(a.at).toLocaleString()} — {emailFor(a.actor)} — {a.action} {a.table_name} ({a.row_pk})
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
