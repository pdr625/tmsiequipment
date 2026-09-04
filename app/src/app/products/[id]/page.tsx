/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { canManageProducts } from '@/lib/auth-guard';
import { EditProductForm } from './edit-form';

// Safe/ungated columns (tmsi.v_products, E3-0003/0004): id, name,
// category_id, item_type, status, lead_time_days, unit, primary_branch,
// sold_in — the last two moved here in 0004 after primary_branch/sold_in
// being gated broke the price-by-branch section below for sales/agent,
// who need them to know which branches to ask compute_price() about.
// Everything else comes back null for a caller without
// can_read_operational()/can_read_costs() — the DB decides this, not a
// role check here. Optional/nullable throughout rather than split into
// separate "safe"/"operational"/"cost" shapes, since which fields are
// actually present varies per caller and isn't knowable from TypeScript.
type Product = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  item_type: string;
  parent_id: string | null;
  supplier_id: string | null;
  origin_country: string | null;
  currency: string | null;
  exw_price: number | null;
  primary_branch: string;
  hs_code: string | null;
  gross_weight_kg: number | null;
  net_weight_kg: number | null;
  volume_m3: number | null;
  dimensions: string | null;
  palletizable: boolean | null;
  pallets: number | null;
  stackable: boolean | null;
  unit: string | null;
  lead_time_days: number | null;
  sap_code_sa: string | null;
  sap_code_cn: string | null;
  sap_code_us: string | null;
  sap_code_uk: string | null;
  status: string;
  sold_in: string[];
};

type PriceBreakdown = {
  branch_id: string;
  currency: string;
  fx_used: number | null;
  exw_local: number | null;
  fee: number | null;
  interco: number | null;
  transport: number | null;
  duty_rate: number | null;
  duty: number | null;
  total_cost: number | null;
  total_cost_eur: number | null;
  margin: number | null;
  list_coef: number | null;
  min_price: number | null;
  ref_price: number | null;
  alert: string | null;
  overrides: string[] | null;
};

type PriceVersion = { id: number; version: number; currency: string; exw_price: number; changed_at: string; note: string | null };
type AuditEntry = { id: number; at: string; actor: string | null; action: string; old_row: unknown; new_row: unknown };
type PriceOverride = {
  id: number;
  branch_id: string;
  kind: string;
  value: number;
  reason: string;
  valid_from: string;
  valid_to: string | null;
};
type HsOverride = { scope_type: string; scope_id: string; hs_code: string; reason: string };
type Branch = { id: string; name: string };
type RefRow = { id?: string; code?: string; name?: string; description?: string };

// today <= valid_from -> future; valid_to set and < today -> expired;
// otherwise active — same classification /overrides/page.tsx uses,
// mirroring tmsi.override_value()'s own date range (0001 §7), never a
// new rule.
function overrideStatus(validFrom: string, validTo: string | null): 'active' | 'expired' | 'future' {
  const today = new Date().toISOString().slice(0, 10);
  if (validFrom > today) return 'future';
  if (validTo !== null && validTo < today) return 'expired';
  return 'active';
}

