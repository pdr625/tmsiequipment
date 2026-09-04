/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import { createProduct, type CreateProductState } from './actions';

const ITEM_TYPES = ['equipment', 'spare_part', 'option', 'service'];

export function CreateProductForm({
  branches,
  currencies,
}: {
  branches: { id: string; name: string }[];
  currencies: { code: string }[];
}) {
  const [state, formAction, pending] = useActionState<CreateProductState, FormData>(createProduct, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="id" className="mb-1 block text-sm font-medium">
          TMSI code
        </label>
        <input
          id="id"
          name="id"
          required
          pattern="T-[0-9]{4}"
          title="Format T-0000"
          placeholder="T-0011"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="item_type" className="mb-1 block text-sm font-medium">
          Item type
        </label>
        <select
          id="item_type"
          name="item_type"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="primary_branch" className="mb-1 block text-sm font-medium">
          Primary branch (supplying)
        </label>
        <select
          id="primary_branch"
          name="primary_branch"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="exw_price" className="mb-1 block text-sm font-medium">
            EXW price
          </label>
          <input
            id="exw_price"
            name="exw_price"
            type="number"
            step="0.01"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="currency" className="mb-1 block text-sm font-medium">
            Currency
          </label>
          <select
            id="currency"
            name="currency"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create draft'}
      </button>
    </form>
  );
}
