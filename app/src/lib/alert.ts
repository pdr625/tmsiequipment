/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// Item 67 (decisão do Pedro, 2026-09-24): serviços e opções NÃO são
// classificados. Têm margem 0 por decisão (regra plana do item 30 — a margem
// está no preço do artigo-pai), e o compute_price marca-os `critical` porque
// 0 < margin_min. O alerta diz a verdade sobre um número escolhido, e por
// isso não diz nada útil: a célula fica VAZIA — nem `critical`, nem `ok`.
//
// Feito na apresentação, não no motor: o `compute_price` continua a devolver
// o que devolvia (mudá-lo é migração), e os três ecrãs que mostram o alerta
// — /prices, o export e /products/[id] — passam todos por aqui.
//
// O bloco JJ do smoke lê este conjunto e confirma que cada valor existe no
// enum `tmsi.item_type`.
export const SEM_CLASSIFICACAO: ReadonlySet<string> = new Set(['service', 'option']);

/** '' para um artigo não classificado; o alerta do motor (ou null) nos restantes. */
export function alertaDe(alert: string | null | undefined, itemType: string | null | undefined): string | null {
  if (itemType && SEM_CLASSIFICACAO.has(itemType)) return '';
  return alert ?? null;
}
