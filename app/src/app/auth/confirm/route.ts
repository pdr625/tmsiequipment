/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

// GoTrue's own /auth/v1/verify (GOTRUE_MAILER_URLPATHS_RECOVERY) handles the
// recovery link first: it verifies the token server-side, then redirects
// the browser here with a PKCE `code` query param (our @supabase/ssr
// clients default to flowType: "pkce" — confirmed against
// @supabase/ssr@0.12.5's source, not assumed). This route exchanges that
// code for a real session, using the PKCE code_verifier cookie the browser
// client stored when the reset was first requested (forgot-password/actions.ts).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL('/reset-password', request.url));
    }
  }

  return NextResponse.redirect(new URL('/login?error=reset_link_invalid', request.url));
}
