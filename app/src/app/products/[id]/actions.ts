/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { canManageProducts } from '@/lib/auth-guard';

export type UpdateProductState = { error: string } | { success: true } | undefined;

// String field: empty input -> null (not ''), matching how the columns
// are actually nullable. Only used for optional text/reference columns.
function nullableString(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? '');
  return v === '' ? null : v;
}

function nullableNumber(formData: FormData, key: string): number | null {
  const v = String(formData.get(key) ?? '');
  return v === '' ? null : Number(v);
}

// Real gate first, caller's own session — tmsi.products_write_pm (RLS,
// admin/product_manager only) is the actual boundary. Whatever this
// action sends, activation requirements (HS/weight/unit/SAP — 0001 §3)
// and the EXW-on-active review reopen (§5) are enforced by the triggers
// themselves; on violation, error.message is the raw RAISE EXCEPTION text
// from Postgres, shown as-is below — never a client-side re-guess at what
// the DB would say.
export async function updateProduct(_prevState: UpdateProductState, formData: FormData): Promise<UpdateProductState> {
  if (!(await canManageProducts())) return { error: 'Forbidden' };

  const id = String(formData.get('id') ?? '');

  const update = {
    name: String(formData.get('name') ?? ''),
    description: nullableString(formData, 'description'),
    category_id: nullableString(formData, 'category_id'),
    item_type: String(formData.get('item_type') ?? ''),
    parent_id: nullableString(formData, 'parent_id'),
    supplier_id: nullableString(formData, 'supplier_id'),
    origin_country: nullableString(formData, 'origin_country'),
    currency: String(formData.get('currency') ?? ''),
    exw_price: Number(formData.get('exw_price') ?? 0),
    primary_branch: String(formData.get('primary_branch') ?? ''),
    sold_in: formData.getAll('sold_in').map(String),
    hs_code: nullableString(formData, 'hs_code'),
    gross_weight_kg: nullableNumber(formData, 'gross_weight_kg'),
    net_weight_kg: nullableNumber(formData, 'net_weight_kg'),
    lead_time_days: nullableNumber(formData, 'lead_time_days'),
    palletizable: formData.get('palletizable') !== null,
    stackable: formData.get('stackable') !== null,
    unit: nullableString(formData, 'unit'),
    sap_code_sa: nullableString(formData, 'sap_code_sa'),
    sap_code_cn: nullableString(formData, 'sap_code_cn'),
    sap_code_us: nullableString(formData, 'sap_code_us'),
    sap_code_uk: nullableString(formData, 'sap_code_uk'),
    status: String(formData.get('status') ?? ''),
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema('tmsi').from('products').update(update).eq('id', id);

  if (error) return { error: error.message };

  revalidatePath(`/products/${id}`);
  return { success: true };
}
