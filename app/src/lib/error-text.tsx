/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import type { ActionState } from './action-state';

export function ErrorText<TSuccess = unknown>({ state }: { state: ActionState<TSuccess> }) {
  if (!state || !('error' in state)) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-red-600">
      {state.error}
    </p>
  );
}
