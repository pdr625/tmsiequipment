/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { redirect } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export type ConfirmState = { error: string } | undefined;

// Reached only via the POST a real button click triggers (see page.tsx for
// why the GET that renders the form must stay side-effect-free). Primary
// path: token_hash + type, verified via verifyOtp — self-contained, no
// dependency on browser/cookie state from whenever the request was made, so
// it works when opened on a different device/browser than the one that
// requested it. Fallback: a PKCE `code` (GoTrue's default
// {{ .ConfirmationURL }}, still used by confirmation/email_change, out of
// scope — same-browser only, kept for completeness).
export async function confirmToken(_prevState: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const tokenHash = String(formData.get('token_hash') ?? '') || null;
  const type = (String(formData.get('type') ?? '') || null) as EmailOtpType | null;
  const code = String(formData.get('code') ?? '') || null;

  const supabase = await createSupabaseServerClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return { error: error.message };
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { error: error.message };
  } else {
    return { error: 'Invalid confirmation link.' };
  }

  redirect('/reset-password');
}
