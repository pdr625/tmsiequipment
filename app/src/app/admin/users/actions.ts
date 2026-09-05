/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/auth-guard';

export type ActionState = { error: string } | { success: true } | undefined;
export type ResetPasswordState = { error: string } | { success: true; generatedPassword?: string } | undefined;

const GOTRUE_INTERNAL_URL = 'http://auth:9999';

// i9: >= 16 chars, broad charset, freshly random every call (never a
// fixed/default value) — crypto.randomInt is a CSPRNG, not Math.random.
const PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?';

function generateStrongPassword(length = 20): string {
  let password = '';
  for (let i = 0; i < length; i++) {
    password += PASSWORD_CHARSET[randomInt(PASSWORD_CHARSET.length)];
  }
  return password;
}

// Every export below checks isAdmin() first, with the caller's own
// session — before touching SERVICE_ROLE_KEY or writing anything. This is
// the actual security boundary (see auth-guard.ts); it does not depend on
// the admin UI being the only way these get called.

export async function inviteUser(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };

  const email = String(formData.get('email') ?? '');

  const res = await fetch(`${GOTRUE_INTERNAL_URL}/invite`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.msg || body.message || `Invite failed (${res.status})` };
  }

  const user = await res.json();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema('tmsi')
    .from('profiles')
    .insert({ user_id: user.id, email: user.email });

  if (error) {
    return { error: `User invited, but profile creation failed: ${error.message}` };
  }

  revalidatePath('/admin/users');
  return { success: true };
}

export async function assignRole(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };

  const userId = String(formData.get('user_id') ?? '');
  const role = String(formData.get('role') ?? '');
  const branchId = String(formData.get('branch_id') ?? '') || null;
  const channelId = String(formData.get('channel_id') ?? '') || null;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema('tmsi')
    .from('user_roles')
    .insert({ user_id: userId, role, branch_id: branchId, channel_id: channelId });

  if (error) return { error: error.message };

  revalidatePath('/admin/users');
  return { success: true };
}

export async function removeRole(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };

  const roleId = String(formData.get('role_id') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema('tmsi').from('user_roles').delete().eq('id', roleId);

  if (error) return { error: error.message };

  revalidatePath('/admin/users');
  return { success: true };
}

export async function banUser(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };

  const userId = String(formData.get('user_id') ?? '');

  // ~100 years — GoTrue has no "permanent" value, only a duration.
  const res = await fetch(`${GOTRUE_INTERNAL_URL}/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ban_duration: '876000h' }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.msg || body.message || `Ban failed (${res.status})` };
  }

  revalidatePath('/admin/users');
  return { success: true };
}

export async function unbanUser(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };

  const userId = String(formData.get('user_id') ?? '');

  const res = await fetch(`${GOTRUE_INTERNAL_URL}/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ban_duration: 'none' }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.msg || body.message || `Unban failed (${res.status})` };
  }

  revalidatePath('/admin/users');
  return { success: true };
}

// i9: manual or generated (never a fixed default shared across users),
// via the same Admin API endpoint banUser/unbanUser already use. Never
// logged, never written anywhere but this call and the one-time return
// value rendered to the admin's own browser (client-forms.tsx) — not even
// revalidatePath's cache holds it, since it's plain component state.
export async function resetPassword(_prevState: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };

  const userId = String(formData.get('user_id') ?? '');
  const mode = String(formData.get('mode') ?? '');

  if (mode !== 'generate' && mode !== 'manual') return { error: 'Invalid mode' };

  const password = mode === 'generate' ? generateStrongPassword() : String(formData.get('password') ?? '');
  if (mode === 'manual' && password.length === 0) {
    return { error: 'Enter a password, or choose "Generate temporary password"' };
  }

  const res = await fetch(`${GOTRUE_INTERNAL_URL}/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.msg || body.message || `Reset failed (${res.status})` };
  }

  const supabase = await createSupabaseServerClient();

  // Forces the change-password page at next request (middleware.ts); RLS
  // (profiles_admin, 0001 §8) permits this write for the admin's own
  // session — no service-role call needed here.
  const { error: flagError } = await supabase
    .schema('tmsi')
    .from('profiles')
    .update({ must_change_password: true })
    .eq('user_id', userId);
  if (flagError) return { error: `Password set, but flag update failed: ${flagError.message}` };

  // GoTrue's Admin API has no session-revocation endpoint (0006);
  // tmsi.admin_revoke_sessions() re-checks has_role('admin') itself.
  const { error: revokeError } = await supabase
    .schema('tmsi')
    .rpc('admin_revoke_sessions', { target_user_id: userId });
  if (revokeError) return { error: `Password set, but session revocation failed: ${revokeError.message}` };

  revalidatePath('/admin/users');
  return mode === 'generate' ? { success: true, generatedPassword: password } : { success: true };
}
