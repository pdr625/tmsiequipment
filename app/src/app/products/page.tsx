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
  currency: string;
  exw_price: number;
};

// Row visibility is entirely tmsi.products_read (0001 §8) — admin/pm/
// finance/logistics/viewer see everything; branch_manager/sales/agent get
// their own scoped, status-filtered subset. No role check here decides
// what to query; the same SELECT just comes back with fewer rows.
export default async function ProductsPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: products, error }, canManage] = await Promise.all([
    supabase
      .schema('tmsi')
      .from('products')
      .select('id, name, item_type, status, primary_branch, currency, exw_price')
      .order('id')
      .overrideTypes<ProductRow[], { merge: false }>(),
    canManageProducts(),
  ]);

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
              <th className="py-2 pr-4">EXW price</th>
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
                <td className="py-2 pr-4">
                  {p.exw_price} {p.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
