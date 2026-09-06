/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { getBranding } from '@/lib/branding';
import { PROPRIETARY_NOTICE } from '@/lib/notice';
import { LoginForm } from './form';

// item 26: split into a server shell (this file, fetches branding — no
// session exists yet at /login, so tmsi.v_current_branding resolves as
// `anon`, which 0008 deliberately allows read on) and a client form
// (./form.tsx, unchanged interactive bits: useActionState needs
// 'use client', which can't fetch branding itself since it has no
// request/cookies context — same server/client split already used by
// every other gated page in this app, e.g. config/page.tsx + forms.tsx).
export default async function LoginPage() {
  const branding = await getBranding();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-semibold">{branding.displayName}</h1>
        <LoginForm />
      </div>

      <footer className="mt-8 max-w-sm text-center text-xs text-gray-500">
        {PROPRIETARY_NOTICE.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </footer>
    </div>
  );
}
