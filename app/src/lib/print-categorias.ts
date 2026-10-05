/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// Selecção de CATEGORIAS a imprimir no /prices. Lógica pura (sem React) para se poder
// testar à parte — é a única peça desta funcionalidade que gera CSS a partir de dados.
//
// As regras escondem `tr[data-cat="<id>"]` só na impressão. O id vai para dentro de uma
// string de CSS, por isso NUNCA se confia nele: só entra se (1) tem a forma de um código
// de categoria (letras, algarismos, `_`, `.`, `-`) e (2) é uma das categorias que a
// página realmente mostra. Um valor vindo de fora (localStorage, URL, outro separador)
// que falhe qualquer das duas é ignorado, em silêncio, em vez de ir parar ao CSS.

export type PrintCategory = { id: string; label: string; count: number };

// Produtos sem categoria (3 no catálogo, 2026-10-05) formam o seu próprio grupo.
export const SEM_CATEGORIA = '__none';

const ID_OK = /^[A-Za-z0-9_.-]{1,40}$/;

export function categoriaValida(id: string, validos: ReadonlySet<string>): boolean {
  return typeof id === 'string' && ID_OK.test(id) && validos.has(id);
}

export function regrasCategorias(escondidas: readonly string[], validos: ReadonlySet<string>): string {
  const regras = escondidas
    .filter((id) => categoriaValida(id, validos))
    .map((id) => `#prices-root tr[data-cat="${id}"]{display:none}`);
  return regras.length > 0 ? `@media print{${regras.join('')}}` : '';
}

// Quantas linhas saem, e se a lista impressa é parcial.
export function resumo(categorias: readonly PrintCategory[], escondidas: readonly string[]) {
  const validos = new Set(categorias.map((c) => c.id));
  const fora = new Set(escondidas.filter((id) => categoriaValida(id, validos)));
  const impressas = categorias.filter((c) => !fora.has(c.id));
  return {
    parcial: fora.size > 0,
    categoriasImpressas: impressas,
    linhasImpressas: impressas.reduce((n, c) => n + c.count, 0),
    linhasTotal: categorias.reduce((n, c) => n + c.count, 0),
  };
}
