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
