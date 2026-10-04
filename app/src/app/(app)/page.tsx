/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { redirect } from 'next/navigation';

// A página inicial já foi um cartão com ~13 botões. O menu passou para a barra
// lateral (layout.tsx / app-shell.tsx), por isso «/» só leva ao ecrã que a
// maioria vem ver. Decisão de 2026-10-04, fácil de reverter: se a direcção
// preferir um painel de entrada, é aqui que ele volta a viver.
export default function HomePage() {
  redirect('/prices');
}
