/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import type { Me } from './me';
import {
  canManageProducts,
  canReadAuditLog,
  canReadDashboard,
  isAdmin,
  pricingConfigReadAccess,
} from './perms';

export type NavItem = { href: string; label: string };
export type NavSection = { title: string; items: NavItem[] };

// Quem vê que entradas do menu lateral. Os critérios vivem em ./perms (espelho puro das guardas
// de auth-guard.ts sobre o `me()`) — a MESMA fonte que as páginas usam para decidir o que mostram,
// por isso o menu e a página nunca discordam. Esconder uma entrada é conveniência, nunca segurança:
// cada página e cada Server Action têm a sua guarda, e a RLS decide as linhas.
export function navFor(me: Me): NavSection[] {
  const admin = isAdmin(me);
  const { readCosts, readLogistics } = pricingConfigReadAccess(me);
  const canProducts = canManageProducts(me);
  const canAudit = canReadAuditLog(me);

  const pricing: NavItem[] = [
    { href: '/prices', label: 'Price list' },
    { href: '/products', label: 'Products' },
    { href: '/overrides', label: 'Overrides' },
    { href: '/proposals', label: 'Proposals' },
  ];
  if (canReadDashboard(me)) pricing.push({ href: '/dashboard', label: 'Dashboard' });

  const setup: NavItem[] = [];
  if (readCosts || readLogistics) setup.push({ href: '/config', label: 'Pricing configuration' });
  if (canProducts) setup.push({ href: '/import', label: 'Bulk import' });
  if (admin) setup.push({ href: '/branches', label: 'Branches & channels' });

  const administration: NavItem[] = [];
  if (canAudit) administration.push({ href: '/audit', label: 'Audit log' });
  if (admin) administration.push({ href: '/admin/users', label: 'User administration' });
  if (admin) administration.push({ href: '/config/branding', label: 'Branding' });

  const account: NavItem[] = [
    { href: '/account/password', label: 'Change password' },
    { href: '/privacy', label: 'Data processing notice' },
  ];

  return [
    { title: 'Pricing', items: pricing },
    { title: 'Setup', items: setup },
    { title: 'Administration', items: administration },
    { title: 'Account', items: account },
  ].filter((s) => s.items.length > 0);
}

// A entrada activa é a de href MAIS LONGO que corresponde ao caminho: sem
// isto, /config/branding acenderia também «Pricing configuration» (/config).
export function activeHref(pathname: string, sections: NavSection[]): string | null {
  let best: string | null = null;
  for (const s of sections) {
    for (const i of s.items) {
      if (pathname === i.href || pathname.startsWith(i.href + '/')) {
        if (best === null || i.href.length > best.length) best = i.href;
      }
    }
  }
  return best;
}
