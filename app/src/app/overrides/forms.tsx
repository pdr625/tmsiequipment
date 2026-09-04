/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import { createPriceOverride, createHsOverride, type OverrideActionState } from './actions';

function ErrorText({ state }: { state: OverrideActionState }) {
  if (!state || !('error' in state)) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-red-600">
      {state.error}
    </p>
  );
}

export function PriceOverrideForm({
  products,
  branches,
  kinds,
}: {
  products: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  kinds: string[];
}) {
  const [state, formAction, pending] = useActionState<OverrideActionState, FormData>(createPriceOverride, undefined);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 p-3">
      <div>
        <label className="mb-1 block text-xs text-gray-500">Product</label>
        <select name="product_id" required className="rounded-md border border-gray-300 px-2 py-1 text-sm">
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id} — {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Branch</label>
        <select name="branch_id" required className="rounded-md border border-gray-300 px-2 py-1 text-sm">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Kind</label>
        <select name="kind" required className="rounded-md border border-gray-300 px-2 py-1 text-sm">
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Value</label>
        <input
          name="value"
          type="number"
          step="0.0001"
          required
          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Reason</label>
        <input name="reason" required className="w-48 rounded-md border border-gray-300 px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Valid from</label>
        <input
          name="valid_from"
          type="date"
          defaultValue={today}
          required
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Valid to (optional)</label>
        <input name="valid_to" type="date" className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create override'}
      </button>
      <ErrorText state={state} />
      {state && 'success' in state && <p className="text-xs text-green-700">Created.</p>}
    </form>
  );
}

export function HsOverrideForm({
  products,
  branches,
  hsCodes,
}: {
  products: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  hsCodes: { code: string; description: string | null }[];
}) {
  const [state, formAction, pending] = useActionState<OverrideActionState, FormData>(createHsOverride, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 p-3">
      <div>
        <label className="mb-1 block text-xs text-gray-500">Product</label>
        <select name="product_id" required className="rounded-md border border-gray-300 px-2 py-1 text-sm">
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id} — {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Scope</label>
        <input
          value="branch"
          disabled
          title="Only branch scope has any effect on calculations today — see the note above."
          className="w-24 rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-sm text-gray-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Branch</label>
        <select name="scope_id" required className="rounded-md border border-gray-300 px-2 py-1 text-sm">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">HS code</label>
        <select name="hs_code" required className="rounded-md border border-gray-300 px-2 py-1 text-sm">
          {hsCodes.map((h) => (
            <option key={h.code} value={h.code}>
              {h.code} — {h.description}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Reason</label>
        <input name="reason" required className="w-48 rounded-md border border-gray-300 px-2 py-1 text-sm" />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create override'}
      </button>
      <ErrorText state={state} />
      {state && 'success' in state && <p className="text-xs text-green-700">Created.</p>}
    </form>
  );
}
