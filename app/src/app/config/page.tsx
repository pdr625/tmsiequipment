/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { canManageFinanceConfig, canManageOperationalConfig, pricingConfigReadAccess } from '@/lib/auth-guard';
import {
  ExchangeRateForm,
  IntercoFeeRow,
  TransportTierRow,
  CustomsRateRow,
  MarginGridRow,
  SettingRow,
} from './forms';

type ExchangeRate = {
  id: number;
  currency: string;
  rate_per_eur: number;
  effective_date: string;
  source: string;
  created_at: string;
};
// 0007 (E4) gave these four the same effective_date/created_at
// versioning exchange_rates already had — id is now the primary key, the
// old natural key can carry more than one historical row per identity.
type IntercoFee = { id: number; supplier_branch: string; seller_branch: string; fee: number; effective_date: string; created_at: string };
type TransportTier = {
  id: number;
  branch_id: string;
  tier: number;
  max_weight_kg: number | null;
  cost: number;
  currency: string;
  effective_date: string;
  created_at: string;
};
type CustomsRate = { id: number; hs_code: string; zone: string; rate: number; effective_date: string; created_at: string };
type MarginGrid = {
  id: number;
  branch_id: string;
  tier: number;
  max_cost_eur: number | null;
  margin: number;
  effective_date: string;
  created_at: string;
};
type Setting = { key: string; value: unknown; note: string | null };
type Currency = { code: string };
type HsCode = { code: string; description: string | null };
type PendingProposal = { id: number; target_table: string };

// Same "latest row with effective_date <= today, ties broken by the
// latest created_at" selection tmsi.fx_rate()/tmsi.compute_price() apply
// in Postgres (0005/0007) — applied here in JS to pick, per identity
// (e.g. one (branch_id, tier) pair), the single row this page shows as
// "the current value", exactly mirroring the one-row-per-identity view
// this page already gave before 0007 introduced history. Older/future
// rows for the same identity are real, queryable history (via the audit
// log) — just not re-surfaced as a second UI here, which restriction 6
// (0007) doesn't ask for.
function pickActive<T extends { effective_date: string; created_at: string }>(rows: T[] | null, keyOf: (row: T) => string): T[] {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...(rows ?? [])].sort((a, b) => {
    if (a.effective_date !== b.effective_date) return a.effective_date < b.effective_date ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });
  const seen = new Set<string>();
  const active: T[] = [];
  for (const row of sorted) {
    if (row.effective_date > today) continue;
    const key = keyOf(row);
    if (seen.has(key)) continue;
    seen.add(key);
    active.push(row);
  }
  return active;
}

function PendingBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Link href="/proposals" className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
      {count} pending approval
    </Link>
  );
}

