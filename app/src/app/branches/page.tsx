/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/auth-guard';
import { pickActive } from '@/lib/pick-active';
import { CreateBranchForm, CreateChannelForm } from './forms';
import { BranchPricingParamsRow, TransportTierRow, TransportTierForm, MarginGridRow, MarginGridForm } from '../config/forms';

type Branch = { id: string; name: string; country: string; currency: string; zone: string; active: boolean };
type Channel = { id: string; name: string; branch_id: string; margin_delta: number; active: boolean };
type Currency = { code: string };
type BranchPricingParams = { id: number; branch_id: string; ref_factor: number; list_coef: number; effective_date: string; created_at: string };
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
type MarginGrid = {
  id: number;
  branch_id: string;
  tier: number;
  max_cost_eur: number | null;
  margin: number;
  effective_date: string;
  created_at: string;
};

// tmsi.branches/tmsi.channels use ref_read (USING (true) for any
// authenticated, 0001) — same tier as categories/hs_codes/suppliers/units,
// not the cost/operational boundary compute_price() callers go through.
// Anyone logged in can see this list; only isAdmin() (mirrors ref_write)
// gets the create forms and the per-branch rule editors below.
export default async function BranchesPage() {
  const supabase = await createSupabaseServerClient();
  const canWrite = await isAdmin();

  const [
    { data: branches },
    { data: channels },
    { data: currencies },
    { data: branchPricingParamsAll },
    { data: transportTiersAll },
    { data: marginGridsAll },
  ] = await Promise.all([
    supabase.schema('tmsi').from('branches').select('id, name, country, currency, zone, active').order('id').overrideTypes<Branch[], { merge: false }>(),
    supabase.schema('tmsi').from('channels').select('id, name, branch_id, margin_delta, active').order('id').overrideTypes<Channel[], { merge: false }>(),
    supabase.schema('tmsi').from('currencies').select('code').eq('active', true).order('code').overrideTypes<Currency[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('branch_pricing_params')
      .select('id, branch_id, ref_factor, list_coef, effective_date, created_at')
      .order('branch_id')
      .overrideTypes<BranchPricingParams[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('transport_tiers')
      .select('id, branch_id, tier, max_weight_kg, cost, currency, effective_date, created_at')
      .order('branch_id')
      .order('tier')
      .overrideTypes<TransportTier[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('margin_grids')
      .select('id, branch_id, tier, max_cost_eur, margin, effective_date, created_at')
      .order('branch_id')
      .order('tier')
      .overrideTypes<MarginGrid[], { merge: false }>(),
  ]);

  const branchPricingParams = pickActive(branchPricingParamsAll, (bp) => bp.branch_id);
  const transportTiers = pickActive(transportTiersAll, (t) => `${t.branch_id}|${t.tier}`);
  const marginGrids = pickActive(marginGridsAll, (g) => `${g.branch_id}|${g.tier}`);

  const pricingParamsFor = (branchId: string) =>
    branchPricingParams.find((bp) => bp.branch_id === branchId) ?? {
      id: -1,
      branch_id: branchId,
      ref_factor: 1.1,
      list_coef: 1,
      effective_date: '',
      created_at: '',
    };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Branches &amp; channels</h1>
        <Link href="/" className="text-sm text-gray-600 underline">
          Back
        </Link>
      </div>

      <section className="mb-10">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Branches</h2>
        <table className="mb-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">Code</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Country</th>
              <th className="py-2 pr-4">Currency</th>
              <th className="py-2 pr-4">Zone</th>
              <th className="py-2 pr-4">Active</th>
            </tr>
          </thead>
          <tbody>
            {branches?.map((b) => (
              <tr key={b.id} className="border-b border-gray-100">
                <td className="py-2 pr-4 font-medium">{b.id}</td>
                <td className="py-2 pr-4">{b.name}</td>
                <td className="py-2 pr-4">{b.country}</td>
                <td className="py-2 pr-4">{b.currency}</td>
                <td className="py-2 pr-4">{b.zone}</td>
                <td className="py-2 pr-4">{b.active ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {canWrite && <CreateBranchForm currencies={currencies ?? []} />}
      </section>

      <section className="mb-10">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Channels</h2>
        <table className="mb-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">Code</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Branch</th>
              <th className="py-2 pr-4">Margin delta</th>
              <th className="py-2 pr-4">Active</th>
            </tr>
          </thead>
          <tbody>
            {channels?.map((c) => (
              <tr key={c.id} className="border-b border-gray-100">
                <td className="py-2 pr-4 font-medium">{c.id}</td>
                <td className="py-2 pr-4">{c.name}</td>
                <td className="py-2 pr-4">{c.branch_id}</td>
                <td className="py-2 pr-4">{c.margin_delta}</td>
                <td className="py-2 pr-4">{c.active ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {canWrite && <CreateChannelForm branches={branches ?? []} />}
      </section>

      {canWrite && (
        <>
          <section className="mb-10">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700">Reference price factor</h2>
            </div>
            <p className="mb-2 text-xs text-gray-500">
              A branch with no proposal yet shows the neutral defaults (ref. factor 1.100, list coef.
              1.000) — proposing one seeds its first row, exactly like editing an existing one.
            </p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4">Branch</th>
                  <th className="py-2 pr-4">Ref. factor</th>
                  <th className="py-2 pr-4">List coef.</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {branches?.map((b) => (
                  <BranchPricingParamsRow key={b.id} params={pricingParamsFor(b.id)} canWrite={canWrite} />
                ))}
              </tbody>
            </table>
          </section>

          <section className="mb-10">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Transport tiers</h2>
            <table className="mb-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4">Branch</th>
                  <th className="py-2 pr-4">Tier</th>
                  <th className="py-2 pr-4">Max weight (kg)</th>
                  <th className="py-2 pr-4">Cost</th>
                  <th className="py-2 pr-4">Currency</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {transportTiers.map((t) => (
                  <TransportTierRow key={t.id} tier={t} canWrite={canWrite} />
                ))}
              </tbody>
            </table>
            <TransportTierForm branches={branches ?? []} />
          </section>

          <section className="mb-10">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Margin grids</h2>
            <table className="mb-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4">Branch</th>
                  <th className="py-2 pr-4">Tier</th>
                  <th className="py-2 pr-4">Max cost (EUR)</th>
                  <th className="py-2 pr-4">Margin</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {marginGrids.map((g) => (
                  <MarginGridRow key={g.id} grid={g} canWrite={canWrite} />
                ))}
              </tbody>
            </table>
            <MarginGridForm branches={branches ?? []} />
          </section>
        </>
      )}
    </div>
  );
}
