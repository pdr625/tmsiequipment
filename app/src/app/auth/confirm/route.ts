/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';

// Primary path: our custom recovery email template
// (email-templates/recovery/route.ts) links straight here with
// token_hash + type=recovery, verified via verifyOtp — self-contained,
// no dependency on browser/cookie state from whenever the reset was
// requested, so it works when the link is opened on a different device
// or in a different browser context (the common real case for "check
// your email" on a phone). Confirmed against @supabase/auth-js@2.115.0's
// VerifyTokenHashParams type, not assumed.
//
// Fallback path: a PKCE `code` (GoTrue's default {{ .ConfirmationURL }}
// via its own /auth/v1/verify, still used by confirmation/invite/
// email_change — untouched in this iteration, out of scope). Only works
// same-browser; kept for completeness, not the primary flow.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;
  const code = request.nextUrl.searchParams.get('code');

  const supabase = await createSupabaseServerClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return NextResponse.redirect(new URL('/reset-password', request.url));
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL('/reset-password', request.url));
    }
  }

  return NextResponse.redirect(new URL('/login?error=reset_link_invalid', request.url));
}