// Everything a role should not see is decided by Postgres, not this page:
// tmsi.v_products (E3-0003/0004) gates rows via tmsi.products_visible()
// (the same predicate products_read's RLS uses) and nulls out
// operational/financial columns per-column via can_read_operational()/
// can_read_costs() — the exact same functions compute_price()'s own
// see_sell/see_costs and the config_read policies on transport_tiers/
// customs_rates already use, not new logic invented for this page.
// price_versions/audit_log RLS return empty rather than an error for
// roles without read access. This page only decides whether to render
// the *edit* controls (canManageProducts()) — convenience;
// tmsi.products_write_pm (RLS) is the real boundary for the Server
// Action itself, which still writes the raw table directly (unaffected
// by 0003/0004 — only SELECT was ever touched).
export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: product }, canManage, { data: canReadOperational }, { data: canReadCosts }] = await Promise.all([
    supabase.schema('tmsi').from('v_products').select('*').eq('id', id).maybeSingle<Product>(),
    canManageProducts(),
    supabase.schema('tmsi').rpc('can_read_operational'),
    supabase.schema('tmsi').rpc('can_read_costs'),
  ]);

  if (!product) {
    notFound();
  }

  // Not derived from whether hs_code/exw_price etc. actually came back
  // non-null on THIS row — every operational-tier column (and
  // description/parent_id/origin_country) is nullable at the table level
  // too (options/services legitimately have null hs_code/gross_weight_kg,
  // 0001 §3), so a cost/operational-visible role viewing one of those
  // would wrongly look ungated. currency/exw_price are NOT NULL at the
  // table level (0001 §3), so they'd be safe single-row signals for
  // canReadCosts specifically, but the direct RPC call is simpler and
  // uniform with canReadOperational, which has no such safe column at all.

  const branchIds = Array.from(new Set([product.primary_branch, ...product.sold_in]));

  const [
    { data: branches },
    { data: categories },
    { data: units },
    { data: suppliers },
    { data: hsCodes },
    { data: versions },
    { data: auditEntries },
    { data: priceOverrides },
    { data: hsOverrides },
    priceResults,
  ] = await Promise.all([
    supabase.schema('tmsi').from('branches').select('id, name').eq('active', true).order('id').overrideTypes<Branch[], { merge: false }>(),
    supabase.schema('tmsi').from('categories').select('id, name').order('id').overrideTypes<RefRow[], { merge: false }>(),
    supabase.schema('tmsi').from('units').select('code, name').order('code').overrideTypes<RefRow[], { merge: false }>(),
    supabase.schema('tmsi').from('suppliers').select('id, name').order('id').overrideTypes<RefRow[], { merge: false }>(),
    supabase.schema('tmsi').from('hs_codes').select('code, description').order('code').overrideTypes<RefRow[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('price_versions')
      .select('id, version, currency, exw_price, changed_at, note')
      .eq('product_id', id)
      .order('version', { ascending: false })
      .overrideTypes<PriceVersion[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('audit_log')
      .select('id, at, actor, action, old_row, new_row')
      .eq('table_name', 'products')
      .eq('row_pk', id)
      .order('at', { ascending: false })
      .overrideTypes<AuditEntry[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('price_overrides')
      .select('id, branch_id, kind, value, reason, valid_from, valid_to')
      .eq('product_id', id)
      .order('valid_from', { ascending: false })
      .overrideTypes<PriceOverride[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('product_hs_overrides')
      .select('scope_type, scope_id, hs_code, reason')
      .eq('product_id', id)
      .overrideTypes<HsOverride[], { merge: false }>(),
    Promise.all(
      branchIds.map((b) => supabase.schema('tmsi').rpc('compute_price', { p_product: id, p_branch: b })),
    ),
  ]);

  // compute_price() has no generated Database type behind it (this app has
  // none — E1), so .rpc() falls back to a loose result shape that
  // .overrideTypes() rejects for a setof/array return. Same plain-cast
  // fallback prices/page.tsx already uses for its view rows; bridged
  // through unknown since the inferred single-row shape and the real
  // setof-row array don't structurally overlap enough for a direct `as`.
  const priceRows = priceResults.flatMap((r) => (r.data ?? []) as unknown as PriceBreakdown[]);
  const seesCosts = priceRows.some((r) => r.total_cost_eur !== null);

  // Only scope_type='branch' actually reaches compute_price()'s duty
  // calculation (F0 finding, E3-i6/STATE.md) — a channel/agent override
  // for this product would never show up here, matching what the engine
  // itself does.
  const hsOverrideFor = (branchId: string) => hsOverrides?.find((h) => h.scope_type === 'branch' && h.scope_id === branchId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {product.name} <span className="text-gray-400">({product.id})</span>
        </h1>
        <Link href="/products" className="text-sm text-gray-600 underline">
          Back
        </Link>
      </div>

      <div className="mb-8 rounded-lg border border-gray-200 p-4 text-sm">
        <p>
          <span className="text-gray-500">Status:</span> <span className="font-medium">{product.status}</span> ·{' '}
          <span className="text-gray-500">Type:</span> {product.item_type} ·{' '}
          <span className="text-gray-500">Primary branch:</span> {product.primary_branch}
        </p>
        <p className="mt-1">
          <span className="text-gray-500">Sold in:</span> {product.sold_in.join(', ') || '—'}
        </p>
        {canReadOperational && (
          <p className="mt-1 text-gray-500">
            HS {product.hs_code ?? '—'} · Weight {product.gross_weight_kg ?? '—'} kg · Unit {product.unit ?? '—'}
          </p>
        )}
        {canReadCosts && (
          <p className="mt-1">
            <span className="text-gray-500">EXW:</span> {product.exw_price} {product.currency} ·{' '}
            <span className="text-gray-500">SAP (SA/CN/US/UK):</span> {product.sap_code_sa ?? '—'} /{' '}
            {product.sap_code_cn ?? '—'} / {product.sap_code_us ?? '—'} / {product.sap_code_uk ?? '—'}
          </p>
        )}
      </div>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Price by branch</h2>
        {priceRows.length === 0 && <p className="text-sm text-gray-500">Not priced for any branch visible to you.</p>}
        {priceRows.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Branch</th>
                {seesCosts && (
                  <>
                    <th className="py-2 pr-4">Total cost (EUR)</th>
                    <th className="py-2 pr-4">Margin</th>
                  </>
                )}
                <th className="py-2 pr-4">Min price</th>
                <th className="py-2 pr-4">Ref price</th>
                <th className="py-2 pr-4">Alert</th>
                <th className="py-2 pr-4">Overridden</th>
              </tr>
            </thead>
            <tbody>
              {priceRows.map((r) => {
                const hsOverride = hsOverrideFor(r.branch_id);
                const overriddenInputs = [...(r.overrides ?? []), ...(hsOverride ? ['hs_code'] : [])];
                return (
                  <tr key={r.branch_id} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{r.branch_id}</td>
                    {seesCosts && (
                      <>
                        <td className="py-2 pr-4">{r.total_cost_eur ?? '—'}</td>
                        <td className="py-2 pr-4">{r.margin ?? '—'}</td>
                      </>
                    )}
                    <td className="py-2 pr-4">
                      {r.min_price ?? '—'} {r.currency}
                    </td>
                    <td className="py-2 pr-4">
                      {r.ref_price ?? '—'} {r.currency}
                    </td>
                    <td className="py-2 pr-4">{r.alert ?? '—'}</td>
                    <td className="py-2 pr-4">
                      {overriddenInputs.length === 0 ? (
                        '—'
                      ) : (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700" title={hsOverride ? `HS: ${hsOverride.hs_code}` : undefined}>
                          {overriddenInputs.join(', ')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {versions && versions.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Price history</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Version</th>
                <th className="py-2 pr-4">EXW</th>
                <th className="py-2 pr-4">Changed at</th>
                <th className="py-2 pr-4">Note</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{v.version}</td>
                  <td className="py-2 pr-4">
                    {v.exw_price} {v.currency}
                  </td>
                  <td className="py-2 pr-4">{new Date(v.changed_at).toLocaleString()}</td>
                  <td className="py-2 pr-4">{v.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {((priceOverrides && priceOverrides.length > 0) || (hsOverrides && hsOverrides.length > 0)) && (
        <section className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Overrides</h2>
            <Link href="/overrides" className="text-xs text-gray-600 underline">
              Manage overrides
            </Link>
          </div>
          {priceOverrides && priceOverrides.length > 0 && (
            <table className="mb-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4">Branch</th>
                  <th className="py-2 pr-4">Kind</th>
                  <th className="py-2 pr-4">Value</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4">Valid</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {priceOverrides.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{o.branch_id}</td>
                    <td className="py-2 pr-4">{o.kind}</td>
                    <td className="py-2 pr-4">{o.value}</td>
                    <td className="py-2 pr-4">{o.reason}</td>
                    <td className="py-2 pr-4">
                      {o.valid_from} → {o.valid_to ?? 'open'}
                    </td>
                    <td className="py-2 pr-4">{overrideStatus(o.valid_from, o.valid_to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {hsOverrides && hsOverrides.length > 0 && (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4">Scope</th>
                  <th className="py-2 pr-4">HS code</th>
                  <th className="py-2 pr-4">Reason</th>
                </tr>
              </thead>
              <tbody>
                {hsOverrides.map((o) => (
                  <tr key={`${o.scope_type}-${o.scope_id}`} className="border-b border-gray-100">
                    <td className="py-2 pr-4">
                      {o.scope_type}: {o.scope_id}
                      {o.scope_type !== 'branch' && (
                        <span className="ml-2 rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">no effect</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{o.hs_code}</td>
                    <td className="py-2 pr-4">{o.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {auditEntries && auditEntries.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Audit log</h2>
          <ul className="space-y-1 text-sm">
            {auditEntries.map((a) => (
              <li key={a.id} className="text-gray-600">
                {new Date(a.at).toLocaleString()} — {a.action}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canManage && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Edit</h2>
          <EditProductForm
            product={product}
            branches={branches ?? []}
            categories={categories ?? []}
            units={units ?? []}
            suppliers={suppliers ?? []}
            hsCodes={hsCodes ?? []}
          />
        </section>
      )}
    </div>
  );
}