// Page-level gate is convenience only, same principle as every other
// admin-adjacent page in this app: tmsi.can_read_costs() OR
// has_role('logistics') is exactly "can this role read at least one
// pricing config table other than settings" — settings itself stays
// readable to any authenticated (0001 §8, config_read using(true)) via
// direct API regardless of whether this specific page chooses to route
// them here. Real enforcement is the RLS on each table (F0, STATE.md);
// this redirect just keeps sales/agent from landing on a page that would
// otherwise show them only an empty shell.
export default async function ConfigPage() {
  const supabase = await createSupabaseServerClient();

  const [{ readCosts, readLogistics }, canWriteFinance, canWriteOperational] = await Promise.all([
    pricingConfigReadAccess(),
    canManageFinanceConfig(),
    canManageOperationalConfig(),
  ]);

  if (!readCosts && !readLogistics) {
    redirect('/');
  }

  const [
    { data: exchangeRates },
    { data: intercoFeesAll },
    { data: transportTiersAll },
    { data: customsRatesAll },
    { data: marginGridsAll },
    { data: settings },
    { data: currencies },
    { data: hsCodes },
    { data: pendingProposals },
  ] = await Promise.all([
    supabase
      .schema('tmsi')
      .from('exchange_rates')
      .select('id, currency, rate_per_eur, effective_date, source, created_at')
      .order('currency')
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })
      .overrideTypes<ExchangeRate[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('interco_fees')
      .select('id, supplier_branch, seller_branch, fee, effective_date, created_at')
      .order('supplier_branch')
      .order('seller_branch')
      .overrideTypes<IntercoFee[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('transport_tiers')
      .select('id, branch_id, tier, max_weight_kg, cost, currency, effective_date, created_at')
      .order('branch_id')
      .order('tier')
      .overrideTypes<TransportTier[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('customs_rates')
      .select('id, hs_code, zone, rate, effective_date, created_at')
      .order('hs_code')
      .order('zone')
      .overrideTypes<CustomsRate[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('margin_grids')
      .select('id, branch_id, tier, max_cost_eur, margin, effective_date, created_at')
      .order('branch_id')
      .order('tier')
      .overrideTypes<MarginGrid[], { merge: false }>(),
    supabase.schema('tmsi').from('settings').select('key, value, note').order('key').overrideTypes<Setting[], { merge: false }>(),
    supabase.schema('tmsi').from('currencies').select('code').eq('active', true).order('code').overrideTypes<Currency[], { merge: false }>(),
    supabase.schema('tmsi').from('hs_codes').select('code, description').order('code').overrideTypes<HsCode[], { merge: false }>(),
    // Visibility is tmsi.proposals_read (RLS, 0007) — whatever this
    // session can see is exactly what's relevant to badge here.
    supabase
      .schema('tmsi')
      .from('price_proposals')
      .select('id, target_table')
      .eq('status', 'pending')
      .overrideTypes<PendingProposal[], { merge: false }>(),
  ]);

  const hsDescription = (code: string) => hsCodes?.find((h) => h.code === code)?.description ?? '';
  const pendingCount = (table: string) => pendingProposals?.filter((p) => p.target_table === table).length ?? 0;

  const intercoFees = pickActive(intercoFeesAll, (f) => `${f.supplier_branch}|${f.seller_branch}`);
  const transportTiers = pickActive(transportTiersAll, (t) => `${t.branch_id}|${t.tier}`);
  const customsRates = pickActive(customsRatesAll, (c) => `${c.hs_code}|${c.zone}`);
  const marginGrids = pickActive(marginGridsAll, (g) => `${g.branch_id}|${g.tier}`);

  // tmsi.fx_rate() (0001 §7, tie-break added by 0005) picks, per currency,
  // the ONE row with the latest effective_date <= today and, among
  // same-day entries, the latest created_at — exactly the query's own
  // ordering above, so per currency the first row seen with an
  // effective_date not in the future is the one the engine actually uses
  // today; every other row (an older date, a same-day entry beaten by a
  // later correction, or a not-yet-effective future date) is superseded,
  // not an error — shown as such rather than left unexplained.
  const today = new Date().toISOString().slice(0, 10);
  const activeExchangeRateIds = new Set<number>();
  const seenCurrencies = new Set<string>();
  for (const r of exchangeRates ?? []) {
    if (r.effective_date > today) continue;
    if (!seenCurrencies.has(r.currency)) {
      seenCurrencies.add(r.currency);
      activeExchangeRateIds.add(r.id);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pricing configuration</h1>
        <Link href="/" className="text-sm text-gray-600 underline">
          Back
        </Link>
      </div>

      {readCosts && (
        <section className="mb-10">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Exchange rates</h2>
            <PendingBadge count={pendingCount('exchange_rates')} />
          </div>
          <p className="mb-2 text-xs text-gray-500">
            Append-only: the engine always uses the latest entry with an effective date on or before
            today. To change a rate, propose a new one — never edit history. It takes effect once
            approved. Made a mistake today? Propose a corrected entry with the same date — once
            approved it takes over immediately, and the mistaken one is kept, marked below as
            superseded.
          </p>
          <table className="mb-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Currency</th>
                <th className="py-2 pr-4">Rate (per EUR)</th>
                <th className="py-2 pr-4">Effective date</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {exchangeRates?.map((r) => {
                const active = activeExchangeRateIds.has(r.id);
                return (
                  <tr key={r.id} className={`border-b border-gray-100 ${active ? '' : 'text-gray-400'}`}>
                    <td className="py-2 pr-4">{r.currency}</td>
                    <td className="py-2 pr-4">{r.rate_per_eur}</td>
                    <td className="py-2 pr-4">{r.effective_date}</td>
                    <td className="py-2 pr-4">{r.source}</td>
                    <td className="py-2 pr-4">
                      {active ? (
                        'in use'
                      ) : (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                          superseded same day
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {canWriteFinance && <ExchangeRateForm currencies={currencies ?? []} />}
        </section>
      )}

      {readCosts && (
        <section className="mb-10">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Interco fees</h2>
            <PendingBadge count={pendingCount('interco_fees')} />
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Supplier branch</th>
                <th className="py-2 pr-4">Seller branch</th>
                <th className="py-2 pr-4">Fee</th>
                {canWriteFinance && <th className="py-2 pr-4">Reason</th>}
                {canWriteFinance && <th className="py-2 pr-4"></th>}
              </tr>
            </thead>
            <tbody>
              {intercoFees.map((f) => (
                <IntercoFeeRow key={f.id} fee={f} canWrite={canWriteFinance} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(readCosts || readLogistics) && (
        <section className="mb-10">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Transport tiers</h2>
            <PendingBadge count={pendingCount('transport_tiers')} />
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Branch</th>
                <th className="py-2 pr-4">Tier</th>
                <th className="py-2 pr-4">Max weight (kg)</th>
                <th className="py-2 pr-4">Cost</th>
                <th className="py-2 pr-4">Currency</th>
                {canWriteOperational && <th className="py-2 pr-4">Reason</th>}
                {canWriteOperational && <th className="py-2 pr-4"></th>}
              </tr>
            </thead>
            <tbody>
              {transportTiers.map((t) => (
                <TransportTierRow key={t.id} tier={t} canWrite={canWriteOperational} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(readCosts || readLogistics) && (
        <section className="mb-10">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Customs duty rates</h2>
            <PendingBadge count={pendingCount('customs_rates')} />
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">HS code</th>
                <th className="py-2 pr-4">Zone</th>
                <th className="py-2 pr-4">Rate</th>
                {canWriteOperational && <th className="py-2 pr-4">Reason</th>}
                {canWriteOperational && <th className="py-2 pr-4"></th>}
              </tr>
            </thead>
            <tbody>
              {customsRates.map((c) => (
                <CustomsRateRow key={c.id} rate={c} description={hsDescription(c.hs_code)} canWrite={canWriteOperational} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {readCosts && (
        <section className="mb-10">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Margin grids</h2>
            <PendingBadge count={pendingCount('margin_grids')} />
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Branch</th>
                <th className="py-2 pr-4">Tier</th>
                <th className="py-2 pr-4">Max cost (EUR)</th>
                <th className="py-2 pr-4">Margin</th>
                {canWriteFinance && <th className="py-2 pr-4">Reason</th>}
                {canWriteFinance && <th className="py-2 pr-4"></th>}
              </tr>
            </thead>
            <tbody>
              {marginGrids.map((g) => (
                <MarginGridRow key={g.id} grid={g} canWrite={canWriteFinance} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Settings</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">Key</th>
              <th className="py-2 pr-4">Value</th>
              <th className="py-2 pr-4">Note</th>
              {canWriteFinance && <th className="py-2 pr-4"></th>}
            </tr>
          </thead>
          <tbody>
            {settings?.map((s) => (
              <SettingRow key={s.key} setting={s} canWrite={canWriteFinance} />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
