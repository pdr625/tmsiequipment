/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isAdmin, canManageProducts } from '@/lib/auth-guard';
import { HsDutyImportPanel, ProductsImportPanel, UndoBatchForm } from './forms';

type Batch = {
  id: string;
  kind: string;
  source_filename: string | null;
  reason: string;
  row_count: number;
  status: string;
  created_at: string;
  reverted_at: string | null;
};

// Item 39. HS/duty import is admin-only (tmsi.run_import_hs_duty() checks
// this itself — restriction 7, RLS/role boundary is the real gate, this
// page-level check only avoids a wasted round trip). Products import
// follows canManageProducts() — same admin-or-product_manager boundary
// products/new already uses, since this ultimately writes the same table.
export default async function ImportPage() {
  const admin = await isAdmin();
  const canProducts = await canManageProducts();
  if (!admin && !canProducts) redirect('/');

  const supabase = await createSupabaseServerClient();
  const { data: batches } = admin
    ? await supabase
        .schema('tmsi')
        .from('import_batches')
        .select('id, kind, source_filename, reason, row_count, status, created_at, reverted_at')
        .order('created_at', { ascending: false })
        .limit(20)
        .overrideTypes<Batch[], { merge: false }>()
    : { data: null };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Importação em massa</h1>
        <Link href="/" className="text-sm text-gray-600 underline">
          Back
        </Link>
      </div>
      <p className="mb-6 text-sm text-gray-600">
        Carregamento inicial — escreve directo, fora do workflow de propor/aprovar (decisão
        registada em <code>docs/STATE.md</code>). Pré-visualiza sempre antes de gravar; nada é
        escrito sem confirmação deliberada.
      </p>

      {admin && <HsDutyImportPanel />}
      {canProducts && <ProductsImportPanel />}

      {admin && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Lotes recentes</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Quando</th>
                <th className="py-2 pr-4">Tipo</th>
                <th className="py-2 pr-4">Ficheiro</th>
                <th className="py-2 pr-4">Linhas</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {batches?.map((b) => (
                <tr key={b.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-4">{b.kind}</td>
                  <td className="py-2 pr-4">{b.source_filename ?? '—'}</td>
                  <td className="py-2 pr-4">{b.row_count}</td>
                  <td className="py-2 pr-4">{b.status}</td>
                  <td className="py-2 pr-4">{b.status === 'committed' && <UndoBatchForm batchId={b.id} />}</td>
                </tr>
              ))}
              {(!batches || batches.length === 0) && (
                <tr>
                  <td colSpan={6} className="py-2 text-gray-500">
                    Nenhum lote ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
