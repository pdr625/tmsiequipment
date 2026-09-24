/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { MenuButton } from './menu-button';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isAdmin, pricingConfigReadAccess, canReadAuditLog, canManageProducts } from '@/lib/auth-guard';
import { getBranding } from '@/lib/branding';

// Minimal authenticated home — middleware already guarantees a session
// exists here. Further screens (app/README.md) are their own routes.
// Os itens do menu são <MenuButton> (router.push), não <Link>: item 81, zero
// prefetch — nem por viewport nem por hover.
// The "Admin" link below is convenience only — /admin/users has its own
// server-side gate and doesn't depend on this link being hidden.
export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = await isAdmin();
  const canProducts = await canManageProducts();
  const { readCosts, readLogistics } = await pricingConfigReadAccess();
  const canReadAudit = await canReadAuditLog();
  const branding = await getBranding();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">{branding.displayName}</h1>
        <p className="mb-6 text-sm text-gray-600">Signed in as {user?.email}</p>
        <MenuButton
          href="/prices"
          className="mb-4 block w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white"
        >
          Price list
        </MenuButton>
        <MenuButton
          href="/products"
          className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
        >
          Products
        </MenuButton>
        {(readCosts || readLogistics) && (
          <MenuButton
            href="/config"
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Pricing configuration
          </MenuButton>
        )}
        {readCosts && (
          <MenuButton
            href="/dashboard"
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Dashboard
          </MenuButton>
        )}
        <MenuButton
          href="/overrides"
          className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
        >
          Overrides
        </MenuButton>
        <MenuButton
          href="/proposals"
          className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
        >
          Proposals
        </MenuButton>
        {canReadAudit && (
          <MenuButton
            href="/audit"
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Audit log
          </MenuButton>
        )}
        {(admin || canProducts) && (
          <MenuButton
            href="/import"
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Bulk import
          </MenuButton>
        )}
        {admin && (
          <MenuButton
            href="/branches"
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Branches &amp; channels
          </MenuButton>
        )}
        {admin && (
          <MenuButton
            href="/admin/users"
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            User administration
          </MenuButton>
        )}
        {admin && (
          <MenuButton
            href="/config/branding"
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Branding
          </MenuButton>
        )}
        <MenuButton
          href="/account/password"
          className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
        >
          Change password
        </MenuButton>
        <MenuButton
          href="/privacy"
          className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
        >
          Data processing notice
        </MenuButton>
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
