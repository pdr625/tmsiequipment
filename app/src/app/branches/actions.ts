/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/auth-guard';
import type { ActionState } from '@/lib/action-state';

export type BranchActionState = ActionState;

// tmsi.branches/tmsi.channels are reference data with their own ref_write
// RLS policy (0001: `using (has_role('admin')) with check (has_role('admin'))`)
// — the SAME direct-write shape products/new/actions.ts already uses, not
// the propose->approve workflow (0007) that pricing CONFIG tables use.
// Creating a branch/channel is an identity, not a value with a history to
// preserve; RLS is the real boundary, isAdmin() below only avoids a
// wasted round trip for a caller who would be refused anyway.
export async function createBranch(_prevState: BranchActionState, formData: FormData): Promise<BranchActionState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '');
  const country = String(formData.get('country') ?? '');
  const currency = String(formData.get('currency') ?? '');
  const zone = String(formData.get('zone') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema('tmsi').from('branches').insert({ id, name, country, currency, zone });
  if (error) return { error: error.message };

  revalidatePath('/branches');
  return { success: true };
}

export async function createChannel(_prevState: BranchActionState, formData: FormData): Promise<BranchActionState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '');
  const branch_id = String(formData.get('branch_id') ?? '');
  const margin_delta = Number(formData.get('margin_delta') ?? 0);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema('tmsi').from('channels').insert({ id, name, branch_id, margin_delta });
  if (error) return { error: error.message };

  revalidatePath('/branches');
  return { success: true };
}
