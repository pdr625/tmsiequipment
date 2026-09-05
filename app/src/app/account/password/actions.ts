/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export type ChangePasswordState = { error: string } | undefined;

// i9, decision of the Pedro: unlike the email-recovery flow
// (reset-password/actions.ts, reached via a token nobody else has),
// supabase.auth.updateUser() alone never confirms the caller already
// knows the CURRENT password — a left-open or stolen session could set a
// new one silently. Verified here, server-side, by attempting a real
// sign-in with a throwaway client (persistSession/autoRefreshToken off,
// same public URL + anon key as login/actions.ts's own signInWithPassword)
// so the check never touches the real session's cookies. This does leave
// one extra, unused GoTrue session behind per attempt (there is no
// "verify without issuing a session" endpoint) — harmless (same user, own
// credentials) and left to expire naturally; not worth a bespoke cleanup.
export async function changePassword(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = String(formData.get('current_password') ?? '');
  const newPassword = String(formData.get('new_password') ?? '');
  const newPasswordConfirm = String(formData.get('new_password_confirm') ?? '');

  if (newPassword !== newPasswordConfirm) {
    return { error: 'New passwords do not match' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: 'Not authenticated' };
  }

  const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    return { error: 'Current password is incorrect' };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return { error: updateError.message };
  }

  // Clears must_change_password for this user only (0006) — a no-op if
  // it was already false, e.g. a voluntary change with nothing forcing it.
  await supabase.schema('tmsi').rpc('mark_password_changed');

  redirect('/');
}
