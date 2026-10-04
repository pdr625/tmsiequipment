/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signIn, type SignInState } from './actions';

const initialState: SignInState = undefined;

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <>
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
            className="w-full rounded-md border border-line-strong px-3 py-2 text-sm"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-line-strong px-3 py-2 text-sm"
            placeholder="••••••••"
          />
        </div>

        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:opacity-50"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm">
        {/* Item 96: sem sessão nenhuma para pré-carregar — a página de login
            não paga a tempestade dos itens 73/81 (um só link), mas não há
            razão para pagar nenhum pedido especulativo aqui. */}
        <Link href="/forgot-password" prefetch={false} className="text-fg-soft underline">
          Forgot password?
        </Link>
      </p>
    </>
  );
}
