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
// and fixed once in auth/confirm (E3-i1, docs/STATE.md). Caught live here
// too (curl -D- showed the internal address) before ever being reported
// as done.
//
// The Host header (once used here) isn't a safe substitute — it's
// attacker-controlled with no allowlist, an open redirect — and
// NextResponse.redirect() rejects a bare relative path outright
// (validateURL does `new URL(url)` with no base, which throws for
// anything not already absolute). SUPABASE_URL is already this app's own
// public origin in production (supabase-server.ts), read server-side at
// runtime (item 22 — no longer NEXT_PUBLIC_*, never build-time-inlined)
// and never anything read off the request, so it's the safe base to
// resolve `/login` against.
export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', process.env.SUPABASE_URL!));
}
