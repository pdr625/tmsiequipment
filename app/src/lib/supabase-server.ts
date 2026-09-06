/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side Supabase client (Server Components, Route Handlers, Server
// Actions). Kept in its own module — `next/headers` is server-only and
// Next.js rejects it at build time if pulled into a Client Component's
// module graph, so this stays separate from supabase-middleware.ts's
// NextRequest/NextResponse cookie adapter.
//
// SUPABASE_URL is https://tmsiequipment.duckdns.org in production, served
// directly by nginx without Kong. Runtime env, not NEXT_PUBLIC_* (item 22,
// docs/DISASTER-DRILL.md achado 3) — this module is server-only anyway
// (see above), so there was never a reason for the build-time-inlining
// NEXT_PUBLIC_* gives; instrumentation.ts fails the container at boot if
// either var is missing, rather than this throwing per-request via `!`.
//
// No middleware.ts yet (out of scope for the E1 scaffold), so a token
// refresh triggered from a plain Server Component cannot write cookies back
// — the setAll below just swallows that case. Wiring middleware to refresh
// sessions before render is E3 work, once real auth calls exist.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
          }
        },
      },
    },
  );
}
