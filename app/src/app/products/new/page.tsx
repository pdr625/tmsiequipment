/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { canManageProducts } from '@/lib/auth-guard';
import { CreateProductForm } from './create-form';

type Branch = { id: string; name: string };
type Currency = { code: string };

// Real gate: redirect('/'), mirroring admin/users — canManageProducts()
// asks Postgres (has_role admin/product_manager), the same predicate
// tmsi.products_write_pm's RLS uses. Only the columns that are actually
// NOT NULL without a default on tmsi.products (0001 §3) are collected
// here — everything else (HS code, weight, unit, SAP code...) is deferred
// to the edit screen, matching the schema's own draft-first lifecycle: a
// draft genuinely doesn't need them, only activation does.
export default async function NewProductPage() {
  if (!(await canManageProducts())) {
    redirect('/');
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: branches }, { data: currencies }] = await Promise.all([
    supabase
      .schema('tmsi')
      .from('branches')
      .select('id, name')
      .eq('active', true)
      .order('id')
      .overrideTypes<Branch[], { merge: false }>(),
    supabase
      .schema('tmsi')
      .from('currencies')
      .select('code')
      .eq('active', true)
      .order('code')
      .overrideTypes<Currency[], { merge: false }>(),
  ]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">New product (draft)</h1>
        <Link href="/products" className="text-sm text-gray-600 underline">
          Back
        </Link>
      </div>
      <CreateProductForm branches={branches ?? []} currencies={currencies ?? []} />
    </div>
  );
}
