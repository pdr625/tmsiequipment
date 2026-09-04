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
