/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// Same "latest row with effective_date <= today, ties broken by the
// latest created_at" selection tmsi.fx_rate()/tmsi.compute_price() apply
// in Postgres (0005/0007) — applied here in JS to pick, per identity
// (e.g. one (branch_id, tier) pair), the single row a page shows as "the
// current value". Older/future rows for the same identity are real,
// queryable history (via the audit log) — just not re-surfaced here.
// Extracted from config/page.tsx (0007) when branches/page.tsx (0012
// Fase 2) needed the exact same selection for branch_pricing_params.
export function pickActive<T extends { effective_date: string; created_at: string }>(
  rows: T[] | null,
  keyOf: (row: T) => string,
): T[] {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...(rows ?? [])].sort((a, b) => {
    if (a.effective_date !== b.effective_date) return a.effective_date < b.effective_date ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });
  const seen = new Set<string>();
  const active: T[] = [];
  for (const row of sorted) {
    if (row.effective_date > today) continue;
    const key = keyOf(row);
    if (seen.has(key)) continue;
    seen.add(key);
    active.push(row);
  }
  return active;
}
