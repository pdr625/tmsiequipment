/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useRouter } from 'next/navigation';

// Botão do menu da página inicial que só navega ao CLIQUE (item 81,
// decidido pelo Pedro a 2026-09-24). Os 12 <Link> do menu eram pré-carregados
// por viewport a cada visita — 12 renders completos no servidor, cada um com o
// seu /auth/v1/user + profiles + branding — e `prefetch={false}` não chega
// (não desliga o de hover; ver prices/filter-button.tsx e o item 73).
// `router.push` não pré-carrega nada: o pedido só sai quando o utilizador
// escolhe. Custo aceite: sem "abrir num novo separador" com o botão do meio.
export function MenuButton({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.push(href)} className={`cursor-pointer ${className}`}>
      {children}
    </button>
  );
}
