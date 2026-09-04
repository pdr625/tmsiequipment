/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import { updatePassword, type UpdatePasswordState } from './actions';

const initialState: UpdatePasswordState = undefined;

// Reached only via a valid session (either a normal signed-in visit, or
// the recovery session /auth/confirm just established) — middleware
// already gates this route like any other authenticated page.
export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(updatePassword, initialState);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-semibold">Set a new password</h1>

        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="••••••••"
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
            {pending ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      </div>
    </div>
  );
}
