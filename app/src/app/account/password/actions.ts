/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export type ChangePasswordState = { error: string } | undefined;

// i9, decision of the Pedro: unlike the email-recovery flow
// (reset-password/actions.ts, reached via a token nobody else has),
// supabase.auth.updateUser() alone never confirms the caller already
// knows the CURRENT password — a left-open or stolen session could set a
// new one silently.
//
// tarefa 4: this used to be verified here, in app code, with a throwaway
// signInWithPassword client. GoTrue itself now enforces it directly —
// GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD (deploy/
// supabase/docker-compose.yml), a real config field confirmed against
// v2.189.0's own source (internal/conf/configuration.go,
// internal/api/user.go), not assumed. It hashes-and-compares
// current_password server-side, exempts recovery-flow sessions
// automatically (session.IsRecovery()) so reset-password/actions.ts's
// flow is unaffected, and never applies to the admin-reset endpoint
// (internal/api/admin.go has no such check) — admin resets still don't
// need the target's old password, by design (i9). @supabase/auth-js
// 2.115.0's UserAttributes already types current_password?: string, so
// no client upgrade was needed, just passing the field. One fewer
// throwaway GoTrue session per attempt as a side benefit.
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
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  });
  if (updateError) {
    return { error: updateError.message };
  }

  // Clears must_change_password for this user only (0006) — a no-op if
  // it was already false, e.g. a voluntary change with nothing forcing it.
  await supabase.schema('tmsi').rpc('mark_password_changed');

  redirect('/');
}
