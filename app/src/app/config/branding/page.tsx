/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/auth-guard';
import { getBranding } from '@/lib/branding';
import { BrandingForm } from './form';

// Admin-only (item 26 §1(b)) — same convenience-redirect principle as
// every other gated page in this app (e.g. /admin/users): the real
// boundary is tmsi.branding's own RLS (branding_write, migration 0008),
// re-checked independently inside the Server Action regardless of
// whether this page ever renders for a given caller.
export default async function BrandingPage() {
  if (!(await isAdmin())) {
    redirect('/');
  }

  const branding = await getBranding();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Branding</h1>
        <Link href="/" className="text-sm text-gray-600 underline">
          Back
        </Link>
      </div>
      <p className="mb-6 text-xs text-gray-500">
        Applied to the app&apos;s title/home page and to the Excel export and print view.
        Append-only, like the rest of this app&apos;s configuration: saving never edits a
        previous version, it takes effect immediately as a new one. This never needs approval
        (it changes what a document looks like, not a published price) and never affects the
        software&apos;s own licence notice, which always stays in the app (the login page
        footer) and never appears in an exported or printed document.
      </p>
      <BrandingForm branding={branding} hasLogo={branding.logoId !== null} />
    </div>
  );
}
