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
import { proposeChange } from '@/lib/propose-change';
import type { ActionState } from '@/lib/action-state';

export type ConfigActionState = ActionState;

// 0007 (E4): none of the five actions below writes exchange_rates/
// interco_fees/transport_tiers/customs_rates/margin_grids directly any
// more — tmsi.config_write was dropped from all five, proposeChange()
// inserts into tmsi.price_proposals instead, and tmsi.proposals_insert
// (RLS) re-derives exactly the same per-table eligibility config_write
// used to enforce. canManageFinanceConfig()/canManageOperationalConfig()
// below are convenience only, same as before — the real boundary is that
// RLS policy now, not this in-app check.

// exchange_rates is append-only by design (tmsi.fx_rate() always picks
// the latest effective_date <= the query date) — a proposal here inserts
// a brand new row on approval, never edits history. source is NOT NULL
// already at the schema level (0001 §2); this form just makes the field
// required, it doesn't invent the rule.
export async function addExchangeRate(_prevState: ConfigActionState, formData: FormData): Promise<ConfigActionState> {
  if (!(await canManageFinanceConfig())) return { error: 'Forbidden' };

  const currency = String(formData.get('currency') ?? '');
  const rate_per_eur = Number(formData.get('rate_per_eur') ?? 0);
  const effective_date = String(formData.get('effective_date') ?? '');
  const source = String(formData.get('source') ?? '');
  const reason = String(formData.get('reason') ?? '');

  const result = await proposeChange('exchange_rates', null, { currency, rate_per_eur, effective_date, source }, reason);
  if (result && 'error' in result) return result;

  revalidatePath('/config');
  revalidatePath('/proposals');
  return { success: true };
}

export async function updateIntercoFee(_prevState: ConfigActionState, formData: FormData): Promise<ConfigActionState> {
  if (!(await canManageFinanceConfig())) return { error: 'Forbidden' };

  const supplier_branch = String(formData.get('supplier_branch') ?? '');
  const seller_branch = String(formData.get('seller_branch') ?? '');
  const fee = Number(formData.get('fee') ?? 0);
  const reason = String(formData.get('reason') ?? '');

  const result = await proposeChange('interco_fees', null, { supplier_branch, seller_branch, fee }, reason);
  if (result && 'error' in result) return result;

  revalidatePath('/config');
  revalidatePath('/proposals');
  return { success: true };
}

export async function updateTransportTier(_prevState: ConfigActionState, formData: FormData): Promise<ConfigActionState> {
  if (!(await canManageOperationalConfig())) return { error: 'Forbidden' };

  const branch_id = String(formData.get('branch_id') ?? '');
  const tier = Number(formData.get('tier') ?? 0);
  const maxWeightRaw = String(formData.get('max_weight_kg') ?? '');
  const cost = Number(formData.get('cost') ?? 0);
  const currency = String(formData.get('currency') ?? '');
  const reason = String(formData.get('reason') ?? '');

  const result = await proposeChange(
    'transport_tiers',
    branch_id,
    { branch_id, tier, max_weight_kg: maxWeightRaw === '' ? null : Number(maxWeightRaw), cost, currency },
    reason,
  );
  if (result && 'error' in result) return result;

  revalidatePath('/config');
  revalidatePath('/proposals');
  return { success: true };
}

export async function updateCustomsRate(_prevState: ConfigActionState, formData: FormData): Promise<ConfigActionState> {
  if (!(await canManageOperationalConfig())) return { error: 'Forbidden' };

  const hs_code = String(formData.get('hs_code') ?? '');
  const zone = String(formData.get('zone') ?? '');
  const rate = Number(formData.get('rate') ?? 0);
  const reason = String(formData.get('reason') ?? '');

  const result = await proposeChange('customs_rates', null, { hs_code, zone, rate }, reason);
  if (result && 'error' in result) return result;

  revalidatePath('/config');
  revalidatePath('/proposals');
  return { success: true };
}

export async function updateMarginGrid(_prevState: ConfigActionState, formData: FormData): Promise<ConfigActionState> {
  if (!(await canManageFinanceConfig())) return { error: 'Forbidden' };

  const branch_id = String(formData.get('branch_id') ?? '');
  const tier = Number(formData.get('tier') ?? 0);
  const maxCostRaw = String(formData.get('max_cost_eur') ?? '');
  const margin = Number(formData.get('margin') ?? 0);
  const reason = String(formData.get('reason') ?? '');

  const result = await proposeChange(
    'margin_grids',
    branch_id,
    { branch_id, tier, max_cost_eur: maxCostRaw === '' ? null : Number(maxCostRaw), margin },
    reason,
  );
  if (result && 'error' in result) return result;

  revalidatePath('/config');
  revalidatePath('/proposals');
  return { success: true };
}

// settings.value is jsonb — the form field is the raw JSON literal
// (e.g. 0.15 or "SAP"), not a plain string, matching exactly what's
// stored (confirmed against the real seed data, 0001 §9 — some values
// are JSON numbers, some are JSON strings). Parsed and validated before
// being sent, rather than always wrapping as a JSON string, which would
// silently change the value's type for every non-string setting.
//
// Untouched by 0007: tmsi.settings tunes alert thresholds, not a value
// compute_price() returns to a caller — out of scope for the approval
// workflow (0007 F0, migration header). Still a direct write.
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
