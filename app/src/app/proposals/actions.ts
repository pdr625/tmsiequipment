/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { ActionState } from '@/lib/action-state';

export type ProposalActionState = ActionState;
export type BatchActionState = ActionState<{ result: unknown }>;

// The real gate is tmsi.decide_price_proposal() itself, which re-checks
// has_role('admin') or (branch_manager AND the proposal's own branch) INSIDE
// the function (0007, mirroring 0006's admin_revoke_sessions pattern) —
// this action does not re-implement that check, exactly like resetPassword
// defers to admin_revoke_sessions() rather than re-deriving has_role() here.
// A reason is optional for approval, required for rejection — enforced by
// the function itself, surfaced here as the raw Postgres error.
export async function decideProposal(_prevState: ProposalActionState, formData: FormData): Promise<ProposalActionState> {
  const proposalId = Number(formData.get('proposal_id') ?? 0);
  const decision = String(formData.get('decision') ?? '');
  const reasonRaw = String(formData.get('reason') ?? '');
  const reason = reasonRaw === '' ? null : reasonRaw;

  if (decision !== 'approved' && decision !== 'rejected') return { error: 'Invalid decision' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema('tmsi')
    .rpc('decide_price_proposal', { p_proposal_id: proposalId, p_decision: decision, p_reason: reason });

  if (error) return { error: error.message };

  revalidatePath('/proposals');
  revalidatePath('/config');
  revalidatePath('/overrides');
  return { success: true };
}

// item 44: mechanics only, same eligibility as decideProposal above —
// tmsi.decide_price_proposal_batch() re-checks per proposal itself
// (ineligible ones are excluded, visibly, never silently dropped and never
// failing the rest of the batch). Preview is dry-run (the 0013 shape,
// mirrors app/src/app/import/actions.ts) — nothing is written until the
// caller confirms the summary it returns.
export async function previewProposalBatch(_prevState: BatchActionState, formData: FormData): Promise<BatchActionState> {
  return runBatch(formData, true);
}

export async function decideProposalBatch(_prevState: BatchActionState, formData: FormData): Promise<BatchActionState> {
  return runBatch(formData, false);
}

async function runBatch(formData: FormData, dryRun: boolean): Promise<BatchActionState> {
  const idsRaw = String(formData.get('proposal_ids') ?? '[]');
  const decision = String(formData.get('decision') ?? '');
  const reasonRaw = String(formData.get('reason') ?? '');
  const reason = reasonRaw === '' ? null : reasonRaw;

  if (decision !== 'approved' && decision !== 'rejected') return { error: 'Invalid decision' };

  let ids: unknown;
  try {
    ids = JSON.parse(idsRaw);
  } catch {
    return { error: 'Selection was not read correctly — reselect and try again' };
  }
  if (!Array.isArray(ids) || ids.length === 0) return { error: 'Select at least one proposal' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('tmsi')
    .rpc('decide_price_proposal_batch', { p_proposal_ids: ids, p_decision: decision, p_reason: reason, p_dry_run: dryRun });
  if (error) return { error: error.message };

  if (!dryRun) {
    revalidatePath('/proposals');
    revalidatePath('/config');
    revalidatePath('/overrides');
  }
  return { success: true, result: data };
}
