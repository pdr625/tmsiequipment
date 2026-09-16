/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState, useState } from 'react';
import { ErrorText } from '@/lib/error-text';
import { decideProposal, previewProposalBatch, decideProposalBatch, type ProposalActionState, type BatchActionState } from './actions';

// Same "detached form + form=<id> attribute" technique as config/forms.tsx
// (see the comment there): an empty <form> carries the hidden proposal_id,
// and the reason input plus both submit buttons live outside it, wired in
// via `form={formId}`. A submit button's own name/value pair (here,
// decision=approved|rejected) is included in the submission of the form it
// points to via `form=`, regardless of DOM nesting — standard HTML forms
// behaviour, not something specific to this component.
export function DecideProposalForm({ proposalId }: { proposalId: number }) {
  const [state, formAction, pending] = useActionState<ProposalActionState, FormData>(decideProposal, undefined);
  const formId = `decide-${proposalId}`;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <form id={formId} action={formAction}>
        <input type="hidden" name="proposal_id" value={proposalId} />
      </form>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Reason (required to reject)</label>
        <input form={formId} name="reason" className="w-56 rounded-md border border-gray-300 px-2 py-1 text-sm" />
      </div>
      <button
        form={formId}
        type="submit"
        name="decision"
        value="approved"
        disabled={pending}
        className="rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? '…' : 'Approve'}
      </button>
      <button
        form={formId}
        type="submit"
        name="decision"
        value="rejected"
        disabled={pending}
        className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium disabled:opacity-50"
      >
        {pending ? '…' : 'Reject'}
      </button>
      <ErrorText state={state} />
      {state && 'success' in state && <p className="text-xs text-green-700">Decision recorded.</p>}
    </div>
  );
}

// item 44: a proposal's data comes pre-formatted from the server component
// (payload display text, proposer label) — functions like formatPayload()
// can't cross the server/client boundary as props, only plain data, so
// page.tsx computes these once and passes the finished strings down.
export type PendingItem = {
  id: number;
  targetTable: string;
  branchId: string | null;
  displayText: string;
  reason: string;
  proposedByLabel: string;
  proposedAt: string;
  canDecide: boolean;
};

const STATUS_PENDING_STYLE = 'bg-yellow-100 text-yellow-800';

type BatchChange = { id: number; target_table: string; key: string | null; before: number | null; after: number | null; reason: string };
type BatchExcluded = { id: number; reason: string; target_table?: string; branch_id?: string | null };
type BatchResult = {
  ok: boolean;
  dry_run: boolean;
  eligible_count?: number;
  decided_count?: number;
  excluded_count: number;
  excluded: BatchExcluded[];
  changes?: BatchChange[];
  batch_id?: string;
};

function fmtValue(v: number | null): string {
  return v === null || v === undefined ? '— (none in effect)' : String(v);
}

