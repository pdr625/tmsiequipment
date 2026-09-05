/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import { changePassword, type ChangePasswordState } from './actions';

const initialState: ChangePasswordState = undefined;

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="current_password" className="mb-1 block text-sm font-medium">
          Current password
        </label>
        <input
          id="current_password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="new_password" className="mb-1 block text-sm font-medium">
          New password
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="new_password_confirm" className="mb-1 block text-sm font-medium">
          Confirm new password
        </label>
        <input
          id="new_password_confirm"
          name="new_password_confirm"
          type="password"
          autoComplete="new-password"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
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
        {pending ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}
