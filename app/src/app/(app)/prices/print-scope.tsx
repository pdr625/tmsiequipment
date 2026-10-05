/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// Escolher o que se imprime (colunas e blocos do cabeçalho). Só afecta a
// IMPRESSÃO: o ecrã mostra sempre tudo. Não há nada aqui que o servidor
// decida — esconder uma coluna é CSS sobre o que a página já recebeu, por isso
// não abre nenhuma fronteira (um papel sem custos nem tem as colunas de custo
// na página). O aviso de «preços operacionais» (item 32) e o rodapé legal NÃO
// têm caixa: saem sempre, por desenho.
//
// Mecanismo: o contentor da página leva `data-hide="c5 c6 b-logo …"` e as
// regras @media print de globals.css escondem `:nth-child(N)` das tabelas e
// os elementos `[data-print="…"]`. «cN» é a coluna N (1 = Product, que nunca
// se esconde).

export type PrintColumn = { label: string; right?: boolean };
export type PrintVariant = 'costs' | 'sales';

export const PRINT_BLOCKS = [
  { key: 'logo', label: 'Logo' },
  { key: 'tagline', label: 'Tagline' },
  { key: 'scope', label: 'Scope' },
  { key: 'currency', label: 'Currency' },
  { key: 'generated', label: 'Generated date and user' },
] as const;

const STORAGE_KEY = 'tmsi.print.v1';
// Lista branca: o que vem do localStorage é só uma preferência de interface,
// mas nunca se confia nele para ir parar a um atributo sem o validar.
const TOKEN_OK = /^(c([2-9]|1[0-2])|b-(logo|tagline|scope|currency|generated))$/;

type Ctx = {
  columns: PrintColumn[];
  hidden: string[];
  toggle: (token: string) => void;
  reset: () => void;
};
const PrintCtx = createContext<Ctx | null>(null);

function load(variant: PrintVariant): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    const lista = raw?.[variant];
    return Array.isArray(lista) ? lista.filter((t): t is string => typeof t === 'string' && TOKEN_OK.test(t)) : [];
  } catch {
    return [];
  }
}

function save(variant: PrintVariant, hidden: string[]) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...raw, [variant]: hidden }));
  } catch {
    /* armazenamento bloqueado: a escolha aplica-se na mesma, só não persiste */
  }
}

// Contentor da página: é ele que leva o `data-hide`. Tem de ficar como filho
// directo de <main> (a regra de impressão `main > div` tira-lhe a largura máxima).
export function PrintScope({
  variant,
  columns,
  className,
  children,
}: {
  variant: PrintVariant;
  columns: PrintColumn[];
  className: string;
  children: React.ReactNode;
}) {
  const [hidden, setHidden] = useState<string[]>([]);

  // Lido DEPOIS de montar, para o HTML do servidor e o 1.º render do cliente
  // coincidirem (o servidor não sabe o que está no browser).
  useEffect(() => {
    setHidden(load(variant));
  }, [variant]);

  function update(next: string[]) {
    setHidden(next);
    save(variant, next);
  }

  const value: Ctx = {
    columns,
    hidden,
    toggle: (token) => update(hidden.includes(token) ? hidden.filter((t) => t !== token) : [...hidden, token]),
    reset: () => update([]),
  };

  return (
    <PrintCtx.Provider value={value}>
      <div id="prices-root" className={className} data-hide={hidden.length > 0 ? hidden.join(' ') : undefined}>
        {children}
      </div>
    </PrintCtx.Provider>
  );
}

export function PrintOptions() {
  const ctx = useContext(PrintCtx);
  if (!ctx) return null;
  const { columns, hidden, toggle, reset } = ctx;

  return (
    <details className="relative print:hidden">
      <summary className="cursor-pointer list-none rounded-md border border-line-strong px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-alt">
        Print options{hidden.length > 0 ? ` (${hidden.length} hidden)` : ''}
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-72 rounded-lg border border-line bg-surface p-4 text-sm shadow-md">
        <p className="mb-3 text-xs text-fg-muted">Only affects the printout; the screen always shows everything.</p>

        <fieldset className="mb-3">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">Columns</legend>
          <label className="flex items-center gap-2 py-0.5 text-fg-muted">
            <input type="checkbox" checked disabled /> {columns[0].label} (always)
          </label>
          {columns.slice(1).map((c, i) => {
            const token = `c${i + 2}`;
            return (
              <label key={token} className="flex items-center gap-2 py-0.5">
                <input type="checkbox" checked={!hidden.includes(token)} onChange={() => toggle(token)} /> {c.label}
              </label>
            );
          })}
        </fieldset>

        <fieldset className="mb-3">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">Header</legend>
          {PRINT_BLOCKS.map((b) => {
            const token = `b-${b.key}`;
            return (
              <label key={token} className="flex items-center gap-2 py-0.5">
                <input type="checkbox" checked={!hidden.includes(token)} onChange={() => toggle(token)} /> {b.label}
              </label>
            );
          })}
        </fieldset>

        <p className="mb-3 text-xs text-fg-muted">
          The operational-prices notice and the footer are always printed.
        </p>
        <button
          type="button"
          onClick={reset}
          disabled={hidden.length === 0}
          className="rounded-md border border-line-strong px-2 py-1 text-xs font-medium transition-colors hover:bg-surface-alt disabled:opacity-50"
        >
          Print everything
        </button>
      </div>
    </details>
  );
}
