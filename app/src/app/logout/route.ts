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
//
// request.url reflects the app's internal bind (https://0.0.0.0:3000/...)
// behind this proxy, not the public domain — the exact bug already caught
// and fixed once in auth/confirm (E3-i1, docs/STATE.md) and avoided since
// via the request's own Host header (forgot-password/actions.ts). Caught
// live here too (curl -D- showed the internal address) before ever being
// reported as done.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const host = request.headers.get('host');
  return NextResponse.redirect(`https://${host}/login`);
}
