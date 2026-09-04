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
type IntercoFee = { supplier_branch: string; seller_branch: string; fee: number };
type TransportTier = { branch_id: string; tier: number; max_weight_kg: number | null; cost: number; currency: string };
type CustomsRate = { hs_code: string; zone: string; rate: number };
type MarginGrid = { branch_id: string; tier: number; max_cost_eur: number | null; margin: number };
type Setting = { key: string; value: unknown; note: string | null };
type Currency = { code: string };
type HsCode = { code: string; description: string | null };

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
    { data: intercoFees },
    { data: transportTiers },
    { data: customsRates },
    { data: marginGrids },
    { data: settings },
    { data: currencies },
    { data: hsCodes },
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
      .select('supplier_branch, seller_branch, fee')
      .order('supplier_branch')
      .order('seller_branch')
      .overrideTypes<IntercoFee[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('transport_tiers')
      .select('branch_id, tier, max_weight_kg, cost, currency')
      .order('branch_id')
      .order('tier')
      .overrideTypes<TransportTier[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('customs_rates')
      .select('hs_code, zone, rate')
      .order('hs_code')
      .order('zone')
      .overrideTypes<CustomsRate[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('margin_grids')
      .select('branch_id, tier, max_cost_eur, margin')
      .order('branch_id')
      .order('tier')
      .overrideTypes<MarginGrid[], { merge: false }>(),
    supabase.schema('tmsi').from('settings').select('key, value, note').order('key').overrideTypes<Setting[], { merge: false }>(),
    supabase.schema('tmsi').from('currencies').select('code').eq('active', true).order('code').overrideTypes<Currency[], { merge: false }>(),
    supabase.schema('tmsi').from('hs_codes').select('code, description').order('code').overrideTypes<HsCode[], { merge: false }>(),
  ]);

  const hsDescription = (code: string) => hsCodes?.find((h) => h.code === code)?.description ?? '';

  // tmsi.fx_rate() (0001 §7, tie-break added by 0005) picks, per currency,
  // the row with the latest effective_date and, among same-day entries,
  // the latest created_at — exactly the query's own ordering above, so
  // the first row seen per (currency, effective_date) group is the one
  // the engine actually uses today; 0005 allows more than one entry per
  // day specifically so a mistake can be corrected without waiting for
  // tomorrow, so any other row in that group is a superseded attempt, not
  // an error — shown as such rather than left unexplained.
  const activeExchangeRateIds = new Set<number>();
  const seenGroups = new Set<string>();
  for (const r of exchangeRates ?? []) {
    const groupKey = `${r.currency}-${r.effective_date}`;
    if (!seenGroups.has(groupKey)) {
      seenGroups.add(groupKey);
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
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Exchange rates</h2>
          <p className="mb-2 text-xs text-gray-500">
            Append-only: the engine always uses the latest entry with an effective date on or before
            today. To change a rate, add a new one — never edit history. Made a mistake today?
            Add a corrected entry with the same date — it takes over immediately, and the
            mistaken one is kept, marked below as superseded.
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
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Interco fees</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Supplier branch</th>
                <th className="py-2 pr-4">Seller branch</th>
                <th className="py-2 pr-4">Fee</th>
                {canWriteFinance && <th className="py-2 pr-4"></th>}
              </tr>
            </thead>
            <tbody>
              {intercoFees?.map((f) => (
                <IntercoFeeRow key={`${f.supplier_branch}-${f.seller_branch}`} fee={f} canWrite={canWriteFinance} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(readCosts || readLogistics) && (
        <section className="mb-10">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Transport tiers</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Branch</th>
                <th className="py-2 pr-4">Tier</th>
                <th className="py-2 pr-4">Max weight (kg)</th>
                <th className="py-2 pr-4">Cost</th>
                <th className="py-2 pr-4">Currency</th>
                {canWriteOperational && <th className="py-2 pr-4"></th>}
              </tr>
            </thead>
            <tbody>
              {transportTiers?.map((t) => (
                <TransportTierRow key={`${t.branch_id}-${t.tier}`} tier={t} canWrite={canWriteOperational} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(readCosts || readLogistics) && (
        <section className="mb-10">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Customs duty rates</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">HS code</th>
                <th className="py-2 pr-4">Zone</th>
                <th className="py-2 pr-4">Rate</th>
                {canWriteOperational && <th className="py-2 pr-4"></th>}
              </tr>
            </thead>
            <tbody>
              {customsRates?.map((c) => (
                <CustomsRateRow
                  key={`${c.hs_code}-${c.zone}`}
                  rate={c}
                  description={hsDescription(c.hs_code)}
                  canWrite={canWriteOperational}
                />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {readCosts && (
        <section className="mb-10">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Margin grids</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Branch</th>
                <th className="py-2 pr-4">Tier</th>
                <th className="py-2 pr-4">Max cost (EUR)</th>
                <th className="py-2 pr-4">Margin</th>
                {canWriteFinance && <th className="py-2 pr-4"></th>}
              </tr>
            </thead>
            <tbody>
              {marginGrids?.map((g) => (
                <MarginGridRow key={`${g.branch_id}-${g.tier}`} grid={g} canWrite={canWriteFinance} />
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