// tmsi.decide_price_proposal_batch() is dry-run by default (restriction:
// legibility before commit, item 44 §1) — this component never lets a
// commit happen without first showing a preview response for the exact
// same ids/decision the commit is about to send. Renders the FULL pending
// queue (not a second, shorter list alongside it) — a checkbox on each
// decidable row, the single-decide form untouched next to it, so nothing
// about a proposal is shown twice.
export function PendingQueue({ items }: { items: PendingItem[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [reason, setReason] = useState('');
  const [previewState, previewAction, previewPending] = useActionState<BatchActionState, FormData>(previewProposalBatch, undefined);
  const [commitState, commitAction, commitPending] = useActionState<BatchActionState, FormData>(decideProposalBatch, undefined);

  const decidable = items.filter((i) => i.canDecide);
  const preview = previewState && 'success' in previewState ? (previewState.result as BatchResult) : null;
  const committed = commitState && 'success' in commitState ? (commitState.result as BatchResult) : null;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startPreview(d: 'approved' | 'rejected') {
    setDecision(d);
    const fd = new FormData();
    fd.set('proposal_ids', JSON.stringify(Array.from(selected)));
    fd.set('decision', d);
    fd.set('reason', reason);
    previewAction(fd);
  }

  function confirmCommit() {
    if (!decision) return;
    const fd = new FormData();
    fd.set('proposal_ids', JSON.stringify(Array.from(selected)));
    fd.set('decision', decision);
    fd.set('reason', reason);
    commitAction(fd);
    setSelected(new Set());
  }

  return (
    <>
      <ul className="mb-3 space-y-3">
        {items.map((i) => (
          <li key={i.id} className="rounded-lg border border-gray-200 p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {i.canDecide && (
                <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Select proposal ${i.id}`} />
              )}
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium">{i.targetTable}</span>
              {i.branchId && <span className="text-xs text-gray-500">branch {i.branchId}</span>}
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_PENDING_STYLE}`}>pending approval</span>
            </div>
            <p className="mb-1 text-sm">{i.displayText}</p>
            <p className="mb-2 text-xs text-gray-500">
              Reason: {i.reason} — proposed by {i.proposedByLabel} on {i.proposedAt.slice(0, 10)}
            </p>
            {i.canDecide ? (
              <DecideProposalForm proposalId={i.id} />
            ) : (
              <p className="text-xs text-gray-400">
                Waiting for {i.branchId ? `the ${i.branchId} branch manager or an admin` : 'an admin'} to decide.
              </p>
            )}
          </li>
        ))}
      </ul>

      {decidable.length === 0 ? null : (
      <div className="mb-4 rounded-lg border border-gray-300 bg-gray-50 p-3">
      <p className="mb-2 text-xs font-semibold text-gray-700">Batch decision — check the rows above, then preview before deciding</p>
      <div className="flex flex-wrap items-end gap-2">
        <span className="text-xs text-gray-600">{selected.size} selected</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required to reject)"
          className="w-56 rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          disabled={selected.size === 0 || previewPending}
          onClick={() => startPreview('approved')}
          className="rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        >
          {previewPending && decision === 'approved' ? '…' : 'Preview approve'}
        </button>
        <button
          type="button"
          disabled={selected.size === 0 || previewPending}
          onClick={() => startPreview('rejected')}
          className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium disabled:opacity-50"
        >
          {previewPending && decision === 'rejected' ? '…' : 'Preview reject'}
        </button>
      </div>
      <ErrorText state={previewState} />

      {preview && !committed && (
        <div className="mt-3 rounded-md border border-gray-300 bg-white p-3">
          <p className="mb-2 text-xs font-semibold">
            Preview — {decision}: {preview.eligible_count} will be decided, {preview.excluded_count} excluded
          </p>
          {(preview.changes?.length ?? 0) > 0 && (
            <table className="mb-2 w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-1 pr-3">Target</th>
                  <th className="py-1 pr-3">Key</th>
                  <th className="py-1 pr-3">Before</th>
                  <th className="py-1 pr-3">After</th>
                </tr>
              </thead>
              <tbody>
                {preview.changes!.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="py-1 pr-3">{c.target_table}</td>
                    <td className="py-1 pr-3">{c.key}</td>
                    <td className="py-1 pr-3">{fmtValue(c.before)}</td>
                    <td className="py-1 pr-3 font-medium">{fmtValue(c.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview.excluded.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-xs font-semibold text-amber-700">Excluded — not part of this batch</p>
              <ul className="space-y-0.5 text-xs text-amber-700">
                {preview.excluded.map((e) => (
                  <li key={e.id}>
                    #{e.id} {e.target_table && `(${e.target_table}${e.branch_id ? `, ${e.branch_id}` : ''})`}: {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            disabled={commitPending || (decision === 'rejected' && reason.trim() === '')}
            onClick={confirmCommit}
            className="rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          >
            {commitPending ? '…' : `Confirm — ${decision} ${preview.eligible_count}`}
          </button>
        </div>
      )}
      <ErrorText state={commitState} />
      {committed && (
        <p className="mt-2 text-xs text-green-700">
          Batch decided — {committed.decided_count} proposals ({committed.batch_id}), {committed.excluded_count} excluded.
        </p>
      )}
      </div>
      )}
    </>
  );
}
