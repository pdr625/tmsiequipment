/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side Supabase client (Server Components, Route Handlers, Server
// Actions). Kept in its own module — importing `next/headers` from the same
// file as the browser factory would pull a server-only module into any
// Client Component that imports createSupabaseBrowserClient, which Next.js
// rejects at build time.
//
// Same production URL note as supabase-client.ts: NEXT_PUBLIC_SUPABASE_URL
// is https://tmsiequipment.duckdns.org, served directly by nginx without Kong.
//
// No middleware.ts yet (out of scope for the E1 scaffold), so a token
// refresh triggered from a plain Server Component cannot write cookies back
// — the setAll below just swallows that case. Wiring middleware to refresh
// sessions before render is E3 work, once real auth calls exist.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
