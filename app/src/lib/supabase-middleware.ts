/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Edge middleware has no next/headers cookies() — it reads/writes cookies
// through NextRequest/NextResponse instead, a third cookie adapter distinct
// from supabase-client.ts (browser) and supabase-server.ts (Server
// Components/Route Handlers). Pattern matches @supabase/ssr's own
// documented Next.js middleware example (setAll receiving both the cookie
// list and the cache-control headers that must ride along with them).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Triggers a token refresh (and, via setAll above, writes the refreshed
  // cookies onto the response) before any route code runs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // i9: the must_change_password gate needs this on every request, not
  // just on pages that already fetch the profile — read via the same
  // RLS-scoped client (profiles_self, 0001 §8: own row or admin), one
  // indexed PK lookup, no new privilege surface.
  let mustChangePassword = false;
  if (user) {
    const { data: profile } = await supabase
      .schema('tmsi')
      .from('profiles')
      .select('must_change_password')
      .eq('user_id', user.id)
      .maybeSingle();
    mustChangePassword = profile?.must_change_password === true;
  }

  return { supabaseResponse, user, mustChangePassword };
}
