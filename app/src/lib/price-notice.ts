/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { cache } from 'react';
import { createSupabaseServerClient } from './supabase-server';

// Item 32 (decisão do Pedro, 2026-09-24): enquanto a base do direito
// aduaneiro por zona não estiver confirmada pelo despachante, os preços são
// operacionais, não definitivos — e quem os lê tem de o saber. Aviso
// discreto e permanente no /prices (ecrã e impressão) e no rodapé do export.
//
// Uma chave de `tmsi.settings`, sem migração (a tabela aceita chaves livres).
// A política config_read mostra-a a qualquer autenticado (não começa por
// `margin_`), que é o necessário: `sales` e `agent` têm de a ler para verem
// o aviso.
//
// AUSENTE = LIGADO. O aviso só some quando a chave existe e vale `false`.
// Uma chave apagada por engano, ou uma leitura que falha, voltam a mostrá-lo
// — o erro seguro é avisar a mais, não a menos.
export const PRICE_NOTICE_KEY = 'operational_price_notice';
export const PRICE_NOTICE_TEXT = 'Prices are operational, pending customs-duty basis confirmation';

export const isPriceNoticeOn = cache(async function isPriceNoticeOn(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .schema('tmsi')
    .from('settings')
    .select('value')
    .eq('key', PRICE_NOTICE_KEY)
    .maybeSingle();
  return (data as { value: unknown } | null)?.value !== false;
});

/** O texto do aviso, ou null se o admin o desligou. */
export async function getPriceNotice(): Promise<string | null> {
  return (await isPriceNoticeOn()) ? PRICE_NOTICE_TEXT : null;
}
