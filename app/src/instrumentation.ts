/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// item 22 (docs/DISASTER-DRILL.md achado 3): SUPABASE_URL/SUPABASE_ANON_KEY
// are now runtime env, read server-side only — nothing client-side ever
// touched them (confirmed by grep before this change existed). register()
// runs once per runtime context when the server process starts and must
// complete before any request is served (Next.js docs) — throwing here
// fails the container at boot, not silently per-request, which is the
// point: a misconfigured deploy should never come up looking healthy.
//
// Next.js calls register() once for "nodejs" (Server Components/Actions/
// Route Handlers — supabase-server.ts) and once for "edge" (middleware.ts,
// which in this self-hosted `node server.js` deployment runs in the same
// process and process.env, not a separate Vercel Edge worker) — checked
// unconditionally, not gated to one runtime, since both contexts need both
// variables.
export async function register() {
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required runtime environment variable(s): ${missing.join(', ')} — see deploy/DEPLOY.md §2.`,
    );
  }
}
