/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/auth-guard';
import { DecideProposalForm } from './forms';

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
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
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
      return `product ${f('product_id')}, ${f('branch_id')}, ${f('kind')} = ${f('value')} (${f('valid_from')} → ${f('valid_to', 'open')})`;
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

  const [{ data: proposals }, { data: profiles }, admin, { data: isBm }, { data: myBranches }] = await Promise.all([
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
    isAdmin(),
    supabase.schema('tmsi').rpc('has_role', { r: 'branch_manager' }),
    supabase.schema('tmsi').rpc('my_branches'),
  ]);

  const userLabel = (id: string | null) => (id ? (profiles?.find((p) => p.user_id === id)?.email ?? id) : '—');
  const branches: string[] = Array.isArray(myBranches) ? myBranches : [];
  const canDecide = (branchId: string | null) => admin || (isBm === true && branchId !== null && branches.includes(branchId));

  const pending = proposals?.filter((p) => p.status === 'pending') ?? [];
  const decided = proposals?.filter((p) => p.status !== 'pending') ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Proposals</h1>
        <Link href="/" className="text-sm text-gray-600 underline">
          Back
        </Link>
      </div>
      <p className="mb-6 text-xs text-gray-500">
        Changes to published prices go through here before they take effect. Approve or reject
        with a reason — approving materialises the change as a new, append-only entry, it never
        edits history; rejecting leaves the current value untouched.
      </p>

      <section className="mb-10">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Pending ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-gray-500">Nothing pending.</p>}
        <ul className="space-y-3">
          {pending.map((p) => (
            <li key={p.id} className="rounded-lg border border-gray-200 p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium">{p.target_table}</span>
                {p.branch_id && <span className="text-xs text-gray-500">branch {p.branch_id}</span>}
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE.pending}`}>pending approval</span>
              </div>
              <p className="mb-1 text-sm">{formatPayload(p)}</p>
              <p className="mb-2 text-xs text-gray-500">
                Reason: {p.reason} — proposed by {userLabel(p.proposed_by)} on {p.proposed_at.slice(0, 10)}
              </p>
              {canDecide(p.branch_id) ? (
                <DecideProposalForm proposalId={p.id} />
              ) : (
                <p className="text-xs text-gray-400">
                  Waiting for {p.branch_id ? `the ${p.branch_id} branch manager or an admin` : 'an admin'} to decide.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Decided (most recent 200)</h2>
        {decided.length === 0 && <p className="text-sm text-gray-500">No decisions yet.</p>}
        {decided.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Target</th>
                <th className="py-2 pr-4">Change</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Decided by</th>
                <th className="py-2 pr-4">Decision reason</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-4">
                    {p.target_table}
                    {p.branch_id && <div className="text-xs text-gray-500">{p.branch_id}</div>}
                  </td>
                  <td className="py-2 pr-4">{formatPayload(p)}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="py-2 pr-4">
                    {userLabel(p.decided_by)}
                    {p.status === 'approved' && p.decided_by === p.proposed_by && (
                      <div className="text-xs text-gray-400">self-approved</div>
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
