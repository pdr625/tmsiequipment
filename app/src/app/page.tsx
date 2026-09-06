/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isAdmin, pricingConfigReadAccess, canReadAuditLog } from '@/lib/auth-guard';
import { getBranding } from '@/lib/branding';

// Minimal authenticated home — middleware already guarantees a session
// exists here. Further screens (app/README.md) are their own routes.
// The "Admin" link below is convenience only — /admin/users has its own
// server-side gate and doesn't depend on this link being hidden.
export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = await isAdmin();
  const { readCosts, readLogistics } = await pricingConfigReadAccess();
  const canReadAudit = await canReadAuditLog();
  const branding = await getBranding();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">{branding.displayName}</h1>
        <p className="mb-6 text-sm text-gray-600">Signed in as {user?.email}</p>
        <Link
          href="/prices"
          className="mb-4 block w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white"
        >
          Price list
        </Link>
        <Link
          href="/products"
          className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
        >
          Products
        </Link>
        {(readCosts || readLogistics) && (
          <Link
            href="/config"
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Pricing configuration
          </Link>
        )}
        {readCosts && (
          <Link
            href="/dashboard"
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Dashboard
          </Link>
        )}
        <Link
          href="/overrides"
          className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
        >
          Overrides
        </Link>
        <Link
          href="/proposals"
          className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
        >
          Proposals
        </Link>
        {canReadAudit && (
          <Link
            href="/audit"
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Audit log
          </Link>
        )}
        {admin && (
          <Link
            href="/admin/users"
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            User administration
          </Link>
        )}
        {admin && (
          <Link
            href="/config/branding"
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Branding
          </Link>
        )}
        <Link
          href="/account/password"
          className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
        >
          Change password
        </Link>
        <form action="/logout" method="post">
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
