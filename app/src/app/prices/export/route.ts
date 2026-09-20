/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { buildXlsx } from '@/lib/xlsx-export';
import { getBranding, getBrandingLogoBuffer, footerLines, slugify } from '@/lib/branding';

type BranchPriceRow = {
  product_id: string;
  branch_id: string;
  currency: string;
  total_cost_eur: number | null;
  margin: number | null;
  min_price: number | null;
  ref_price: number | null;
  alert: string | null;
  scope_type: string | null;
};

type SellingPriceRow = {
  product_id: string;
  name: string;
  branch_id: string;
  currency: string;
  min_price: number | null;
  ref_price: number | null;
  lead_time_days: number | null;
  scope_type: string | null;
};

// ⚠️11: "All branches" é o que o filtro diz, não o que o ficheiro traz — sem
// filtro, v_branch_prices inclui também as linhas de canal. O rótulo passa a
// descrever o conteúdo, decidido a partir dos escopos realmente presentes.
function scopeLabel(branch: string | null, rows: { scope_type?: string | null }[]) {
  if (branch) return branch;
  return rows.some((r) => r.scope_type === 'channel') ? 'All branches and channels' : 'All branches';
}

function respond(buffer: Uint8Array, filename: string) {
  // `as unknown as BodyInit`: see products/export/route.ts's identical comment —
  // a type-checker/lib mismatch in this project's pinned TypeScript
  // 7.0.2, not a runtime problem (Uint8Array is a spec-valid body).
  return new NextResponse(buffer as unknown as BodyInit, {
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
  const branding = await getBranding();
  const logo = await getBrandingLogoBuffer(branding.logoId);
  const filename = `${slugify(branding.displayName)}-prices-${branch ?? 'all'}-${generatedAt.toISOString().slice(0, 10)}.xlsx`;

  if (canReadCosts) {
    let query = supabase
      .schema('tmsi')
      .from('v_branch_prices')
      .select('product_id, branch_id, scope_type, currency, total_cost_eur, margin, min_price, ref_price, alert')
      // ⚠️11: sem ORDER BY, v_branch_prices (UNION ALL) devolvia as linhas de
      // canal num bloco no fim do ficheiro, a ~150 linhas do artigo a que
      // pertencem — quem lê o bloco de um artigo via 4 âmbitos e concluía que
      // o 5.º não existia. Ordenar por artigo põe cada âmbito ao lado do seu.
      .order('product_id')
      .order('branch_id');
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
      reportTitle: `${branding.displayName} — Price list`,
      scope: scopeLabel(branch, rows),
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
      footerLines: footerLines(branding),
      primaryColor: branding.primaryColor,
      fontFamily: branding.fontFamily,
      logo,
    });
    return respond(buffer, filename);
  }

  let query = supabase
    .schema('tmsi')
    .from('v_selling_prices')
    .select('product_id, name, branch_id, scope_type, currency, min_price, ref_price, lead_time_days')
      .order('product_id')
      .order('branch_id');
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
    reportTitle: `${branding.displayName} — Price list`,
    scope: scopeLabel(branch, rows),
    currency: currencies.join(', ') || '—',
    generatedBy: user.email ?? user.id,
    generatedAt,
    headers: ['Product', 'Branch', 'Currency', 'Min price', 'Ref price', 'Lead time (days)'],
    widths: [28, 10, 10, 12, 12, 16],
    rows: rows.map((r) => [`${r.name} (${r.product_id})`, r.branch_id, r.currency, r.min_price, r.ref_price, r.lead_time_days]),
    footerLines: footerLines(branding),
    primaryColor: branding.primaryColor,
    fontFamily: branding.fontFamily,
    logo,
  });
  return respond(buffer, filename);
}
