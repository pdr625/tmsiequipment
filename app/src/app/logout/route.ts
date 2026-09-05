/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

// A Route Handler, not a Server Action bound to `/` (as before i9) — so
// middleware.ts can exempt it by path. The must_change_password gate has
// to let a flagged user sign out no matter what; a Server Action's POST
// to the current page would be indistinguishable from any other POST
// there at the middleware level.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url));
}
