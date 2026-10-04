/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { getMe } from '@/lib/me';
import { getBranding } from '@/lib/branding';
import { navFor } from '@/lib/nav';
import { ThemeToggle } from '../theme-toggle';
import { AppShell } from './app-shell';

// Layout das páginas autenticadas: o menu lateral. Custo, medido pelo desenho:
//  - `getMe()` sem argumento partilha o resultado com a página no mesmo render
//    (cache do React) — nas páginas que já pedem `me()` (o /prices) o número de
//    pedidos NÃO sobe; nas outras sobe um (o próprio `me`, que substitui as
//    10+ chamadas a has_role() que a página inicial antiga fazia).
//  - `getBranding()` já é pedido pelo layout de raiz (generateMetadata) e está
//    em cache() — zero pedidos novos.
//  - Os layouts persistem em navegações suaves: o menu não volta a pedir nada
//    quando se passa de página em página.
//
// Sem identidade (não devia acontecer, o middleware já redirecciona) ou com a
// troca de password forçada pendente (i9): só o conteúdo, sem menu — o
// middleware só deixa passar /account/password nesse estado, e um menu cheio
// de links que redirecionam de volta confundiria.
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getMe();
  if (!me || me.must_change_password) {
    return (
      <>
        {children}
        <ThemeToggle />
      </>
    );
  }
  const branding = await getBranding();
  return (
    <AppShell brand={branding.displayName} userLabel={me.full_name ?? 'Signed in'} sections={navFor(me)}>
      {children}
    </AppShell>
  );
}
