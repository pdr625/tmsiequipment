/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { canManageProducts } from '@/lib/auth-guard';

export type CreateProductState = { error: string } | undefined;

// Real gate first, with the caller's own session — before the insert is
// even attempted. tmsi.products_write_pm (RLS) is the actual boundary;
// this check only avoids a wasted round trip for a caller who would be
// denied anyway.
export async function createProduct(_prevState: CreateProductState, formData: FormData): Promise<CreateProductState> {
  if (!(await canManageProducts())) return { error: 'Forbidden' };

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '');
  const item_type = String(formData.get('item_type') ?? '');
  const primary_branch = String(formData.get('primary_branch') ?? '');
  const exw_price = Number(formData.get('exw_price') ?? 0);
  const currency = String(formData.get('currency') ?? '');

  if (!Number.isFinite(exw_price)) return { error: 'Invalid EXW price' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema('tmsi')
    .from('products')
    .insert({ id, name, item_type, primary_branch, exw_price, currency });

  if (error) return { error: error.message };

  redirect(`/products/${id}`);
}
