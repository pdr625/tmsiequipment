/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// A identidade «system» do audit_log (migração 0022, item 94). Espelho de `tmsi.system_actor()`: o smoke compara os dois,
// por isso mudar um sem o outro parte o smoke.
//
// `system` NÃO é um utilizador: é o autor das escritas feitas directamente à base de dados, sem sessão autenticada —
// manutenção, o próprio smoke, migrações, cascatas (ex.: apagar uma conta no GoTrue). O gatilho `audit()` grava
// `coalesce(auth.uid(), system_actor())`, e uma restrição impede autor nulo nas linhas novas.
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000001';

// O que o /audit mostra no lugar do autor. As linhas ANTERIORES à 0022 têm `actor` nulo e não foram reescritas (um
// registo de auditoria não se altera em silêncio): mostram-se como «system (legacy)». O resto resolve-se pelo e-mail
// quando o perfil é visível a quem lê, ou fica o UUID.
export function actorLabel(
  actor: string | null,
  emailOf: (id: string) => string | undefined,
  removed?: ReadonlySet<string>,
): string {
  if (actor === null) return 'system (legacy, no identity)';
  if (actor === SYSTEM_ACTOR_ID) return 'system';
  // item 45: um utilizador removido já não tem perfil — o UUID fica no audit, o nome não
  if (removed?.has(actor)) return 'Removed user';
  return emailOf(actor) ?? actor;
}
