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
import type { ActionState as SharedActionState } from '@/lib/action-state';
import { confirmationMatches, isUuid } from '@/lib/remove-user';

export type ActionState = SharedActionState;
export type ResetPasswordState = SharedActionState<{ generatedPassword?: string }>;

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

  // email_confirm: true only here, on the admin-forced reset — a freshly
  // invited user has no confirmed email yet (GOTRUE_MAILER_AUTOCONFIRM is
  // false, deliberately, for public signup) and would be stuck on "Email
  // not confirmed" until the invite mail is delivered and clicked,
  // defeating the verbal-handoff design this endpoint exists for. Setting
  // it here is scoped to an action already gated by isAdmin() and an
  // explicit target userId — it does not touch public signup's own
  // confirmation requirement.
  const res = await fetch(`${GOTRUE_INTERNAL_URL}/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password, email_confirm: true }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.msg || body.message || `Reset failed (${res.status})` };
  }

  const supabase = await createSupabaseServerClient();

  // Forces the change-password page at next request (middleware.ts); RLS
  // (profiles_admin, 0001 §8) permits this write for the admin's own
  // session — no service-role call needed here.
  // .select() is required here: PostgREST returns 200/no-error on an
  // update matching zero rows, so without it a stale/missing profile
  // row would silently look identical to success.
  const { data: flagRows, error: flagError } = await supabase
    .schema('tmsi')
    .from('profiles')
    .update({ must_change_password: true })
    .eq('user_id', userId)
    .select();
  if (flagError) return { error: `Password set, but flag update failed: ${flagError.message}` };
  if (!flagRows || flagRows.length === 0) {
    return { error: 'Password set, but no matching profile found for this user — must_change_password was NOT set.' };
  }

  // GoTrue's Admin API has no session-revocation endpoint (0006);
  // tmsi.admin_revoke_sessions() re-checks has_role('admin') itself.
  const { error: revokeError } = await supabase
    .schema('tmsi')
    .rpc('admin_revoke_sessions', { target_user_id: userId });
  if (revokeError) return { error: `Password set, but session revocation failed: ${revokeError.message}` };

  revalidatePath('/admin/users');
  return mode === 'generate' ? { success: true, generatedPassword: password } : { success: true };
}

// Item 45 (0025): apagar a conta por completo. Ordem: (1) pré-condições na BD, (2) apagar no GoTrue — o email, o hash e as sessões
// desaparecem de vez, `profiles` e `user_roles` caem por CASCADE —, (3) redigir o nome/email que ficaram no audit_log. O audit_log
// mantém o UUID do autor (a prova de quem fez o quê); sem perfil, deixa de ser ligável a uma pessoa. Irreversível.
export async function removeUser(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };

  const userId = String(formData.get('user_id') ?? '');
  const typed = String(formData.get('confirm_email') ?? '');
  if (!isUuid(userId)) return { error: 'Invalid user' };

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.schema('tmsi').from('profiles').select('email').eq('user_id', userId).maybeSingle<{ email: string | null }>();
  if (!profile) return { error: 'Unknown user' };
  if (!confirmationMatches(profile.email, typed)) return { error: 'The email you typed does not match this account — nothing was removed.' };

  const { data: blocker, error: blockerError } = await supabase.schema('tmsi').rpc('removal_blockers', { p_user: userId });
  if (blockerError) return { error: blockerError.message };
  if (blocker) return { error: String(blocker) };

  const res = await fetch(`${GOTRUE_INTERNAL_URL}/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${process.env.SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.msg || body.message || `Delete failed (${res.status}) — nothing was removed.` };
  }

  // A conta já não existe. Se a redacção falhar, é idempotente e repete-se com este UUID (só admin):
  //   select tmsi.redact_removed_user('<uuid>');
  const { error: redactError } = await supabase.schema('tmsi').rpc('redact_removed_user', { p_user: userId });
  if (redactError) {
    return { error: `The account was deleted, but redacting the audit trail failed (${redactError.message}). Run tmsi.redact_removed_user for ${userId}.` };
  }

  revalidatePath('/admin/users');
  revalidatePath('/audit');
  return { success: true };
}
