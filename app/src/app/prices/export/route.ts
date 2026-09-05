/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { buildXlsx } from '@/lib/xlsx-export';

type BranchPriceRow = {
  product_id: string;
  branch_id: string;
  currency: string;
  total_cost_eur: number | null;
  margin: number | null;
  min_price: number | null;
  ref_price: number | null;
  alert: string | null;
};

type SellingPriceRow = {
  product_id: string;
  name: string;
  branch_id: string;
  currency: string;
  min_price: number | null;
  ref_price: number | null;
  lead_time_days: number | null;
};

function respond(buffer: Uint8Array, filename: string) {
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

// i10: exact same view/column choice as /prices — never a query that
// reaches further than what that page's screen already shows. `branch`
// scopes rows on top of whatever the view already returned; it never
// picks the view or reaches past RLS (a sales/agent request for another
// branch, or for the cost view, just gets 0 rows for that branch — the
// query param carries no authority of its own).
//
// The two roles' fetches are two fully separate, literal `.from()`/
// `.select()` calls (not one dynamic viewName/columns string branched
// afterwards) — matching how every other page in this codebase queries
// Postgrest, and avoiding a dynamic select-string union that postgrest-js's
// return-type inference doesn't resolve cleanly.
//
// `.overrideTypes()` goes LAST, after the conditional `.eq()` — the exact
// bug this project already found once (docs/STATE.md, E3-i6 F1, in
// audit/page.tsx): postgrest-js narrows to a filter-less builder type
// once you cross into a "transform" stage, so a filter chained (or
// reassigned) afterwards doesn't type-check. Filters always before that
// narrowing call, never after.
export async function GET(request: NextRequest) {
  const branch = request.nextUrl.searchParams.get('branch');
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: canReadCosts } = await supabase.schema('tmsi').rpc('can_read_costs');
  const generatedAt = new Date();
  const filename = `tmsi-prices-${branch ?? 'all'}-${generatedAt.toISOString().slice(0, 10)}.xlsx`;

  if (canReadCosts) {
    let query = supabase
      .schema('tmsi')
      .from('v_branch_prices')
      .select('product_id, branch_id, currency, total_cost_eur, margin, min_price, ref_price, alert');
    if (branch) {
      query = query.eq('branch_id', branch);
    }
    const { data: rows, error } = await query.overrideTypes<BranchPriceRow[], { merge: false }>();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const currencies = [...new Set(rows.map((r) => r.currency))].sort();
    const buffer = await buildXlsx({
      sheetTitle: 'Price list',
      reportTitle: 'TMSI Equipment — Price list',
      scope: branch ?? 'All branches',
      currency: currencies.join(', ') || '—',
      generatedBy: user.email ?? user.id,
      generatedAt,
      headers: ['Product', 'Branch', 'Currency', 'Total cost (EUR)', 'Margin', 'Min price', 'Ref price', 'Alert'],
      widths: [14, 10, 10, 16, 10, 12, 12, 20],
      rows: rows.map((r) => [
        r.product_id,
        r.branch_id,
        r.currency,
        r.total_cost_eur,
        r.margin,
        r.min_price,
        r.ref_price,
        r.alert,
      ]),
    });
    return respond(buffer, filename);
  }

  let query = supabase
    .schema('tmsi')
    .from('v_selling_prices')
    .select('product_id, name, branch_id, currency, min_price, ref_price, lead_time_days');
  if (branch) {
    query = query.eq('branch_id', branch);
  }
  const { data: rows, error } = await query.overrideTypes<SellingPriceRow[], { merge: false }>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const currencies = [...new Set(rows.map((r) => r.currency))].sort();
  const buffer = await buildXlsx({
    sheetTitle: 'Price list',
    reportTitle: 'TMSI Equipment — Price list',
    scope: branch ?? 'All branches',
    currency: currencies.join(', ') || '—',
    generatedBy: user.email ?? user.id,
    generatedAt,
    headers: ['Product', 'Branch', 'Currency', 'Min price', 'Ref price', 'Lead time (days)'],
    widths: [28, 10, 10, 12, 12, 16],
    rows: rows.map((r) => [`${r.name} (${r.product_id})`, r.branch_id, r.currency, r.min_price, r.ref_price, r.lead_time_days]),
  });
  return respond(buffer, filename);
}
