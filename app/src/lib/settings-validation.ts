/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// A forma de cada chave de `tmsi.settings` (migração 0024, item 86). ESPELHO do CHECK `settings_value_shape`: existe para dar uma
// mensagem útil por chave antes de ir à BD; a BD é a barreira real (as Server Actions são invocáveis directamente) e o smoke
// compara as duas por um conjunto de casos, por isso mudar uma sem a outra parte o smoke.
//
// Devolve o texto do erro, ou null quando o valor é aceitável. Chaves desconhecidas passam, como no CHECK. A ORDEM
// margin_min < margin_target < margin_good envolve outras linhas e é verificada só pela BD (gatilho), cuja mensagem a página mostra.

const FRACTION_KEYS = ['margin_good', 'margin_min', 'margin_target', 'fx_tolerance'];

export function validateSetting(key: string, value: unknown): string | null {
  if (FRACTION_KEYS.includes(key)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${key} tem de ser um número (ex.: 0.15), não ${describe(value)}.`;
    if (!(value > 0 && value < 1)) return `${key} tem de estar entre 0 e 1, sem incluir os extremos (recebido ${value}). Uma margem de 15% escreve-se 0.15.`;
    return null;
  }
  if (key === 'review_days') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `review_days tem de ser um número inteiro de dias (ex.: 90), não ${describe(value)}.`;
    if (!(value > 0) || !Number.isInteger(value)) return `review_days tem de ser um número inteiro maior que 0 (recebido ${value}).`;
    return null;
  }
  if (key === 'fx_source') {
    if (typeof value !== 'string') return `fx_source tem de ser texto entre aspas (ex.: "SAP"), não ${describe(value)}.`;
    if (value.trim().length === 0) return 'fx_source não pode estar vazio.';
    return null;
  }
  if (key === 'operational_price_notice') {
    if (typeof value !== 'boolean') return `operational_price_notice tem de ser true ou false, não ${describe(value)}.`;
    return null;
  }
  return null;
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return `o texto "${v}"`;
  if (typeof v === 'number') return `o número ${v}`;
  if (typeof v === 'boolean') return `${v}`;
  return Array.isArray(v) ? 'uma lista' : 'um objecto';
}

// item 93: `fx_source` é texto por natureza e aparecia como `"SAP"`, com aspas — o JSON em bruto. Nas chaves de texto o campo mostra e
// aceita o texto simples (SAP); o resto continua a ser JSON em bruto (0.15, true…). Decidido PELA CHAVE no servidor, nunca por um
// campo que o cliente mande: o que o cliente pode escolher é só o texto, e a forma é validada na mesma por validateSetting + a BD.
export const TEXT_SETTING_KEYS = ['fx_source'];

export function settingInputText(key: string, value: unknown): string {
  return TEXT_SETTING_KEYS.includes(key) && typeof value === 'string' ? value : JSON.stringify(value);
}

export function parseSettingInput(key: string, raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (TEXT_SETTING_KEYS.includes(key)) {
    const t = raw.trim();
    // quem ainda escreve as aspas (como antes) não fica com aspas dentro do valor
    try {
      const j: unknown = JSON.parse(t);
      if (typeof j === 'string') return { ok: true, value: j };
    } catch {
      /* texto simples */
    }
    return { ok: true, value: t };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: `Invalid JSON value: ${raw}` };
  }
}
