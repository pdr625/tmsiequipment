/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { categoriaValida, regrasCategorias, resumo, type PrintCategory } from '@/lib/print-categorias';

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
//
// CATEGORIAS (linhas): escolhem-se por categoria de produto, não uma a uma. Diferente
// das colunas, a selecção de linhas NÃO se guarda no browser: esconder linhas em silêncio
// numa sessão futura imprimiria uma lista de preços incompleta sem ninguém reparar. Vive só
// no estado desta página e repõe-se quando a lista de categorias muda (outro filtro). E a
// folha impressa diz sempre quando é parcial (PrintCategoriesNote, sem caixa para a
// esconder). As linhas escondem-se com `<style>` gerado por `lib/print-categorias.ts`, que
// só deixa passar ids com forma de código E que existam nesta página.

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
  categories: PrintCategory[];
  hiddenCats: string[];
  toggleCat: (id: string) => void;
  setAllCats: (mostrar: boolean) => void;
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
  categories,
  className,
  children,
}: {
  variant: PrintVariant;
  columns: PrintColumn[];
  categories: PrintCategory[];
  className: string;
  children: React.ReactNode;
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [hiddenCats, setHiddenCats] = useState<string[]>([]);
  const validos = new Set(categories.map((c) => c.id));

  // A lista de categorias muda com os filtros (filial, estado): a selecção anterior já não
  // quer dizer o mesmo, por isso repõe-se. Sem persistência, de propósito (ver acima).
  const assinatura = categories.map((c) => c.id).join('|');
  useEffect(() => {
    setHiddenCats([]);
  }, [assinatura]);

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
    categories,
    hiddenCats,
    toggleCat: (id) =>
      setHiddenCats(hiddenCats.includes(id) ? hiddenCats.filter((x) => x !== id) : [...hiddenCats, id]),
    setAllCats: (mostrar) =>
      setHiddenCats(mostrar ? [] : categories.filter((c) => categoriaValida(c.id, validos)).map((c) => c.id)),
    reset: () => {
      update([]);
      setHiddenCats([]);
    },
  };

  const cssCategorias = regrasCategorias(hiddenCats, validos);

  return (
    <PrintCtx.Provider value={value}>
      <div id="prices-root" className={className} data-hide={hidden.length > 0 ? hidden.join(' ') : undefined}>
        {cssCategorias !== '' && <style>{cssCategorias}</style>}
        {children}
      </div>
    </PrintCtx.Provider>
  );
}

// Faixas do documento que se repetem em cada folha: o cabeçalho (logo, título, âmbito,
// moeda, gerado por, aviso) é a 1.ª linha do <thead>, o rodapé (texto de rodapé e texto
// legal do Branding) é a linha do <tfoot>. O Chrome repete o <thead> E o <tfoot>
// INTEIROS em cada folha — era assim que ambos ficavam de fora quando eram blocos
// soltos antes/depois da tabela (saíam só na 1.ª folha e só na última). No ecrã a linha
// está escondida (`hidden`); só existe no papel.
// `colSpan` acompanha as colunas VISÍVEIS: com colunas escondidas (cN → display:none)
// um colSpan fixo criaria colunas fantasma e desalinharia a tabela.
function FaixaImpressa({ children }: { children: React.ReactNode }) {
  const ctx = useContext(PrintCtx);
  const escondidas = ctx ? ctx.hidden.filter((t) => /^c\d+$/.test(t)).length : 0;
  const colunas = Math.max(1, (ctx ? ctx.columns.length : 1) - escondidas);
  return (
    <tr className="hidden print:table-row">
      <td colSpan={colunas} className="text-left font-normal">
        {children}
      </td>
    </tr>
  );
}

export function PrintHeaderRow({ children }: { children: React.ReactNode }) {
  return <FaixaImpressa>{children}</FaixaImpressa>;
}

export function PrintFooterRow({ children }: { children: React.ReactNode }) {
  return <FaixaImpressa>{children}</FaixaImpressa>;
}

// Dentro do cabeçalho impresso: quando só se imprimem algumas categorias, o papel di-lo.
// Sem caixa nem hook: uma lista de preços parcial tem de se apresentar como parcial.
export function PrintCategoriesNote() {
  const ctx = useContext(PrintCtx);
  if (!ctx) return null;
  const r = resumo(ctx.categories, ctx.hiddenCats);
  if (!r.parcial) return null;
  return (
    <p className="mt-1 text-sm font-medium">
      Partial list — {r.categoriasImpressas.length} of {ctx.categories.length} categories printed:{' '}
      {r.categoriasImpressas.map((c) => c.label).join(', ') || 'none'}
    </p>
  );
}

export function PrintOptions() {
  const ctx = useContext(PrintCtx);
  if (!ctx) return null;
  const { columns, hidden, toggle, reset, categories, hiddenCats, toggleCat, setAllCats } = ctx;
  const r = resumo(categories, hiddenCats);
  const escondidas = hidden.length + (r.parcial ? categories.length - r.categoriasImpressas.length : 0);

  return (
    <details className="relative print:hidden">
      <summary className="cursor-pointer list-none rounded-md border border-line-strong px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-alt">
        Print options{escondidas > 0 ? ` (${escondidas} hidden)` : ''}
      </summary>
      <div className="absolute right-0 z-10 mt-2 max-h-[75vh] w-80 overflow-y-auto rounded-lg border border-line bg-surface p-4 text-sm shadow-md">
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

        {categories.length > 0 && (
          <fieldset className="mb-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">Categories</legend>
            <div className="mb-1 flex gap-2">
              <button
                type="button"
                onClick={() => setAllCats(true)}
                className="rounded-md border border-line-strong px-2 py-0.5 text-xs transition-colors hover:bg-surface-alt"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setAllCats(false)}
                className="rounded-md border border-line-strong px-2 py-0.5 text-xs transition-colors hover:bg-surface-alt"
              >
                None
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {categories.map((c) => {
                // Um código fora da forma segura nunca gera regra de CSS: mostrá-lo como
                // desmarcável seria dizer que não imprime quando imprime. Fica «sempre impressa».
                const fixa = !categoriaValida(c.id, new Set(categories.map((x) => x.id)));
                return (
                  <label key={c.id} className="flex items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={fixa || !hiddenCats.includes(c.id)}
                      disabled={fixa}
                      onChange={() => toggleCat(c.id)}
                    />
                    <span className="flex-1">
                      {c.label}
                      {fixa ? ' (always printed)' : ''}
                    </span>
                    <span className="text-xs text-fg-muted">{c.count}</span>
                  </label>
                );
              })}
            </div>
            <p className={`mt-1 text-xs ${r.linhasImpressas === 0 ? 'text-danger' : 'text-fg-muted'}`}>
              {r.linhasImpressas === 0
                ? 'Nothing selected: the printout would be empty.'
                : `Printing ${r.linhasImpressas} of ${r.linhasTotal} rows. Not remembered between visits.`}
            </p>
          </fieldset>
        )}

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
          disabled={escondidas === 0}
          className="rounded-md border border-line-strong px-2 py-1 text-xs font-medium transition-colors hover:bg-surface-alt disabled:opacity-50"
        >
          Print everything
        </button>
      </div>
    </details>
  );
}
