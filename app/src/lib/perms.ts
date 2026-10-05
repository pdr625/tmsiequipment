/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import type { Me } from './me';

// As guardas de auth-guard.ts, como funções PURAS sobre o `me()`. Existem para o RENDER:
// uma página que já tem (ou partilha, via getMe() sem argumento) o `me()` decide o que
// mostrar SEM ir à BD outra vez. Até 2026-10-05 cada página pagava as suas guardas:
// /config 8 chamadas (4 guardas × 1-3 has_role), /overrides 5, /audit 4, /import 3…
//
// EQUIVALÊNCIA, não aproximação: tmsi.has_role(r) é «existe linha em tmsi.user_roles para
// auth.uid() com este papel» e `me().roles` é o array_agg dessas linhas; `can_read_costs`
// e `can_read_operational` vêm do `me()` tal como são. Cada função abaixo tem o MESMO
// critério que a do mesmo nome em auth-guard.ts — o smoke compara os conjuntos de papéis
// por texto e a prova em Node (scripts/prova-perms.mjs) compara-os, para cada papel com
// conta de teste, com as chamadas reais à BD.
//
// ⚠️ NÃO SUBSTITUI auth-guard.ts. As Server Actions continuam a perguntar à BD: são
// directamente invocáveis, a fronteira real é a RLS e a guarda da acção, e uma acção não
// partilha render com ninguém. Estas funções são para decidir o que uma PÁGINA mostra e se
// redirecciona. `me` nulo (sem identidade) = tudo falso, como as guardas fariam.

const has = (me: Me, r: string) => me.roles.includes(r);

export function isAdmin(me: Me | null): boolean {
  return !!me && has(me, 'admin');
}

export function canManageProducts(me: Me | null): boolean {
  return !!me && (has(me, 'admin') || has(me, 'product_manager'));
}

export function canManageFinanceConfig(me: Me | null): boolean {
  return !!me && (has(me, 'admin') || has(me, 'finance'));
}

// Mais largo que o anterior, de propósito: logistics escreve transport_tiers/customs_rates.
export function canManageOperationalConfig(me: Me | null): boolean {
  return !!me && (has(me, 'admin') || has(me, 'finance') || has(me, 'logistics'));
}

export function pricingConfigReadAccess(me: Me | null): { readCosts: boolean; readLogistics: boolean } {
  return { readCosts: !!me && me.can_read_costs === true, readLogistics: !!me && has(me, 'logistics') };
}

export function canManageAnyPriceOverride(me: Me | null): boolean {
  return (
    !!me && (has(me, 'admin') || has(me, 'finance') || has(me, 'branch_manager') || has(me, 'logistics'))
  );
}

// Dashboard: só can_read_costs(); logistics fica de fora de propósito (decisão de i8).
export function canReadDashboard(me: Me | null): boolean {
  return !!me && me.can_read_costs === true;
}

// audit_read: NÃO inclui product_manager nem logistics.
export function canReadAuditLog(me: Me | null): boolean {
  return (
    !!me && (has(me, 'admin') || has(me, 'finance') || has(me, 'viewer') || has(me, 'branch_manager'))
  );
}

export function isBranchManager(me: Me | null): boolean {
  return !!me && has(me, 'branch_manager');
}
