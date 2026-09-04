/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { redirect } from 'next/navigation';
import { ConfirmForm } from './confirm-form';

// GET must stay side-effect-free. Caught live (E3-i3): corporate mail
// security gateways (Microsoft Safe Links, Proofpoint, Mimecast...)
// pre-fetch every link in an incoming email to scan it, seconds after send
// — long before the real recipient opens their inbox. The previous version
// (a route.ts) ran verifyOtp directly on GET, so the scanner's fetch
// silently consumed the one-time token: 3/3 invite+recovery links sent to a
// condat.fr address were burned within under a minute of sending, each
// logged as our own server completing the token exchange (user-agent
// "node") — never the actual recipient, who never saw the email land.
// This page only renders a form now; the real exchange happens in
// confirmToken (actions.ts), reached only by the POST a person's click on
// the button triggers. No link-scanner submits forms.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; code?: string }>;
}) {
  const { token_hash: tokenHash, type, code } = await searchParams;

  if (!((tokenHash && type) || code)) {
    redirect('/login?error=reset_link_invalid');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">
          {type === 'invite' ? "You've been invited" : 'Reset your password'}
        </h1>
        <p className="mb-6 text-sm text-gray-600">
          Confirm to continue — this keeps the link from being used automatically before you open it.
        </p>
        <ConfirmForm tokenHash={tokenHash} type={type} code={code} />
      </div>
    </div>
  );
}
