/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { getMe } from '@/lib/me';
import { ChangePasswordForm } from './change-password-form';

// i9: reachable regardless of the must_change_password flag —
// middleware.ts exempts this path (and /logout) specifically, since a
// flagged user has to be able to get here to clear it.
export default async function AccountPasswordPage() {
  // Eram dois pedidos (auth.getUser + profiles); o me() traz must_change_password e é partilhado com o layout.
  const me = await getMe();
  const forced = me?.must_change_password === true;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-bold tracking-tight">Change your password</h1>
        {forced && (
          <p className="mb-4 rounded-md border border-warning bg-warning-soft p-2 text-center text-xs text-warning">
            Your password was reset by an administrator. Set a new one to continue.
          </p>
        )}
        <ChangePasswordForm />
      </div>
    </div>
  );
}
