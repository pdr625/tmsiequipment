/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import { ErrorText } from '@/lib/error-text';
import { createBranch, createChannel, type BranchActionState } from './actions';

const ZONES = ['EU', 'CN', 'US', 'UK'];

export function CreateBranchForm({ currencies }: { currencies: { code: string }[] }) {
  const [state, formAction, pending] = useActionState<BranchActionState, FormData>(createBranch, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 p-3">
      <div>
        <label className="mb-1 block text-xs text-gray-500">Code</label>
        <input
          name="id"
          required
          maxLength={8}
          placeholder="e.g. NL"
          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm uppercase"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Name</label>
        <input name="name" required placeholder="Condat NL" className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Country (ISO2)</label>
        <input name="country" required maxLength={2} className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm uppercase" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Currency</label>
        <select name="currency" required className="rounded-md border border-gray-300 px-2 py-1 text-sm">
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Customs zone</label>
        <select name="zone" required className="rounded-md border border-gray-300 px-2 py-1 text-sm">
          {ZONES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create branch'}
      </button>
      <ErrorText state={state} />
      {state && 'success' in state && <p className="text-xs text-green-700">Created.</p>}
    </form>
  );
}

export function CreateChannelForm({ branches }: { branches: { id: string }[] }) {
  const [state, formAction, pending] = useActionState<BranchActionState, FormData>(createChannel, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 p-3">
      <div>
        <label className="mb-1 block text-xs text-gray-500">Code</label>
        <input
          name="id"
          required
          maxLength={8}
          placeholder="e.g. LATAM"
          className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm uppercase"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Name</label>
        <input name="name" required placeholder="LATAM Agents" className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Branch (origin)</label>
        <select name="branch_id" required className="rounded-md border border-gray-300 px-2 py-1 text-sm">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Margin delta</label>
        <input
          name="margin_delta"
          type="number"
          step="0.0001"
          defaultValue="0"
          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create channel'}
      </button>
      <ErrorText state={state} />
      {state && 'success' in state && <p className="text-xs text-green-700">Created.</p>}
    </form>
  );
}
