/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getBranding, footerLines } from '@/lib/branding';
import { PrintButton } from './print-button';

type Branch = { id: string; name: string };
type Channel = { id: string; name: string };

// Which view a user gets (full costs vs selling-price-only) is a security
// decision, not a UI one — the page asks Postgres (tmsi.can_read_costs(),
// the same predicate compute_price() itself uses) rather than
// re-implementing the role check here. Whatever it answers, RLS on the
// underlying tables still scopes which *rows* come back — this is a
// convenience choice of view, not the actual access control.
type MetaProduto = { id: string; name: string; category_id: string | null; status: string };

// A forma que as duas vistas têm em comum, mais o que cada uma acrescenta. O
// ecrã trata as linhas por esta forma e faz o estreitamento onde precisa.
type LinhaQualquer = {
  product_id: string;
  branch_id: string;
  name?: string;
  category_id?: string | null;
  status?: string;
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
// decision, not a UI one — the page asks Postgres (tmsi.can_read_costs(),
// the same predicate compute_price() itself uses) rather than
// re-implementing the role check here. Whatever it answers, RLS on the
// underlying tables still scopes which *rows* come back — this is a
// convenience choice of view, not the actual access control.
  //
  // `can_read_costs` decide QUAL vista se lê, logo é o único await que tem
  // mesmo de vir antes dos outros. Até 2026-09-23 os seis awaits desta página
  // estavam todos em cadeia — medido no log de timing: 0,51 s de espera
  // sequencial numa página de 0,91 s, com a consulta de preços a valer só
  // 0,165 s. O resto vai agora em paralelo.
  const { data: canReadCosts } = await supabase.schema('tmsi').rpc('can_read_costs');
  const viewName = canReadCosts ? 'v_branch_prices' : 'v_selling_prices';

  // item 72: só as colunas que o ecrã mostra. `select('*')` trazia ~20 colunas
  // por linha — em "All branches" são 283 linhas × 20 valores serializados
  // pelo PostgREST para o ecrã usar oito. Não muda o custo de cálculo (esse é
  // o item 69, resolvido pela 0020); muda o que atravessa a rede.
  const COLUNAS_CUSTO = 'product_id, branch_id, scope_type, currency, total_cost_eur, margin, min_price, ref_price, alert';
  const COLUNAS_VENDA = 'product_id, name, category_id, status, branch_id, currency, min_price, ref_price, lead_time_days';

  // A lista de colunas é escolhida em tempo de execução, logo o postgrest-js
  // não consegue derivar o tipo do resultado a partir dela (deriva-o da
  // string literal do `.select()`). O tipo é declarado aqui, uma vez, e a
  // promessa é tipada à mão — sem isto a inferência colapsa num union que
  // depois falha em cada uso.
  const precos = (() => {
    let q = supabase.schema('tmsi').from(viewName).select(canReadCosts ? COLUNAS_CUSTO : COLUNAS_VENDA);
    if (branch) {
      q = q.eq('branch_id', branch);
    }
    return q as unknown as PromiseLike<{ data: LinhaPreco[] | null; error: { message: string } | null }>;
  })();

  // A vista de custos não traz nome, categoria nem estado — só `product_id`.
  // Para o papel de custos vai-se buscá-los a `v_products` numa leitura à
  // parte (tabela + RLS, sem compute_price: é barata) e cruzam-se em memória.
  // A alternativa era acrescentar colunas à vista, e isso é migração.
  const catalogo: PromiseLike<{ data: MetaProduto[] | null }> = canReadCosts
    ? (supabase.schema('tmsi').from('v_products').select('id, name, category_id, status') as unknown as PromiseLike<{
        data: MetaProduto[] | null;
      }>)
    : Promise.resolve({ data: null });

  const [{ data: rows, error }, catalogoRes, { data: branches }, { data: channels }, userRes] =
    await Promise.all([
      precos,
      catalogo,
      supabase.schema('tmsi').from('branches').select('id, name').eq('active', true).order('id')
        .overrideTypes<Branch[], { merge: false }>(),
      // 0009: channels get their own filter row, never mixed into "branches" —
      // a channel is a distinct pricing scope (v_branch_prices/v_selling_prices
      // union branch and channel rows, docs/MODEL-GAP-ANALYSIS.md items 5/6),
      // not a filial with a different name.
      supabase.schema('tmsi').from('channels').select('id, name').eq('active', true).order('id')
        .overrideTypes<Channel[], { merge: false }>(),
      // O nome vem de tmsi.profiles (o user_metadata do GoTrue não o tem).
      // Encadeado aqui dentro de propósito: as duas chamadas somam ~0,145 s e
      // correm em paralelo com a consulta de preços (0,165 s), logo não
      // custam relógio nenhum. `.eq(user_id)` e não `.limit(1)` porque a
      // política profiles_self devolve TODAS as linhas a um admin.
      supabase.auth.getUser().then(async (res) => {
        const u = res.data.user;
        if (!u) return null;
        const { data } = await supabase
          .schema('tmsi')
          .from('profiles')
          .select('full_name')
          .eq('user_id', u.id)
          .maybeSingle();
        return (data as { full_name: string | null } | null)?.full_name ?? null;
      }),
    ]);
  const geradoPor = userRes ?? '—';

  const meta = new Map<string, MetaProduto>(
    (catalogoRes.data ?? []).map((p) => [p.id, p]),
  );

  // Ordem de apresentação: categoria -> código -> âmbito. O âmbito não é
  // alfabético — é a ordem comercial das filiais, com os canais no fim, para
  // a lista ler como a folha do Excel de onde veio.
  const ORDEM_AMBITO = ['SA', 'TBM', 'CORP', 'LTD'];
  const pesoAmbito = (id: string) => {
    const i = ORDEM_AMBITO.indexOf(id);
    return i === -1 ? ORDEM_AMBITO.length : i;   // canal (ou filial nova): depois
  };
  const nomeDe = (r: LinhaQualquer) =>
    ('name' in r && r.name) || meta.get(r.product_id)?.name || '';
  const categoriaDe = (r: LinhaQualquer) =>
    ('category_id' in r && r.category_id) || meta.get(r.product_id)?.category_id || '\uffff';
  const estadoDe = (r: LinhaQualquer) =>
    ('status' in r && r.status) || meta.get(r.product_id)?.status || 'active';

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
  const branding = await getBranding();
  const footer = footerLines(branding);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 hidden print:block" style={{ fontFamily: branding.fontFamily }}>
        {branding.logoId !== null && (
          <img src="/api/branding/logo" alt="" className="mb-2 h-10 w-auto" />
        )}
        <h1 className="text-lg font-bold" style={{ color: branding.primaryColor }}>
          {branding.displayName} — Price list
        </h1>
        {branding.tagline !== '' && <p className="text-sm text-gray-600">{branding.tagline}</p>}
        <p className="text-sm">Scope: {rotuloAmbito}</p>
        <p className="text-sm">Currency: {currencies.join(', ') || '—'}</p>
        <p className="text-sm">
          Generated: {generatedAt.toISOString()} by {geradoPor}
        </p>
      </div>

      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Price list</h1>
        <div className="flex items-center gap-4">
          <a
            href={branch ? `/prices/export?branch=${branch}` : '/prices/export'}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium"
          >
            Export to Excel
          </a>
          <PrintButton />
          <Link href="/" prefetch={false} className="text-sm text-gray-600 underline">
            Back
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        {/* prefetch={false}: medido a 23/09 no log de timing do nginx — cada
            <Link> destes era pré-carregado pelo Next.js assim que entrava no
            ecrã, e cada pré-carregamento é um render completo no servidor com
            o seu próprio /auth/v1/user + profiles + branding. Quatro links =
            12 pedidos extra por visita, todos a bater no GoTrue ao mesmo
            tempo: o /auth/v1/user passava de 0,14 s para 1,2 s por fila de
            espera. São links de filtro, clicados um de cada vez — não há nada
            a ganhar em pré-carregá-los todos. */}
        <Link
          href="/prices"
          prefetch={false}
          className={`rounded-md border px-3 py-1 text-sm ${!branch ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'}`}
        >
          All branches
        </Link>
        {branches?.map((b) => (
          <Link
            key={b.id}
            href={`/prices?branch=${b.id}`}
            prefetch={false}
            className={`rounded-md border px-3 py-1 text-sm ${branch === b.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'}`}
          >
            {b.name}
          </Link>
        ))}
        {channels?.map((c) => (
          <Link
            key={c.id}
            href={`/prices?branch=${c.id}`}
            prefetch={false}
            className={`rounded-md border px-3 py-1 text-sm ${branch === c.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'}`}
          >
            {c.name} (channel)
          </Link>
        ))}
      </div>

      {canReadCosts && (
        <div className="mb-4 flex items-center gap-2 text-sm print:hidden">
          <span className="text-gray-500">Status:</span>
          {(['active', 'draft', 'review', 'all'] as const).map((e) => (
            <Link
              key={e}
              href={`/prices?${new URLSearchParams({ ...(branch ? { branch } : {}), status: e }).toString()}`}
              prefetch={false}
              className={`rounded-md border px-2 py-0.5 ${estadoPedido === e ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'}`}
            >
              {e}
            </Link>
          ))}
          <span className="text-gray-400">
            ({visiveis.length} of {rows?.length ?? 0})
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {!error && visiveis.length === 0 && (
        <p className="text-sm text-gray-600">No prices visible for your role in this scope.</p>
      )}

      {!error && visiveis.length > 0 && canReadCosts && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">Scope</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Currency</th>
              <th className="py-2 pr-4 text-right">Total cost (EUR)</th>
              <th className="py-2 pr-4 text-right">Margin</th>
              <th className="py-2 pr-4 text-right">Min price</th>
              <th className="py-2 pr-4 text-right">Ref price</th>
              <th className="py-2 pr-4">Alert</th>
            </tr>
          </thead>
          <tbody>
            {(visiveis as LinhaPreco[]).map((r) => (
              <tr
                key={`${r.product_id}-${r.branch_id}-${r.scope_type ?? 'b'}`}
                className="border-b border-gray-100"
              >
                <td className="py-2 pr-4">
                  <span className="font-medium">{r.product_id}</span>
                  <span className="text-gray-600"> — {nomeDe(r)}</span>
                </td>
                <td className="py-2 pr-4">{r.branch_id}</td>
                <td className="py-2 pr-4">
                  {estadoDe(r) === 'active' ? (
                    <span className="text-gray-500">active</span>
                  ) : (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                      {estadoDe(r)}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">{r.currency}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{eur(r.total_cost_eur)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{pct(r.margin)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{eur(r.min_price)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{eur(r.ref_price)}</td>
                <td className="py-2 pr-4">{r.alert ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!error && visiveis.length > 0 && !canReadCosts && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">Scope</th>
              <th className="py-2 pr-4">Currency</th>
              <th className="py-2 pr-4 text-right">Min price</th>
              <th className="py-2 pr-4 text-right">Ref price</th>
              <th className="py-2 pr-4 text-right">Lead time (days)</th>
            </tr>
          </thead>
          <tbody>
            {(visiveis as LinhaPreco[]).map((r) => (
              <tr key={`${r.product_id}-${r.branch_id}`} className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <span className="font-medium">{r.product_id}</span>
                  <span className="text-gray-600"> — {r.name}</span>
                </td>
                <td className="py-2 pr-4">{r.branch_id}</td>
                <td className="py-2 pr-4">{r.currency}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{eur(r.min_price)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{eur(r.ref_price)}</td>
                <td className="py-2 pr-4 text-right">{r.lead_time_days ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {footer.length > 0 && (
        <div className="mt-6 hidden text-xs text-gray-500 print:block" style={{ fontFamily: branding.fontFamily }}>
          {footer.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
