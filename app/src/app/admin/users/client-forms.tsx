/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import { inviteUser, assignRole, removeRole, banUser, unbanUser, type ActionState } from './actions';

const ROLES = [
  'admin',
  'product_manager',
  'finance',
  'branch_manager',
  'logistics',
  'sales',
  'agent',
  'viewer',
];

function ErrorText({ state }: { state: ActionState }) {
  if (!state || !('error' in state)) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-red-600">
      {state.error}
    </p>
  );
}

export function InviteForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(inviteUser, undefined);
  return (
    <form action={formAction} className="mb-8 flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="invite-email" className="mb-1 block text-sm font-medium">
          Invite new user (email)
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder="name@example.test"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send invite'}
      </button>
      <ErrorText state={state} />
      {state && 'success' in state && <p className="text-xs text-green-700">Invite sent.</p>}
    </form>
  );
}

export function AddRoleForm({
  userId,
  branches,
  channels,
}: {
  userId: string;
  branches: { id: string; name: string }[];
  channels: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(assignRole, undefined);
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <div>
        <label className="mb-1 block text-xs text-gray-500">Role</label>
        <select name="role" required className="rounded-md border border-gray-300 px-2 py-1 text-xs">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Branch (sales / branch_manager)</label>
        <select name="branch_id" className="rounded-md border border-gray-300 px-2 py-1 text-xs">
          <option value="">—</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Channel (agent)</label>
        <select name="channel_id" className="rounded-md border border-gray-300 px-2 py-1 text-xs">
          <option value="">—</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add role'}
      </button>
      <ErrorText state={state} />
    </form>
  );
}

export function RemoveRoleButton({ roleId }: { roleId: number }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(removeRole, undefined);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="role_id" value={roleId} />
      <button type="submit" disabled={pending} className="text-xs text-red-600 underline disabled:opacity-50">
        remove
      </button>
      <ErrorText state={state} />
    </form>
  );
}

export function BanToggleButton({ userId, banned }: { userId: string; banned: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    banned ? unbanUser : banUser,
    undefined,
  );
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="user_id" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
          banned ? 'border-green-300 text-green-700' : 'border-red-300 text-red-700'
        }`}
      >
        {pending ? '…' : banned ? 'Reactivate' : 'Disable'}
      </button>
      <ErrorText state={state} />
    </form>
  );
}
