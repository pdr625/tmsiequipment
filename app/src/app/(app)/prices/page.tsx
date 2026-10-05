/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getBranding, footerLines } from '@/lib/branding';
import { PrintButton } from './print-button';
import { PrintScope, PrintOptions, PrintHeaderRow, PrintFooterRow, type PrintColumn } from './print-scope';
import { FilterButton } from './filter-button';
import { alertaDe } from '@/lib/alert';
import { getPriceNotice } from '@/lib/price-notice';
import { getMe } from '@/lib/me';

// As colunas de cada vista, numa só lista: alimenta o <th> e as caixas de
// «Print options». A ordem É o número da coluna (`:nth-child`) que a impressão
// esconde — por isso o <th> é gerado daqui e não escrito à mão ao lado.
const COLS_COSTS: PrintColumn[] = [
  { label: 'Product' },
  { label: 'Scope' },
  { label: 'Status' },
  { label: 'Currency' },
  { label: 'Total cost (EUR)', right: true },
  { label: 'Margin', right: true },
  { label: 'Min price', right: true },
  { label: 'Ref price', right: true },
  { label: 'Alert' },
];
const COLS_SALES: PrintColumn[] = [
  { label: 'Product' },
  { label: 'Scope' },
  { label: 'Currency' },
  { label: 'Min price', right: true },
  { label: 'Ref price', right: true },
  { label: 'Lead time (days)', right: true },
];

type Branch = { id: string; name: string };
type Channel = { id: string; name: string };

// A forma que as duas vistas têm em comum, mais o que cada uma acrescenta. O
// ecrã trata as linhas por esta forma e faz o estreitamento onde precisa.
type LinhaQualquer = {
  product_id: string;
  branch_id: string;
  name?: string;
  category_id?: string | null;
  status?: string;
  item_type?: string;
};

type LinhaPreco = LinhaQualquer & {
  currency: string;
  min_price: number | null;
  ref_price: number | null;
  total_cost_eur?: number | null;
  margin?: number | null;
  alert?: string | null;
  scope_type?: string | null;
  lead_time_days?: number | null;
};

