/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// Remoção de um utilizador (item 45, migração 0025). A parte pura — a confirmação por email escrito — para poder ser provada em Node.
// A SEGURANÇA não está aqui: está em isAdmin() na ação, em tmsi.removal_blockers() e em tmsi.redact_removed_user() (só admin, na BD).
// Isto só impede que se remova a pessoa errada por um clique distraído.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

// O email escrito tem de ser exactamente o da conta (maiúsculas e espaços à volta não contam). Vazio nunca confirma.
export function confirmationMatches(accountEmail: string | null | undefined, typed: string): boolean {
  const a = (accountEmail ?? '').trim().toLowerCase();
  const t = typed.trim().toLowerCase();
  return a.length > 0 && a === t;
}
