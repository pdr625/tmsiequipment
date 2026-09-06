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
import { proposeChange } from '@/lib/propose-change';
import type { ActionState } from '@/lib/action-state';

export type OverrideActionState = ActionState;

// 0007 (E4): price_overrides no longer takes a direct write here —
// overrides_write was dropped, proposeChange() inserts a
// tmsi.price_proposals row instead, and tmsi.proposals_insert (RLS)
// re-derives overrides_write's own per-kind/per-branch conditions
// (branch_manager: transport/margin/coef only, own branch; logistics:
// duty only) exactly. canManageAnyPriceOverride() below stays a coarse
// convenience check, same as before — it only decides whether to render
// the form at all; the real boundary is that RLS policy now, not this
// in-app check. The existing "reason" field doubles as both the
// proposal's own reason and the override's own reason column once
// materialised — they describe the same thing here, so no second field.
//
// created_by/proposed_by is never read from the form (restriction 3 of
// the original prompt: the author is the authenticated session, not an
// editable field) — proposeChange() sets it from auth.getUser() itself,
// the same session tmsi.proposals_insert's own check relies on.
export async function createPriceOverride(
  _prevState: OverrideActionState,
  formData: FormData,
): Promise<OverrideActionState> {
  if (!(await canManageAnyPriceOverride())) return { error: 'Forbidden' };

  const product_id = String(formData.get('product_id') ?? '');
  const branch_id = String(formData.get('branch_id') ?? '');
  const kind = String(formData.get('kind') ?? '');
  const value = Number(formData.get('value') ?? 0);
  const reason = String(formData.get('reason') ?? '');
  const valid_from = String(formData.get('valid_from') ?? '');
  const validToRaw = String(formData.get('valid_to') ?? '');

  const result = await proposeChange(
    'price_overrides',
    branch_id,
    { product_id, branch_id, kind, value, reason, valid_from, valid_to: validToRaw === '' ? null : validToRaw },
    reason,
  );
  if (result && 'error' in result) return result;

  revalidatePath('/overrides');
  revalidatePath(`/products/${product_id}`);
  revalidatePath('/proposals');
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
