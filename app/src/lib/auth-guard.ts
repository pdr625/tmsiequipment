/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { createSupabaseServerClient } from './supabase-server';

// Real access control for admin-only pages and Server Actions. Delegates
// the actual decision to Postgres (tmsi.has_role, the same function the
// RLS policies and compute_price() use) — never re-implemented here.
// Hiding a nav link or a button is convenience; this is the boundary that
// matters, since Server Actions are directly invokable regardless of what
// the UI shows.
export async function isAdmin(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema('tmsi').rpc('has_role', { r: 'admin' });
  return data === true;
}

// Mirrors tmsi.products_write_pm's own USING clause exactly (0001 §8:
// `has_role('admin') or has_role('product_manager')`) — two calls to the
// same has_role() RLS already relies on, not a new authorization rule.
export async function canManageProducts(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const [{ data: admin }, { data: pm }] = await Promise.all([
    supabase.schema('tmsi').rpc('has_role', { r: 'admin' }),
    supabase.schema('tmsi').rpc('has_role', { r: 'product_manager' }),
  ]);
  return admin === true || pm === true;
}

// Mirrors config_write on tmsi.exchange_rates/interco_fees/margin_grids/
// settings (0001 §8: `has_role('admin') or has_role('finance')`).
export async function canManageFinanceConfig(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const [{ data: admin }, { data: finance }] = await Promise.all([
    supabase.schema('tmsi').rpc('has_role', { r: 'admin' }),
    supabase.schema('tmsi').rpc('has_role', { r: 'finance' }),
  ]);
  return admin === true || finance === true;
}

// Mirrors config_write on tmsi.transport_tiers/customs_rates (0001 §8:
// `has_role('admin') or has_role('finance') or has_role('logistics')`) —
// a different, wider predicate than canManageFinanceConfig above, not the
// same helper reused: logistics can write these two specifically, not
// exchange_rates/interco_fees/margin_grids/settings.
export async function canManageOperationalConfig(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const [{ data: admin }, { data: finance }, { data: logistics }] = await Promise.all([
    supabase.schema('tmsi').rpc('has_role', { r: 'admin' }),
    supabase.schema('tmsi').rpc('has_role', { r: 'finance' }),
    supabase.schema('tmsi').rpc('has_role', { r: 'logistics' }),
  ]);
  return admin === true || finance === true || logistics === true;
}

// "Can this role read at least one pricing config table beyond
// settings" — settings itself is readable by any authenticated (0001 §8,
// config_read using(true)) regardless of this. Individual flags returned
// separately since /config's own sections gate differently:
// exchange_rates/interco_fees/margin_grids need can_read_costs()
// specifically; transport_tiers/customs_rates accept either.
export async function pricingConfigReadAccess(): Promise<{ readCosts: boolean; readLogistics: boolean }> {
  const supabase = await createSupabaseServerClient();
  const [{ data: readCosts }, { data: readLogistics }] = await Promise.all([
    supabase.schema('tmsi').rpc('can_read_costs'),
    supabase.schema('tmsi').rpc('has_role', { r: 'logistics' }),
  ]);
  return { readCosts: readCosts === true, readLogistics: readLogistics === true };
}
