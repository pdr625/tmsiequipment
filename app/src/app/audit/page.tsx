/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { canReadAuditLog } from '@/lib/auth-guard';

type AuditEntry = {
  id: number;
  at: string;
  actor: string | null;
  table_name: string;
  row_pk: string;
  action: string;
};
type Profile = { user_id: string; email: string | null };

// tmsi.audit_log is audited by nothing but itself — append-only by
// nature (0001 §5: only the security-definer tmsi.audit() trigger ever
// writes it). This page issues no write of any kind, not even a "clear"
// — restriction 4 of the prompt. Page-level gate mirrors audit_read
// (RLS) exactly: admin/finance/viewer/branch_manager, notably not
// product_manager or logistics even though both write products/
// overrides — real boundary is the RLS itself, this redirect is only
// convenience so a role with zero read access doesn't land on an empty
// shell.
const TABLES = [
  'products',
  'price_overrides',
  'product_hs_overrides',
  'exchange_rates',
  'interco_fees',
  'transport_tiers',
  'customs_rates',
  'margin_grids',
  'price_proposals',
  'settings',
  'branches',
  'channels',
];
const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; actor?: string; from?: string; to?: string; page?: string }>;
}) {
  if (!(await canReadAuditLog())) {
    redirect('/');
  }

  const { table, actor, from, to, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? '1') || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createSupabaseServerClient();

  let query = supabase.schema('tmsi').from('audit_log').select('id, at, actor, table_name, row_pk, action');
  if (table) query = query.eq('table_name', table);
  if (actor) query = query.eq('actor', actor);
  if (from) query = query.gte('at', from);
  if (to) query = query.lte('at', to);

  const [{ data: entries, error }, { data: profiles }] = await Promise.all([
    query
      .order('at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
      .overrideTypes<AuditEntry[], { merge: false }>(),
    // RLS-scoped like everything else: admin sees every profile
    // (profiles_admin, 0001 §8), anyone else only their own
    // (profiles_self) — actor emails resolve for whoever the caller can
    // legitimately see, raw UUID shown otherwise. Never a role check here.
    supabase.schema('tmsi').from('profiles').select('user_id, email').overrideTypes<Profile[], { merge: false }>(),
  ]);

  const actorEmail = (id: string | null) => (id ? (profiles?.find((p) => p.user_id === id)?.email ?? id) : '—');

  const qs = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { table, actor, from, to, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    return `?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <Link href="/" className="text-sm text-gray-600 underline">
          Back
        </Link>
      </div>
      <p className="mb-4 text-xs text-gray-500">Read-only. Per-item audit is also on each product&apos;s own page.</p>

      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 p-3 text-sm">
        <div>
          <label className="mb-1 block text-xs text-gray-500">Table</label>
          <select name="table" defaultValue={table ?? ''} className="rounded-md border border-gray-300 px-2 py-1 text-sm">
            <option value="">All</option>
            {TABLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Actor (UUID)</label>
          <input
            name="actor"
            defaultValue={actor ?? ''}
            className="w-56 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">From</label>
          <input name="from" type="date" defaultValue={from ?? ''} className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">To</label>
          <input name="to" type="date" defaultValue={to ?? ''} className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white">
          Filter
        </button>
        {(table || actor || from || to) && (
          <Link href="/audit" className="text-xs text-gray-600 underline">
            Clear
          </Link>
        )}
      </form>

      {error && (
        <p role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {!error && entries?.length === 0 && <p className="text-sm text-gray-500">No entries match.</p>}

      {!error && entries && entries.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">At</th>
              <th className="py-2 pr-4">Actor</th>
              <th className="py-2 pr-4">Table</th>
              <th className="py-2 pr-4">Row</th>
              <th className="py-2 pr-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">{new Date(e.at).toLocaleString()}</td>
                <td className="py-2 pr-4">{actorEmail(e.actor)}</td>
                <td className="py-2 pr-4">{e.table_name}</td>
                <td className="py-2 pr-4">{e.row_pk}</td>
                <td className="py-2 pr-4">{e.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 flex items-center gap-4 text-sm">
        {page > 1 && (
          <Link href={qs({ page: String(page - 1) })} className="underline">
            ← Previous
          </Link>
        )}
        <span className="text-gray-500">Page {page}</span>
        {entries && entries.length === PAGE_SIZE && (
          <Link href={qs({ page: String(page + 1) })} className="underline">
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}
