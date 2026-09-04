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
  currency?: string;
  exw_price?: number;
};

const SAFE_COLUMNS = 'id, name, item_type, status, primary_branch';
const COST_COLUMNS = 'id, name, item_type, status, primary_branch, currency, exw_price';

// Row visibility is entirely tmsi.products_read (0001 §8) — admin/pm/
// finance/logistics/viewer see everything; branch_manager/sales/agent get
// their own scoped, status-filtered subset. No role check decides *which
// rows* come back.
//
// exw_price is a different problem: it's a plain column on tmsi.products,
// with no column-level protection at all — RLS only gates rows. compute_price()
// treats it as the raw input to every cost figure it computes and nulls
// those outputs for non-cost roles; querying the table directly bypassed
// that entirely (caught live: sales.sa could read it here). Fix is to not
// select the column at all for non-cost roles — can_read_costs() decides
// which column list to query, same predicate compute_price()'s own
// see_costs uses, mirroring how v_selling_prices (i2) already excludes
// exw_price from what a non-cost role's view can return.
export default async function ProductsPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: canReadCosts }, canManage] = await Promise.all([
    supabase.schema('tmsi').rpc('can_read_costs'),
    canManageProducts(),
  ]);

  const { data: products, error } = await supabase
    .schema('tmsi')
    .from('products')
    .select(canReadCosts ? COST_COLUMNS : SAFE_COLUMNS)
    .order('id')
    .overrideTypes<ProductRow[], { merge: false }>();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Products</h1>
        <div className="flex items-center gap-4">
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
              {canReadCosts && <th className="py-2 pr-4">EXW price</th>}
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
                {canReadCosts && (
                  <td className="py-2 pr-4">
                    {p.exw_price} {p.currency}
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
