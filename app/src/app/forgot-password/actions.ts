/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { ActionState } from '@/lib/action-state';

export type RequestResetState = ActionState;

// origin used to be derived from the request's own Host header — same
// unvalidated pattern as the pre-fix /logout redirect (tarefa 6, achado #1,
// commit 1be40ef), but feeding a real recovery email instead of a browser
// redirect. Measured live before fixing (tarefa 7 F0): GoTrue's own
// GOTRUE_SITE_URL/GOTRUE_URI_ALLOW_LIST already rejects a mismatched
// redirect_to and falls back to SITE_URL (internal/utilities/request.go,
// IsRedirectURLValid, v2.189.0) — a forged Host never actually reached a
// real link. Fixed anyway: the app should not rely on a downstream
// system's allowlist as its only defence against an untrusted header.
export async function requestPasswordReset(
  _prevState: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const email = String(formData.get('email') ?? '');

  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
