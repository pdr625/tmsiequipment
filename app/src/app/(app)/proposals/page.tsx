/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getMe } from '@/lib/me';
import { isAdmin, isBranchManager } from '@/lib/perms';
import { PendingQueue, type PendingItem } from './forms';

type Proposal = {
  id: number;
  target_table: string;
  branch_id: string | null;
  payload: Record<string, unknown>;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  proposed_by: string;
  proposed_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
};
type Profile = { user_id: string; email: string | null };

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-warning-soft text-warning',
  approved: 'bg-success-soft text-success',
  rejected: 'bg-danger-soft text-danger',
};

// payload is a free-form jsonb blob (one shape per target_table, see 0007
// §4) — this only formats it for display, it is never re-parsed back into
// a write; tmsi.decide_price_proposal() does that itself, server-side.
function formatPayload(p: Proposal): string {
  const v = p.payload;
  const f = (k: string, fallback = '') => (v[k] === null || v[k] === undefined ? fallback : String(v[k]));
  switch (p.target_table) {
    case 'exchange_rates':
      return `${f('currency')} = ${f('rate_per_eur')} EUR, effective ${f('effective_date')} (${f('source')})`;
    case 'interco_fees':
      return `${f('supplier_branch')} → ${f('seller_branch')}: fee ${f('fee')}`;
    case 'transport_tiers':
      return `${f('branch_id')} tier ${f('tier')}: max ${f('max_weight_kg', 'open-ended')} kg, cost ${f('cost')} ${f('currency')}`;
    case 'customs_rates':
      return `${f('hs_code')} / ${f('zone')}: rate ${f('rate')}`;
    case 'margin_grids':
      return `${f('branch_id')} tier ${f('tier')}: max cost ${f('max_cost_eur', 'open-ended')} EUR, margin ${f('margin')}`;
    case 'price_overrides':
      // 0009: payload carries scope_type/scope_id, not a bare branch_id
      // (a channel-scoped override has no branch at all) — this case was
      // missed when that migration's own app code was updated; caught and
      // fixed here, not left stale.
      return `product ${f('product_id')}, ${f('scope_type', 'branch')}:${f('scope_id')}, ${f('kind')} = ${f('value')} (${f('valid_from')} → ${f('valid_to', 'open')})`;
    case 'branch_pricing_params':
      return `${f('branch_id')}: ref_factor ${f('ref_factor')}, list_coef ${f('list_coef')}`;
    case 'currency_rounding_params':
      return `${f('currency')}: round to ${f('rounding')}, effective ${f('effective_date')}`;
    default:
      return JSON.stringify(v);
  }
}

// Visibility is entirely tmsi.proposals_read (RLS, 0007): the broadly
// cost-visible roles see everything, branch_manager only their own branch's
// proposals, and anyone always sees their own — no page-level redirect the
// way /config and /audit have one, since there is no role with genuinely
// zero rows to see here (a proposer with no other read access still sees
// what they themselves proposed). Approve/Reject rendering below is
// convenience only: tmsi.decide_price_proposal() re-checks eligibility
// itself and does not depend on this page hiding the buttons correctly.
export default async function ProposalsPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: proposals }, { data: profiles }, me] = await Promise.all([
    supabase
      .schema('tmsi')
      .from('price_proposals')
      .select(
        'id, target_table, branch_id, payload, reason, status, proposed_by, proposed_at, decided_by, decided_at, decision_reason',
      )
      .order('proposed_at', { ascending: false })
      .limit(200)
      .overrideTypes<Proposal[], { merge: false }>(),
    // RLS-scoped like the audit page's own lookup: admin sees every
    // profile, anyone else only their own — raw UUID shown otherwise.
    supabase.schema('tmsi').from('profiles').select('user_id, email').overrideTypes<Profile[], { merge: false }>(),
    getMe(),
  ]);
  // Eram três pedidos próprios (has_role admin, has_role branch_manager, my_branches): o me() já traz
  // os papéis e as filiais (tmsi.my_branches()), partilhado com o layout.
  const admin = isAdmin(me);
  const isBm = isBranchManager(me);
  const myBranches = me?.branches ?? [];

  const userLabel = (id: string | null) => (id ? (profiles?.find((p) => p.user_id === id)?.email ?? id) : '—');
  const branches: string[] = Array.isArray(myBranches) ? myBranches : [];
  const canDecide = (branchId: string | null) => admin || (isBm === true && branchId !== null && branches.includes(branchId));

  const pending = proposals?.filter((p) => p.status === 'pending') ?? [];
  const decided = proposals?.filter((p) => p.status !== 'pending') ?? [];

  // item 44: plain, pre-formatted data for the client-side batch panel —
  // functions (formatPayload, userLabel) can't cross the server/client
  // boundary as props, so the finished display strings are computed once,
  // here, server-side, same source of truth the per-row rendering below
  // already uses.
  const pendingItems: PendingItem[] = pending.map((p) => ({
    id: p.id,
    targetTable: p.target_table,
    branchId: p.branch_id,
    displayText: formatPayload(p),
    reason: p.reason,
    proposedByLabel: userLabel(p.proposed_by),
    proposedAt: p.proposed_at,
    canDecide: canDecide(p.branch_id),
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Proposals</h1>
      </div>
      <p className="mb-6 text-xs text-fg-muted">
        Changes to published prices go through here before they take effect. Approve or reject
        with a reason — approving materialises the change as a new, append-only entry, it never
        edits history; rejecting leaves the current value untouched.
      </p>

      <section className="mb-10">
        <h2 className="mb-2 text-base font-semibold tracking-tight text-fg">Pending ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-fg-muted">Nothing pending.</p>}
        <PendingQueue items={pendingItems} />
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold tracking-tight text-fg">Decided (most recent 200)</h2>
        {decided.length === 0 && <p className="text-sm text-fg-muted">No decisions yet.</p>}
        {decided.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-fg-muted">
                <th className="py-2 pr-4">Target</th>
                <th className="py-2 pr-4">Change</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Decided by</th>
                <th className="py-2 pr-4">Decision reason</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((p) => (
                <tr key={p.id} className="border-b border-line align-top">
                  <td className="py-2 pr-4">
                    {p.target_table}
                    {p.branch_id && <div className="text-xs text-fg-muted">{p.branch_id}</div>}
                  </td>
                  <td className="py-2 pr-4">{formatPayload(p)}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="py-2 pr-4">
                    {userLabel(p.decided_by)}
                    {p.status === 'approved' && p.decided_by === p.proposed_by && (
                      <div className="text-xs text-fg-muted">self-approved</div>
                    )}
                  </td>
                  <td className="py-2 pr-4">{p.decision_reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
