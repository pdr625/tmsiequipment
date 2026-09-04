/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import { confirmToken, type ConfirmState } from './actions';

const initialState: ConfirmState = undefined;

export function ConfirmForm({
  tokenHash,
  type,
  code,
}: {
  tokenHash?: string;
  type?: string;
  code?: string;
}) {
  const [state, formAction, pending] = useActionState(confirmToken, initialState);

  return (
    <form action={formAction}>
      {tokenHash && <input type="hidden" name="token_hash" value={tokenHash} />}
      {type && <input type="hidden" name="type" value={type} />}
      {code && <input type="hidden" name="code" value={code} />}

      {state?.error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Confirming…' : type === 'invite' ? 'Accept invite' : 'Confirm'}
      </button>
    </form>
  );
}
