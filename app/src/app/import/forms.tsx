/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState, useState } from 'react';
import { parseCsv } from '@/lib/parse-csv';
import { previewHsDuty, commitHsDuty, previewProducts, commitProducts, undoBatch, type ImportActionState } from './actions';

// Item 39, restriction 2: dry-run is the default behaviour — the first
// button always previews, never writes. Writing needs the second,
// deliberate step below, only enabled once a preview has actually
// succeeded (never just because a file was chosen).
function ImportPanel({
  title,
  hint,
  previewAction,
  commitAction,
}: {
  title: string;
  hint: string;
  previewAction: (prevState: ImportActionState, formData: FormData) => Promise<ImportActionState>;
  commitAction: (prevState: ImportActionState, formData: FormData) => Promise<ImportActionState>;
}) {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [filename, setFilename] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewState, previewFormAction, previewPending] = useActionState<ImportActionState, FormData>(previewAction, undefined);
  const [commitState, commitFormAction, commitPending] = useActionState<ImportActionState, FormData>(commitAction, undefined);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    if ('error' in parsed) {
      setParseError(parsed.error);
      setRows(null);
    } else {
      setParseError(null);
      setRows(parsed.rows);
    }
  }

  const previewOk = previewState && 'success' in previewState
    && (previewState.result as { ok?: boolean } | undefined)?.ok === true;
  const previewErrors = previewState && 'success' in previewState
    ? (previewState.result as { ok: boolean; errors?: { row: number; column: string; reason: string }[] }).errors
    : undefined;

  return (
    <section className="mb-10 rounded-lg border border-gray-200 p-4">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{title}</h2>
      <p className="mb-3 text-xs text-gray-500">{hint}</p>

      <input type="file" accept=".csv,text/csv" onChange={onFile} className="mb-3 block text-sm" />
      {parseError && <p role="alert" className="mb-3 text-sm text-red-600">{parseError}</p>}
      {rows && <p className="mb-3 text-xs text-gray-500">{rows.length} linhas lidas de {filename}.</p>}

      {rows && (
        <form action={previewFormAction} className="mb-3">
          <input type="hidden" name="rows" value={JSON.stringify(rows)} />
          <input type="hidden" name="filename" value={filename} />
          <button
            type="submit"
            disabled={previewPending}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {previewPending ? 'A validar…' : 'Pré-visualizar (não grava nada)'}
          </button>
        </form>
      )}

      {previewState && 'error' in previewState && (
        <p role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">{previewState.error}</p>
      )}

      {previewErrors && previewErrors.length > 0 && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <p className="mb-1 font-medium">Ficheiro rejeitado — nada foi gravado ({previewErrors.length} erro(s)):</p>
          <ul className="list-disc pl-5">
            {previewErrors.map((e, i) => (
              <li key={i}>linha {e.row}, coluna <code>{e.column}</code>: {e.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {previewOk && (
        <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
          <p className="font-medium">Pré-visualização:</p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(previewState && 'success' in previewState ? previewState.result : null, null, 2)}</pre>
        </div>
      )}

      {previewOk && rows && (
        <form action={commitFormAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="rows" value={JSON.stringify(rows)} />
          <input type="hidden" name="filename" value={filename} />
          <div className="flex-1">
            <label className="mb-1 block text-xs text-gray-500">Motivo (obrigatório para gravar)</label>
            <input name="reason" required placeholder="Ex.: carregamento inicial dos direitos aduaneiros" className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm" />
          </div>
          <button
            type="submit"
            disabled={commitPending}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {commitPending ? 'A gravar…' : 'Confirmar gravação'}
          </button>
        </form>
      )}

      {commitState && 'error' in commitState && (
        <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">{commitState.error}</p>
      )}
      {commitState && 'success' in commitState && (
        <div className="mt-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <p className="font-medium">Gravado.</p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(commitState.result, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}

export function HsDutyImportPanel() {
  return (
    <ImportPanel
      title="Códigos HS + direitos aduaneiros"
      hint="Colunas: hs_code;description;rate (uma linha por código, a taxa aplica-se às 4 zonas por igual)."
      previewAction={previewHsDuty}
      commitAction={commitHsDuty}
    />
  );
}

export function ProductsImportPanel() {
  return (
    <ImportPanel
      title="Artigos + configuração (transporte, margem)"
      hint="Mesmo formato da amostra de paridade — uma linha por artigo×âmbito. Ver docs/IMPORT.md para o contrato completo de colunas."
      previewAction={previewProducts}
      commitAction={commitProducts}
    />
  );
}

export function UndoBatchForm({ batchId }: { batchId: string }) {
  const [state, formAction, pending] = useActionState<ImportActionState, FormData>(undoBatch, undefined);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="batch_id" value={batchId} />
      <input name="reason" required placeholder="Motivo" className="w-40 rounded-md border border-gray-300 px-2 py-1 text-xs" />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
      >
        {pending ? '…' : 'Desfazer'}
      </button>
      {state && 'error' in state && <span className="text-xs text-red-600">{state.error}</span>}
      {state && 'success' in state && <span className="text-xs text-green-700">Desfeito.</span>}
    </form>
  );
}
