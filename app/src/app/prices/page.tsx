/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getBranding, footerLines } from '@/lib/branding';
import { PrintButton } from './print-button';

type BranchPriceRow = {
  product_id: string;
  branch_id: string;
  currency: string;
  total_cost_eur: number | null;
  margin: number | null;
  min_price: number | null;
  ref_price: number | null;
  alert: string | null;
};

type SellingPriceRow = {
  product_id: string;
  name: string;
  branch_id: string;
  currency: string;
  min_price: number | null;
  ref_price: number | null;
  lead_time_days: number | null;
};

type Branch = { id: string; name: string };

// Which view a user gets (full costs vs selling-price-only) is a security
// decision, not a UI one — the page asks Postgres (tmsi.can_read_costs(),
// the same predicate compute_price() itself uses) rather than
// re-implementing the role check here. Whatever it answers, RLS on the
// underlying tables still scopes which *rows* come back — this is a
// convenience choice of view, not the actual access control.
export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: canReadCosts } = await supabase.schema('tmsi').rpc('can_read_costs');
  const viewName = canReadCosts ? 'v_branch_prices' : 'v_selling_prices';

  let query = supabase.schema('tmsi').from(viewName).select('*');
  if (branch) {
    query = query.eq('branch_id', branch);
  }
  const { data: rows, error } = await query;

  const { data: branches } = await supabase
    .schema('tmsi')
    .from('branches')
    .select('id, name')
    .eq('active', true)
    .order('id')
    .overrideTypes<Branch[], { merge: false }>();

  // i10: same metadata the .xlsx export carries in its own header block —
  // shown here only for print (the screen already has the branch filter
  // for scope, and no on-screen use for the rest).
  const generatedAt = new Date();
  const currencies = [...new Set((rows ?? []).map((r) => (r as { currency: string }).currency))].sort();
  const branding = await getBranding();
  const footer = footerLines(branding);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 hidden print:block" style={{ fontFamily: branding.fontFamily }}>
        {branding.logoId !== null && (
          <img src="/api/branding/logo" alt="" className="mb-2 h-10 w-auto" />
        )}
        <h1 className="text-lg font-bold" style={{ color: branding.primaryColor }}>
          {branding.displayName} — Price list
        </h1>
        {branding.tagline !== '' && <p className="text-sm text-gray-600">{branding.tagline}</p>}
        <p className="text-sm">Scope: {branch ?? 'All branches'}</p>
        <p className="text-sm">Currency: {currencies.join(', ') || '—'}</p>
        <p className="text-sm">
          Generated: {generatedAt.toISOString()} by {user?.email}
        </p>
      </div>

      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Price list</h1>
        <div className="flex items-center gap-4">
          <a
            href={branch ? `/prices/export?branch=${branch}` : '/prices/export'}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium"
          >
            Export to Excel
          </a>
          <PrintButton />
          <Link href="/" className="text-sm text-gray-600 underline">
            Back
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        <Link
          href="/prices"
          className={`rounded-md border px-3 py-1 text-sm ${!branch ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'}`}
        >
          All branches
        </Link>
        {branches?.map((b) => (
          <Link
            key={b.id}
            href={`/prices?branch=${b.id}`}
            className={`rounded-md border px-3 py-1 text-sm ${branch === b.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'}`}
          >
            {b.name}
          </Link>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {!error && rows?.length === 0 && (
        <p className="text-sm text-gray-600">No prices visible for your role in this scope.</p>
      )}

      {!error && rows && rows.length > 0 && canReadCosts && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">Branch</th>
              <th className="py-2 pr-4">Currency</th>
              <th className="py-2 pr-4">Total cost (EUR)</th>
              <th className="py-2 pr-4">Margin</th>
              <th className="py-2 pr-4">Min price</th>
              <th className="py-2 pr-4">Ref price</th>
              <th className="py-2 pr-4">Alert</th>
            </tr>
          </thead>
          <tbody>
            {(rows as BranchPriceRow[]).map((r) => (
              <tr key={`${r.product_id}-${r.branch_id}`} className="border-b border-gray-100">
                <td className="py-2 pr-4">{r.product_id}</td>
                <td className="py-2 pr-4">{r.branch_id}</td>
                <td className="py-2 pr-4">{r.currency}</td>
                <td className="py-2 pr-4">{r.total_cost_eur ?? '—'}</td>
                <td className="py-2 pr-4">{r.margin ?? '—'}</td>
                <td className="py-2 pr-4">{r.min_price ?? '—'}</td>
                <td className="py-2 pr-4">{r.ref_price ?? '—'}</td>
                <td className="py-2 pr-4">{r.alert ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!error && rows && rows.length > 0 && !canReadCosts && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">Branch</th>
              <th className="py-2 pr-4">Currency</th>
              <th className="py-2 pr-4">Min price</th>
              <th className="py-2 pr-4">Ref price</th>
              <th className="py-2 pr-4">Lead time (days)</th>
            </tr>
          </thead>
          <tbody>
            {(rows as SellingPriceRow[]).map((r) => (
              <tr key={`${r.product_id}-${r.branch_id}`} className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  {r.name} <span className="text-gray-400">({r.product_id})</span>
                </td>
                <td className="py-2 pr-4">{r.branch_id}</td>
                <td className="py-2 pr-4">{r.currency}</td>
                <td className="py-2 pr-4">{r.min_price ?? '—'}</td>
                <td className="py-2 pr-4">{r.ref_price ?? '—'}</td>
                <td className="py-2 pr-4">{r.lead_time_days ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {footer.length > 0 && (
        <div className="mt-6 hidden text-xs text-gray-500 print:block" style={{ fontFamily: branding.fontFamily }}>
          {footer.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
