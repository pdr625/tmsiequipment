/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import { ErrorText } from '@/lib/error-text';
import { decideProposal, type ProposalActionState } from './actions';

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
