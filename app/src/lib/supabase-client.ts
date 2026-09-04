/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { createBrowserClient } from '@supabase/ssr';

// Browser-side Supabase client. In production NEXT_PUBLIC_SUPABASE_URL is
// https://tmsiequipment.duckdns.org — the nginx vhost already serves
// /auth/v1/ and /rest/v1/ at the domain root (no Kong, no /supabase prefix),
// so the SDK's default path layout works unmodified against the root URL.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
