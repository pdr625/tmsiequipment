/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { createSupabaseServerClient } from './supabase-server';
import type { ActionState } from './action-state';

export type ProposalTargetTable =
  | 'exchange_rates'
  | 'interco_fees'
  | 'transport_tiers'
  | 'customs_rates'
  | 'margin_grids'
  | 'price_overrides';

// Shared by every write path 0007 turned into a proposal (config/actions.ts,
// overrides/actions.ts) — tmsi.proposals_insert (RLS) is the real boundary,
// re-derived per target_table exactly as that policy is; this only avoids
// six near-identical inserts. Never trusts a caller-supplied proposed_by —
// always the session's own id, matching what the RLS check itself compares
// against (proposed_by = auth.uid()).
export async function proposeChange(
  targetTable: ProposalTargetTable,
  branchId: string | null,
  payload: Record<string, unknown>,
  reason: string,
): Promise<ActionState> {
  if (reason.trim() === '') return { error: 'A reason is required to propose a change' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.schema('tmsi').from('price_proposals').insert({
    target_table: targetTable,
    branch_id: branchId,
    payload,
    reason,
    proposed_by: user.id,
  });

  if (error) return { error: error.message };
  return { success: true };
}
