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

// i10: exact same view/column choice as /prices — never a query that
// reaches further than what that page's screen already shows. `branch`
// scopes rows on top of whatever the view already returned; it never
// picks the view or reaches past RLS (a sales/agent request for another
// branch, or for the cost view, just gets 0 rows for that branch — the
// query param carries no authority of its own).
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
  const viewName = canReadCosts ? 'v_branch_prices' : 'v_selling_prices';
  const columns = canReadCosts
    ? 'product_id, branch_id, currency, total_cost_eur, margin, min_price, ref_price, alert'
    : 'product_id, name, branch_id, currency, min_price, ref_price, lead_time_days';

  let query = supabase.schema('tmsi').from(viewName).select(columns);
  if (branch) {
    query = query.eq('branch_id', branch);
  }
  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const generatedAt = new Date();
  const currencies = [...new Set((rows as { currency: string }[]).map((r) => r.currency))].sort();

  const headers = canReadCosts
    ? ['Product', 'Branch', 'Currency', 'Total cost (EUR)', 'Margin', 'Min price', 'Ref price', 'Alert']
    : ['Product', 'Branch', 'Currency', 'Min price', 'Ref price', 'Lead time (days)'];
  const widths = canReadCosts ? [14, 10, 10, 16, 10, 12, 12, 20] : [28, 10, 10, 12, 12, 16];

  const dataRows = canReadCosts
    ? (rows as BranchPriceRow[]).map((r) => [
        r.product_id,
        r.branch_id,
        r.currency,
        r.total_cost_eur,
        r.margin,
        r.min_price,
        r.ref_price,
        r.alert,
      ])
    : (rows as SellingPriceRow[]).map((r) => [
        `${r.name} (${r.product_id})`,
        r.branch_id,
        r.currency,
        r.min_price,
        r.ref_price,
        r.lead_time_days,
      ]);

  const buffer = await buildXlsx({
    sheetTitle: 'Price list',
    reportTitle: 'TMSI Equipment — Price list',
    scope: branch ?? 'All branches',
    currency: currencies.join(', ') || '—',
    generatedBy: user.email ?? user.id,
    generatedAt,
    headers,
    widths,
    rows: dataRows,
  });

  const filename = `tmsi-prices-${branch ?? 'all'}-${generatedAt.toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
