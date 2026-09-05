/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// Shared shape for Server Actions that report an inline error or success
// (as opposed to redirect()-on-success flows, which stay on their own
// narrower `{ error: string } | undefined` and don't use this).
//
// TSuccess defaults to `unknown`, not `{}`/`Record<string, never>` —
// intersecting with `unknown` is the identity (`X & unknown` reduces to
// `X`), so the plain `{ success: true }` case stays exactly that. A
// `Record<...>` default would give the success branch a real index
// signature, which breaks the `'error' in state` narrowing every caller
// relies on to tell the two branches apart.
export type ActionState<TSuccess = unknown> = { error: string } | ({ success: true } & TSuccess) | undefined;
