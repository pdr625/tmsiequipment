/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { signOut } from './actions';

// Minimal authenticated home for this iteration — middleware already
// guarantees a session exists here. Price-list screens are later
// iterations (app/README.md).
export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">TMSI Equipment Price Listing</h1>
        <p className="mb-6 text-sm text-gray-600">Signed in as {user?.email}</p>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
