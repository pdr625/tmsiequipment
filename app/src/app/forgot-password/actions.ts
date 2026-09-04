/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export type RequestResetState = { error: string } | { success: true } | undefined;

export async function requestPasswordReset(
  _prevState: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const email = String(formData.get('email') ?? '');

  const host = (await headers()).get('host');
  const origin = `https://${host}`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
