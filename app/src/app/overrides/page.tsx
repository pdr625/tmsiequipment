/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { canManageAnyPriceOverride, isAdmin } from '@/lib/auth-guard';
import { overrideStatus } from '@/lib/override-status';
import { PriceOverrideForm, HsOverrideForm } from './forms';

type PriceOverride = {
  id: number;
  product_id: string;
  branch_id: string;
  kind: string;
  value: number;
  reason: string;
  valid_from: string;
  valid_to: string | null;
};
type HsOverride = { product_id: string; scope_type: string; scope_id: string; hs_code: string; reason: string };
type Product = { id: string; name: string };
type Branch = { id: string; name: string };
type HsCode = { code: string; description: string | null };

const KINDS = ['fx', 'fee', 'transport', 'duty', 'margin', 'coef'];

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-500',
  future: 'bg-blue-100 text-blue-700',
};

// Row visibility for price_overrides is entirely tmsi.overrides_read
// (RLS) — sales/agent get zero rows, no page-level redirect needed the
// way /config and /audit have one, since product_hs_overrides is
// genuinely open to any authenticated (0001 §8, ref_read using(true) —
// not cost data) and stays visible even to roles with no price-override
// access at all.
export default async function OverridesPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: priceOverrides }, { data: hsOverrides }, { data: products }, { data: branches }, { data: hsCodes }, canWritePrice, canWriteHs] =
    await Promise.all([
      supabase
        .schema('tmsi')
        .from('price_overrides')
        .select('id, product_id, branch_id, kind, value, reason, valid_from, valid_to')
        .order('valid_from', { ascending: false })
        .overrideTypes<PriceOverride[], { merge: false }>(),
      supabase
        .schema('tmsi')
        .from('product_hs_overrides')
        .select('product_id, scope_type, scope_id, hs_code, reason')
        .order('product_id')
        .overrideTypes<HsOverride[], { merge: false }>(),
      supabase.schema('tmsi').from('products').select('id, name').order('id').overrideTypes<Product[], { merge: false }>(),
      supabase.schema('tmsi').from('branches').select('id, name').eq('active', true).order('id').overrideTypes<Branch[], { merge: false }>(),
      supabase.schema('tmsi').from('hs_codes').select('code, description').order('code').overrideTypes<HsCode[], { merge: false }>(),
      canManageAnyPriceOverride(),
      isAdmin(),
    ]);

  const productName = (id: string) => products?.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Overrides</h1>
        <Link href="/" className="text-sm text-gray-600 underline">
          Back
        </Link>
      </div>

      <section className="mb-10">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Price overrides</h2>
        <p className="mb-2 text-xs text-gray-500">
          Each replaces one engine input (fx / fee / transport / duty / margin / coef), never
          the result. To correct one, create a new entry — never edit an existing override.
        </p>
        <table className="mb-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">Branch</th>
              <th className="py-2 pr-4">Kind</th>
              <th className="py-2 pr-4">Value</th>
              <th className="py-2 pr-4">Reason</th>
              <th className="py-2 pr-4">Valid</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {priceOverrides?.map((o) => {
              const s = overrideStatus(o.valid_from, o.valid_to);
              return (
                <tr key={o.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={`/products/${o.product_id}`} className="underline">
                      {productName(o.product_id)}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{o.branch_id}</td>
                  <td className="py-2 pr-4">{o.kind}</td>
                  <td className="py-2 pr-4">{o.value}</td>
                  <td className="py-2 pr-4">{o.reason}</td>
                  <td className="py-2 pr-4">
                    {o.valid_from} → {o.valid_to ?? 'open'}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[s]}`}>{s}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(!priceOverrides || priceOverrides.length === 0) && (
          <p className="mb-3 text-sm text-gray-500">No price overrides visible for your role.</p>
        )}
        {canWritePrice && <PriceOverrideForm products={products ?? []} branches={branches ?? []} kinds={KINDS} />}
      </section>

      <section className="mb-10">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">HS code overrides</h2>
        <p className="mb-2 text-xs text-gray-500">
          Replaces which HS code is used for the customs duty lookup in a specific scope,
          instead of the product&apos;s own default. Only branch scope has any effect on
          calculations today — channel/agent scope exists in the schema but the pricing engine
          does not read it yet.
        </p>
        <table className="mb-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">Scope</th>
              <th className="py-2 pr-4">HS code</th>
              <th className="py-2 pr-4">Reason</th>
            </tr>
          </thead>
          <tbody>
            {hsOverrides?.map((o) => (
              <tr key={`${o.product_id}-${o.scope_type}-${o.scope_id}`} className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <Link href={`/products/${o.product_id}`} className="underline">
                    {productName(o.product_id)}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  {o.scope_type}: {o.scope_id}
                  {o.scope_type !== 'branch' && (
                    <span className="ml-2 rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                      no effect — scope not yet supported by the pricing engine
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">{o.hs_code}</td>
                <td className="py-2 pr-4">{o.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!hsOverrides || hsOverrides.length === 0) && <p className="mb-3 text-sm text-gray-500">No HS overrides yet.</p>}
        {canWriteHs && <HsOverrideForm products={products ?? []} branches={branches ?? []} hsCodes={hsCodes ?? []} />}
      </section>
    </div>
  );
}
