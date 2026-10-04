/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { ThemeToggle } from '../theme-toggle';

// Páginas SEM menu lateral (login, recuperação de password, confirmação de
// convite): só o seletor de tema flutuante. O menu lateral vive no layout de
// `(app)/` — dois grupos de rotas em vez de um layout condicional, porque um
// layout de raiz NÃO volta a renderizar numa navegação suave: depois do login
// (soft redirect de /login para /prices) ficaria sem menu até um refresh.
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <ThemeToggle />
    </>
  );
}
