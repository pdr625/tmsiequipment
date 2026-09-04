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

// Coarse: "can this role write at least one price_overrides kind" —
// mirrors overrides_write's OR-list of roles (0001 §8), not its finer
// per-kind/per-branch conditions (branch_manager: transport/margin/coef
// only, own branch; logistics: duty only) — those stay entirely on RLS,
// exactly like the product edit form lets any status through and shows
// the real trigger error. This only decides whether to render the create
// form at all.
export async function canManageAnyPriceOverride(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const [{ data: admin }, { data: finance }, { data: branchManager }, { data: logistics }] = await Promise.all([
    supabase.schema('tmsi').rpc('has_role', { r: 'admin' }),
    supabase.schema('tmsi').rpc('has_role', { r: 'finance' }),
    supabase.schema('tmsi').rpc('has_role', { r: 'branch_manager' }),
    supabase.schema('tmsi').rpc('has_role', { r: 'logistics' }),
  ]);
  return admin === true || finance === true || branchManager === true || logistics === true;
}

// Dashboard access (E3-i8 prompt): can_read_costs() only — admin is
// already the first disjunct of that function's own definition, so
// naming it separately would be redundant, not a wider gate. logistics
// is deliberately excluded even though it reads some cost-adjacent
// config elsewhere (transport/customs) — the dashboard is Finance's
// margin-review instrument, not extended to every read-adjacent role
// by default (i8 prompt, restriction 1). Widening this to other roles
// is a future decision of the Pedro's, not assumed here.
export async function canReadDashboard(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema('tmsi').rpc('can_read_costs');
  return data === true;
}

// Mirrors audit_read on tmsi.audit_log (0001 §8: admin/finance/viewer/
// branch_manager — notably NOT product_manager or logistics, even though
// both can write products/overrides).
export async function canReadAuditLog(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const [{ data: admin }, { data: finance }, { data: viewer }, { data: branchManager }] = await Promise.all([
    supabase.schema('tmsi').rpc('has_role', { r: 'admin' }),
    supabase.schema('tmsi').rpc('has_role', { r: 'finance' }),
    supabase.schema('tmsi').rpc('has_role', { r: 'viewer' }),
    supabase.schema('tmsi').rpc('has_role', { r: 'branch_manager' }),
  ]);
  return admin === true || finance === true || viewer === true || branchManager === true;
}
