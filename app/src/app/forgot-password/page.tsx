/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordReset, type RequestResetState } from './actions';

const initialState: RequestResetState = undefined;

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-semibold">Reset your password</h1>

        {state && 'success' in state ? (
          <p className="text-sm text-gray-700">
            If an account exists for that email, a reset link has been sent.
          </p>
        ) : (
          <form action={formAction} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="you@company.com"
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
              {pending ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-gray-600 underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
