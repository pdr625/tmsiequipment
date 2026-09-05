/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { canManageProducts } from '@/lib/auth-guard';

type ProductRow = {
  id: string;
  name: string;
  item_type: string;
  status: string;
  primary_branch: string;
  currency: string | null;
  exw_price: number | null;
};

// tmsi.v_products (E3-0003/0004) — not the raw table. Row visibility is
// still entirely tmsi.products_visible() (the same predicate
// products_read's RLS uses). primary_branch is safe/ungated (0004 —
// routing metadata, not sensitive, and price-by-branch on the detail page
// needs it regardless of role); currency/exw_price stay financial-tier,
// NULL from the view itself for callers without can_read_costs() — the
// DB decides this, not a role check here. exw_price is NOT NULL at the
// table level (0001 §3), so "did at least one row come back non-null" is
// a reliable per-caller signal here (unlike a single detail row, where an
// individual product's own nullable columns could be genuinely null —
// see products/[id]/page.tsx).
export default async function ProductsPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: products, error }, canManage] = await Promise.all([
    supabase
      .schema('tmsi')
      .from('v_products')
      .select('id, name, item_type, status, primary_branch, currency, exw_price')
      .order('id')
      .overrideTypes<ProductRow[], { merge: false }>(),
    canManageProducts(),
  ]);

  const seesCosts = products?.some((p) => p.exw_price !== null) ?? false;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Products</h1>
        <div className="flex items-center gap-4">
          <a
            href="/products/export"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Export to Excel
          </a>
          {canManage && (
            <Link
              href="/products/new"
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white"
            >
              New product
            </Link>
          )}
          <Link href="/" className="text-sm text-gray-600 underline">
            Back
          </Link>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {!error && products?.length === 0 && (
        <p className="text-sm text-gray-600">No products visible for your role.</p>
      )}

      {!error && products && products.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Branch</th>
              {seesCosts && <th className="py-2 pr-4">EXW price</th>}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <Link href={`/products/${p.id}`} className="underline">
                    {p.name}
                  </Link>{' '}
                  <span className="text-gray-400">({p.id})</span>
                </td>
                <td className="py-2 pr-4">{p.item_type}</td>
                <td className="py-2 pr-4">{p.status}</td>
                <td className="py-2 pr-4">{p.primary_branch}</td>
                {seesCosts && (
                  <td className="py-2 pr-4">
                    {p.exw_price ?? '—'} {p.currency}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
