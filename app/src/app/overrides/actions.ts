/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { canManageAnyPriceOverride, isAdmin } from '@/lib/auth-guard';

export type OverrideActionState = { error: string } | { success: true } | undefined;

// Real gate first, caller's own session — tmsi.overrides_write/ref_write
// (RLS) are the actual boundary; this only avoids a wasted round trip for
// a caller who'd be denied anyway (and, for price overrides, only a
// coarse check — the exact kind/branch conditions for branch_manager/
// logistics stay entirely on RLS, never re-implemented here).
//
// created_by is never read from the form (restriction 3 of the prompt:
// the author is the authenticated session, not an editable field) — set
// here from auth.getUser(), same session the RLS check itself uses.
export async function createPriceOverride(
  _prevState: OverrideActionState,
  formData: FormData,
): Promise<OverrideActionState> {
  if (!(await canManageAnyPriceOverride())) return { error: 'Forbidden' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const product_id = String(formData.get('product_id') ?? '');
  const branch_id = String(formData.get('branch_id') ?? '');
  const kind = String(formData.get('kind') ?? '');
  const value = Number(formData.get('value') ?? 0);
  const reason = String(formData.get('reason') ?? '');
  const valid_from = String(formData.get('valid_from') ?? '');
  const validToRaw = String(formData.get('valid_to') ?? '');

  const { error } = await supabase.schema('tmsi').from('price_overrides').insert({
    product_id,
    branch_id,
    kind,
    value,
    reason,
    valid_from,
    valid_to: validToRaw === '' ? null : validToRaw,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath('/overrides');
  revalidatePath(`/products/${product_id}`);
  return { success: true };
}

// scope_type is hardcoded 'branch' here, never read from the form — the
// UI itself only offers branch (F0 finding: compute_price() never reads
// channel/agent-scoped overrides, so accepting one from a form would be
// exactly the silent defect the prompt's restriction 2 flags), and this
// action doesn't trust a client-supplied value for it either.
export async function createHsOverride(
  _prevState: OverrideActionState,
  formData: FormData,
): Promise<OverrideActionState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };

  const product_id = String(formData.get('product_id') ?? '');
  const scope_id = String(formData.get('scope_id') ?? '');
  const hs_code = String(formData.get('hs_code') ?? '');
  const reason = String(formData.get('reason') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema('tmsi').from('product_hs_overrides').insert({
    product_id,
    scope_type: 'branch',
    scope_id,
    hs_code,
    reason,
  });

  if (error) return { error: error.message };

  revalidatePath('/overrides');
  revalidatePath(`/products/${product_id}`);
  return { success: true };
}