export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; status?: string }>;
}) {
  const { branch, status: statusFiltro } = await searchParams;
  const supabase = await createSupabaseServerClient();

  // Which view a user gets (full costs vs selling-price-only) is a security
  // decision, not a UI one — the page asks Postgres (tmsi.me(), que devolve
  // tmsi.can_read_costs(), the same predicate compute_price() itself uses)
  // rather than re-implementing the role check here. Whatever it answers, RLS
  // on the underlying tables still scopes which *rows* come back — this is a
  // convenience choice of view, not the actual access control.
  //
  // `me()` (0021) é UM pedido que traz a decisão de vista E o nome de quem
  // gera — até 2026-09-24 eram três: getUser(), profiles e can_read_costs().
  // É o único await que tem de vir antes dos outros: decide QUAL vista se lê.
  const me = await getMe();
  const canReadCosts = me?.can_read_costs === true;

  // item 72: só as colunas que o ecrã mostra. `select('*')` trazia ~20 colunas
  // por linha — em "All branches" são 283 linhas × 20 valores serializados
  // pelo PostgREST para o ecrã usar oito. Não muda o custo de cálculo (esse é
  // o item 69, resolvido pela 0020); muda o que atravessa a rede.
  //
  // ⚠️ AS DUAS CONSULTAS SÃO SEPARADAS, E TÊM DE SER. O postgrest-js deriva o
  // tipo do resultado da **string literal** do `.select()`, por tipo
  // condicional. Uma lista de colunas escolhida em tempo de execução (um
  // ternário, uma variável) dá-lhe um `Query` que é um union de duas strings
  // e ele tenta analisá-las às duas — foi o que partiu a compilação a
  // 2026-09-23. Com `.from()` a receber também um nome de vista variável, o
  // construtor já vinha como union e a reatribuição do `.eq()` fechava o
  // problema. Dois ramos, cada um com a sua string literal, e a conversão
  // feita UMA vez no fim: nada aqui depende de inferência.
  const precos: PromiseLike<{ data: LinhaPreco[] | null; error: { message: string } | null }> =
    canReadCosts
      ? (() => {
          const q = supabase
            .schema('tmsi')
            .from('v_branch_prices')
            .select('product_id, name, category_id, status, item_type, branch_id, scope_type, currency, total_cost_eur, margin, min_price, ref_price, alert');
          return (branch ? q.eq('branch_id', branch) : q) as unknown as PromiseLike<{
            data: LinhaPreco[] | null;
            error: { message: string } | null;
          }>;
        })()
      : (() => {
          const q = supabase
            .schema('tmsi')
            .from('v_selling_prices')
            .select('product_id, name, category_id, status, branch_id, currency, min_price, ref_price, lead_time_days');
          return (branch ? q.eq('branch_id', branch) : q) as unknown as PromiseLike<{
            data: LinhaPreco[] | null;
            error: { message: string } | null;
          }>;
        })();

  const [{ data: rows, error }, { data: branches }, { data: channels }] = await Promise.all([
    precos,
    supabase.schema('tmsi').from('branches').select('id, name').eq('active', true).order('id')
      .overrideTypes<Branch[], { merge: false }>(),
    // 0009: channels get their own filter row, never mixed into "branches" —
    // a channel is a distinct pricing scope (v_branch_prices/v_selling_prices
    // union branch and channel rows, docs/MODEL-GAP-ANALYSIS.md items 5/6),
    // not a filial with a different name.
    supabase.schema('tmsi').from('channels').select('id, name').eq('active', true).order('id')
      .overrideTypes<Channel[], { merge: false }>(),
  ]);
  const geradoPor = me?.full_name ?? '—';

  // Ordem de apresentação: categoria -> código -> âmbito. O âmbito não é
  // alfabético — é a ordem comercial das filiais, com os canais no fim, para
  // a lista ler como a folha do Excel de onde veio.
  const ORDEM_AMBITO = ['SA', 'TBM', 'CORP', 'LTD'];
  const pesoAmbito = (id: string) => {
    const i = ORDEM_AMBITO.indexOf(id);
    return i === -1 ? ORDEM_AMBITO.length : i;   // canal (ou filial nova): depois
  };
  // Desde a 0021 as duas vistas trazem nome, categoria, estado e tipo — a
  // página deixou de cruzar com o catálogo em memória.
  const nomeDe = (r: LinhaQualquer) => r.name || '';
  const categoriaDe = (r: LinhaQualquer) => r.category_id || '\uffff';
  const estadoDe = (r: LinhaQualquer) => r.status || 'active';

  // Estado: por omissão só `active`, para o papel de custos. Até aqui um
  // artigo em draft aparecia ao lado dos activos sem nada que o distinguisse
  // (visto pelo Pedro a 23/09: o T-0001, inactive, com Alert error). As vistas
  // de venda já só contêm activos, logo o filtro só faz sentido no ramo de
  // custos.
  const estadoPedido = statusFiltro ?? 'active';
  const mostrarTodos = estadoPedido === 'all';
  const visiveis = (rows ?? [])
    .filter((r) => !canReadCosts || mostrarTodos || estadoDe(r) === estadoPedido)
    .sort(
      (a, b) =>
        categoriaDe(a).localeCompare(categoriaDe(b)) ||
        a.product_id.localeCompare(b.product_id) ||
        pesoAmbito(a.branch_id) - pesoAmbito(b.branch_id) ||
        a.branch_id.localeCompare(b.branch_id),
    );

  // Formatação: o custo a duas casas (é dinheiro), a margem em percentagem
  // (está guardada como fracção — 0,15 é o margin_min das settings).
  const eur = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));
  const pct = (v: number | null | undefined) =>
    v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(1)} %`;

  // ⚠️11: o rótulo descreve o CONTEÚDO, não o filtro. Sem filtro, a lista
  // traz também as linhas de canal.
  const temCanal = visiveis.some((r) => channels?.some((c) => c.id === r.branch_id));
  const rotuloAmbito = branch ?? (temCanal ? 'All branches and channels' : 'All branches');

  // i10: same metadata the .xlsx export carries in its own header block —
  // shown here only for print (the screen already has the branch filter
  // for scope, and no on-screen use for the rest).
  const generatedAt = new Date();
  const currencies = [...new Set(visiveis.map((r) => (r as LinhaPreco).currency))].sort();
  const [branding, aviso] = await Promise.all([getBranding(), getPriceNotice()]);
  const footer = footerLines(branding);

  // Cabeçalho do documento impresso. Vive na 1.ª linha do <thead> (PrintHeaderRow) para
  // se repetir em cada folha. Inclui o aviso de «preços operacionais» (item 32): o aviso
  // sai sempre e agora também em todas as folhas — uma folha solta não perde o aviso.
  const cabecalhoImpresso = (
    <div className="mb-3" style={{ fontFamily: branding.fontFamily }}>
      <div className="flex items-center gap-3">
        {branding.logoId !== null && (
          <img src="/api/branding/logo" alt="" data-print="logo" className="h-9 w-auto" />
        )}
        <div>
          <h1 className="text-lg font-bold" style={{ color: branding.primaryColor }}>
            {branding.displayName} — Price list
          </h1>
          {branding.tagline !== '' && (
            <p data-print="tagline" className="text-sm text-fg-soft">{branding.tagline}</p>
          )}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
        <p data-print="scope">Scope: {rotuloAmbito}</p>
        <p data-print="currency">Currency: {currencies.join(', ') || '—'}</p>
        <p data-print="generated">
          Generated: {generatedAt.toISOString()} by {geradoPor}
        </p>
      </div>
      {aviso && (
        <p role="note" className="mt-2 text-xs text-warning">
          ⓘ {aviso}
        </p>
      )}
    </div>
  );

  // Rodapé do documento impresso (texto de rodapé + texto legal do Branding). Vive na linha
  // do <tfoot> (PrintFooterRow) para se repetir em cada folha, como o cabeçalho. Sem caixa
  // em «Print options»: é texto legal, sai sempre.
  const rodapeImpresso = footer.length > 0 && (
    <div className="mt-3 text-xs text-fg-muted" style={{ fontFamily: branding.fontFamily }}>
      {footer.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );

  return (
    <PrintScope
      variant={canReadCosts ? 'costs' : 'sales'}
      columns={canReadCosts ? COLS_COSTS : COLS_SALES}
      className="mx-auto max-w-5xl px-4 py-8"
    >
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold tracking-tight">Price list</h1>
        <div className="flex items-center gap-4">
          <a
            href={branch ? `/prices/export?branch=${branch}` : '/prices/export'}
            className="rounded-md border border-line-strong px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-alt"
          >
            Export to Excel
          </a>
          <PrintOptions />
          <PrintButton />
        </div>
      </div>

      {/* Item 32: preços operacionais até o despachante confirmar a base do
          direito aduaneiro. Este é o do ECRÃ; na impressão sai a cópia que vai
          no cabeçalho repetido (cabecalhoImpresso), por isso aqui é print:hidden. */}
      {aviso && (
        <p role="note" className="mb-4 text-xs text-warning print:hidden">
          ⓘ {aviso}
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        {/* Botões, não <Link>. A 23/09 os <Link> destes filtros eram
            pré-carregados pelo Next.js ao entrar no ecrã (quatro links = 12
            pedidos extra por visita, o /auth/v1/user de 0,14 s para 1,2 s).
            `prefetch={false}` tirou o de viewport mas NÃO o de hover (log de
            24/09): passar o rato pelos filtros continuava a custar um render
            completo no servidor por botão. FilterButton navega só ao clique. */}
        <FilterButton
          href="/prices"
          active={!branch}
          className={`rounded-md border px-3 py-1 text-sm ${!branch ? 'border-primary bg-primary text-on-primary' : 'border-line-strong'}`}
        >
          All branches
        </FilterButton>
        {branches?.map((b) => (
          <FilterButton
            key={b.id}
            href={`/prices?branch=${b.id}`}
            active={branch === b.id}
            className={`rounded-md border px-3 py-1 text-sm ${branch === b.id ? 'border-primary bg-primary text-on-primary' : 'border-line-strong'}`}
          >
            {b.name}
          </FilterButton>
        ))}
        {channels?.map((c) => (
          <FilterButton
            key={c.id}
            href={`/prices?branch=${c.id}`}
            active={branch === c.id}
            className={`rounded-md border px-3 py-1 text-sm ${branch === c.id ? 'border-primary bg-primary text-on-primary' : 'border-line-strong'}`}
          >
            {c.name} (channel)
          </FilterButton>
        ))}
      </div>

      {canReadCosts && (
        <div className="mb-4 flex items-center gap-2 text-sm print:hidden">
          <span className="text-fg-muted">Status:</span>
          {(['active', 'draft', 'review', 'all'] as const).map((e) => (
            <FilterButton
              key={e}
              href={`/prices?${new URLSearchParams({ ...(branch ? { branch } : {}), status: e }).toString()}`}
              active={estadoPedido === e}
              className={`rounded-md border px-2 py-0.5 ${estadoPedido === e ? 'border-primary bg-primary text-on-primary' : 'border-line-strong'}`}
            >
              {e}
            </FilterButton>
          ))}
          <span className="text-fg-muted">
            ({visiveis.length} of {rows?.length ?? 0})
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger">
          {error.message}
        </p>
      )}

      {!error && visiveis.length === 0 && (
        <p className="text-sm text-fg-soft">No prices visible for your role in this scope.</p>
      )}

      {!error && visiveis.length > 0 && canReadCosts && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <PrintHeaderRow>{cabecalhoImpresso}</PrintHeaderRow>
            <tr className="border-b border-line text-left text-fg-muted">
              {COLS_COSTS.map((c) => (
                <th key={c.label} className={c.right ? 'py-2 pr-4 text-right' : 'py-2 pr-4'}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(visiveis as LinhaPreco[]).map((r) => (
              <tr
                key={`${r.product_id}-${r.branch_id}-${r.scope_type ?? 'b'}`}
                className="border-b border-line"
              >
                <td className="py-2 pr-4">
                  <span className="font-medium">{r.product_id}</span>
                  <span className="text-fg-soft"> — {nomeDe(r)}</span>
                </td>
                <td className="py-2 pr-4">{r.branch_id}</td>
                <td className="py-2 pr-4">
                  {estadoDe(r) === 'active' ? (
                    <span className="text-fg-muted">active</span>
                  ) : (
                    <span className="rounded bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning">
                      {estadoDe(r)}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">{r.currency}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{eur(r.total_cost_eur)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{pct(r.margin)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{eur(r.min_price)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{eur(r.ref_price)}</td>
                <td className="py-2 pr-4">{alertaDe(r.alert, r.item_type) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          {rodapeImpresso && (
            <tfoot>
              <PrintFooterRow>{rodapeImpresso}</PrintFooterRow>
            </tfoot>
          )}
        </table>
      )}

      {!error && visiveis.length > 0 && !canReadCosts && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <PrintHeaderRow>{cabecalhoImpresso}</PrintHeaderRow>
            <tr className="border-b border-line text-left text-fg-muted">
              {COLS_SALES.map((c) => (
                <th key={c.label} className={c.right ? 'py-2 pr-4 text-right' : 'py-2 pr-4'}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(visiveis as LinhaPreco[]).map((r) => (
              <tr key={`${r.product_id}-${r.branch_id}`} className="border-b border-line">
                <td className="py-2 pr-4">
                  <span className="font-medium">{r.product_id}</span>
                  <span className="text-fg-soft"> — {r.name}</span>
                </td>
                <td className="py-2 pr-4">{r.branch_id}</td>
                <td className="py-2 pr-4">{r.currency}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{eur(r.min_price)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{eur(r.ref_price)}</td>
                <td className="py-2 pr-4 text-right">{r.lead_time_days ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          {rodapeImpresso && (
            <tfoot>
              <PrintFooterRow>{rodapeImpresso}</PrintFooterRow>
            </tfoot>
          )}
        </table>
      )}
    </PrintScope>
  );
}
