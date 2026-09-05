/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { ChangePasswordForm } from './change-password-form';

// i9: reachable regardless of the must_change_password flag —
// middleware.ts exempts this path (and /logout) specifically, since a
// flagged user has to be able to get here to clear it.
export default async function AccountPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let forced = false;
  if (user) {
    const { data: profile } = await supabase
      .schema('tmsi')
      .from('profiles')
      .select('must_change_password')
      .eq('user_id', user.id)
      .maybeSingle();
    forced = profile?.must_change_password === true;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-center text-xl font-semibold">Change your password</h1>
        {forced && (
          <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-2 text-center text-xs text-amber-800">
            Your password was reset by an administrator. Set a new one to continue.
          </p>
        )}
        <ChangePasswordForm />
      </div>
    </div>
  );
}
