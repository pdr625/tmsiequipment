/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import type { Me } from './me';

export type NavItem = { href: string; label: string };
export type NavSection = { title: string; items: NavItem[] };

// Quem vê que entradas do menu lateral. Replica, a partir de `me()`, as
// mesmas decisões que a página inicial antiga tomava com 10+ chamadas a
// has_role()/can_read_costs() — ver lib/auth-guard.ts, que continua a ser a
// FRONTEIRA real (cada página e cada Server Action tem a sua guarda, e a RLS
// decide as linhas). Esconder uma entrada é conveniência, nunca segurança.
//
// A equivalência é exacta, não aproximada: tmsi.has_role(r) é «existe linha
// em tmsi.user_roles para auth.uid() com este papel», e `me().roles` é o
// array_agg dessas mesmas linhas. `can_read_costs` vem de `me()` tal como é.
// Se uma guarda de auth-guard.ts mudar, esta função muda com ela (o smoke,
// bloco MM, prova que cada predicado aqui bate com o do auth-guard).
export function navFor(me: Me): NavSection[] {
  const has = (r: string) => me.roles.includes(r);
  const admin = has('admin');
  const readCosts = me.can_read_costs === true;
  const readLogistics = has('logistics');
  const canProducts = admin || has('product_manager');
  const canAudit = admin || has('finance') || has('viewer') || has('branch_manager');

  const pricing: NavItem[] = [
    { href: '/prices', label: 'Price list' },
    { href: '/products', label: 'Products' },
    { href: '/overrides', label: 'Overrides' },
    { href: '/proposals', label: 'Proposals' },
  ];
  if (readCosts) pricing.push({ href: '/dashboard', label: 'Dashboard' });

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
