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
