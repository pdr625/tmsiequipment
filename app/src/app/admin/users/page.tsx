/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/auth-guard';
import { InviteForm, AddRoleForm, RemoveRoleButton, BanToggleButton } from './client-forms';

type Profile = { user_id: string; email: string | null; full_name: string | null };
type UserRole = { id: number; user_id: string; role: string; branch_id: string | null; channel_id: string | null };
type Branch = { id: string; name: string };
type Channel = { id: string; name: string };
type GoTrueUser = { id: string; email?: string; banned_until?: string };

// Real gate: redirect('/'), not just hiding the "Admin" nav link.
// isAdmin() asks Postgres (tmsi.has_role), never re-implemented here.
export default async function AdminUsersPage() {
  if (!(await isAdmin())) {
    redirect('/');
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: profiles, error: profilesError }, { data: roles }, { data: branches }, { data: channels }] =
    await Promise.all([
      supabase.schema('tmsi').from('profiles').select('user_id, email, full_name').order('email'),
      supabase.schema('tmsi').from('user_roles').select('id, user_id, role, branch_id, channel_id'),
      supabase
        .schema('tmsi')
        .from('branches')
        .select('id, name')
        .eq('active', true)
        .order('id')
        .overrideTypes<Branch[], { merge: false }>(),
      supabase
        .schema('tmsi')
        .from('channels')
        .select('id, name')
        .eq('active', true)
        .order('id')
        .overrideTypes<Channel[], { merge: false }>(),
    ]);

  // Ban status lives in GoTrue, not tmsi.profiles — cross-referenced by id.
  // SERVICE_ROLE_KEY only reached after the admin gate above, never earlier.
  const gotrueRes = await fetch('http://auth:9999/admin/users', {
    headers: { Authorization: `Bearer ${process.env.SERVICE_ROLE_KEY}` },
    cache: 'no-store',
  });
  const bannedIds = new Set<string>();
  if (gotrueRes.ok) {
    const body = (await gotrueRes.json()) as { users: GoTrueUser[] };
    for (const u of body.users) {
      if (u.banned_until) bannedIds.add(u.id);
    }
  }

  const rolesByUser = new Map<string, UserRole[]>();
  for (const r of (roles as UserRole[]) ?? []) {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r);
    rolesByUser.set(r.user_id, list);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">User administration</h1>
        <Link href="/" className="text-sm text-gray-600 underline">
          Back
        </Link>
      </div>

      <InviteForm />

      {profilesError && (
        <p role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {profilesError.message}
        </p>
      )}

      <div className="space-y-6">
        {(profiles as Profile[])?.map((p) => {
          const userRoles = rolesByUser.get(p.user_id) ?? [];
          const banned = bannedIds.has(p.user_id);
          return (
            <div key={p.user_id} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <span className="font-medium">{p.email}</span>
                  {p.full_name && <span className="ml-2 text-sm text-gray-500">{p.full_name}</span>}
                  {banned && (
                    <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">disabled</span>
                  )}
                </div>
                <BanToggleButton userId={p.user_id} banned={banned} />
              </div>

              <ul className="mb-2 space-y-1">
                {userRoles.length === 0 && <li className="text-xs text-gray-400">No roles assigned.</li>}
                {userRoles.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    <span>
                      {r.role}
                      {r.branch_id && ` — branch ${r.branch_id}`}
                      {r.channel_id && ` — channel ${r.channel_id}`}
                    </span>
                    <RemoveRoleButton roleId={r.id} />
                  </li>
                ))}
              </ul>

              <AddRoleForm userId={p.user_id} branches={branches ?? []} channels={channels ?? []} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
