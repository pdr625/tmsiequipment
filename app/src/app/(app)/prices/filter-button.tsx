/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useRouter } from 'next/navigation';

// Botão de filtro que só navega ao CLIQUE. Substitui os <Link> dos filtros
// do /prices (2026-09-24): `prefetch={false}` no App Router desliga o
// pré-carregamento por viewport mas NÃO o de hover — medido no log de timing
// do nginx a 24/09 às 10:10, `LTD` e `CORP` pedidos no mesmo segundo e 7
// `_rsc` a custarem 7 `/auth/v1/user` sem nenhum clique. Cada um é um render
// completo no servidor. `router.push` não pré-carrega nada: o pedido só sai
// quando o utilizador escolhe.
export function FilterButton({
  href,
  active,
  className,
  children,
}: {
  href: string;
  active: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => router.push(href)}
      className={className}
    >
      {children}
    </button>
  );
}
