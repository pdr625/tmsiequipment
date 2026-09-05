/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { canManageFinanceConfig, canManageOperationalConfig } from '@/lib/auth-guard';
import type { ActionState } from '@/lib/action-state';

export type ConfigActionState = ActionState;

// Real gate first, caller's own session, before any write is attempted —
// config_write (RLS) on each table is the actual boundary; this just
// avoids a wasted round trip for a caller who'd be denied anyway. Every
// error returned below is the raw one Postgres/PostgREST produced
// (constraint violations, RLS denials) — never a client-side re-guess.

// exchange_rates is append-only by design (tmsi.fx_rate() always picks
// the latest effective_date <= the query date) — no update/delete here,
// only insert. source is NOT NULL already at the schema level (0001 §2);
// this form just makes the field required, it doesn't invent the rule.
export async function addExchangeRate(_prevState: ConfigActionState, formData: FormData): Promise<ConfigActionState> {
  if (!(await canManageFinanceConfig())) return { error: 'Forbidden' };

  const currency = String(formData.get('currency') ?? '');
  const rate_per_eur = Number(formData.get('rate_per_eur') ?? 0);
  const effective_date = String(formData.get('effective_date') ?? '');
  const source = String(formData.get('source') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema('tmsi')
    .from('exchange_rates')
    .insert({ currency, rate_per_eur, effective_date, source });

  if (error) return { error: error.message };

  revalidatePath('/config');
  return { success: true };
}

export async function updateIntercoFee(_prevState: ConfigActionState, formData: FormData): Promise<ConfigActionState> {
  if (!(await canManageFinanceConfig())) return { error: 'Forbidden' };

  const supplier_branch = String(formData.get('supplier_branch') ?? '');
  const seller_branch = String(formData.get('seller_branch') ?? '');
  const fee = Number(formData.get('fee') ?? 0);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema('tmsi')
    .from('interco_fees')
    .update({ fee })
    .eq('supplier_branch', supplier_branch)
    .eq('seller_branch', seller_branch);

  if (error) return { error: error.message };

  revalidatePath('/config');
  return { success: true };
}

export async function updateTransportTier(_prevState: ConfigActionState, formData: FormData): Promise<ConfigActionState> {
  if (!(await canManageOperationalConfig())) return { error: 'Forbidden' };

  const branch_id = String(formData.get('branch_id') ?? '');
  const tier = Number(formData.get('tier') ?? 0);
  const maxWeightRaw = String(formData.get('max_weight_kg') ?? '');
  const cost = Number(formData.get('cost') ?? 0);
  const currency = String(formData.get('currency') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema('tmsi')
    .from('transport_tiers')
    .update({ max_weight_kg: maxWeightRaw === '' ? null : Number(maxWeightRaw), cost, currency })
    .eq('branch_id', branch_id)
    .eq('tier', tier);

  if (error) return { error: error.message };

  revalidatePath('/config');
  return { success: true };
}

export async function updateCustomsRate(_prevState: ConfigActionState, formData: FormData): Promise<ConfigActionState> {
  if (!(await canManageOperationalConfig())) return { error: 'Forbidden' };

  const hs_code = String(formData.get('hs_code') ?? '');
  const zone = String(formData.get('zone') ?? '');
  const rate = Number(formData.get('rate') ?? 0);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema('tmsi')
    .from('customs_rates')
    .update({ rate })
    .eq('hs_code', hs_code)
    .eq('zone', zone);

  if (error) return { error: error.message };

  revalidatePath('/config');
  return { success: true };
}

export async function updateMarginGrid(_prevState: ConfigActionState, formData: FormData): Promise<ConfigActionState> {
  if (!(await canManageFinanceConfig())) return { error: 'Forbidden' };

  const branch_id = String(formData.get('branch_id') ?? '');
  const tier = Number(formData.get('tier') ?? 0);
  const maxCostRaw = String(formData.get('max_cost_eur') ?? '');
  const margin = Number(formData.get('margin') ?? 0);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema('tmsi')
    .from('margin_grids')
    .update({ max_cost_eur: maxCostRaw === '' ? null : Number(maxCostRaw), margin })
    .eq('branch_id', branch_id)
    .eq('tier', tier);

  if (error) return { error: error.message };

  revalidatePath('/config');
  return { success: true };
}

// settings.value is jsonb — the form field is the raw JSON literal
// (e.g. 0.15 or "SAP"), not a plain string, matching exactly what's
// stored (confirmed against the real seed data, 0001 §9 — some values
// are JSON numbers, some are JSON strings). Parsed and validated before
// being sent, rather than always wrapping as a JSON string, which would
// silently change the value's type for every non-string setting.
export async function updateSetting(_prevState: ConfigActionState, formData: FormData): Promise<ConfigActionState> {
  if (!(await canManageFinanceConfig())) return { error: 'Forbidden' };

  const key = String(formData.get('key') ?? '');
  const rawValue = String(formData.get('value') ?? '');
  const note = String(formData.get('note') ?? '') || null;

  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    return { error: `Invalid JSON value: ${rawValue}` };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema('tmsi').from('settings').update({ value, note }).eq('key', key);

  if (error) return { error: error.message };

  revalidatePath('/config');
  return { success: true };
}
