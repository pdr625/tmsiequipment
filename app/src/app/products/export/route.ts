/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { buildXlsx } from '@/lib/xlsx-export';
import { getBranding, getBrandingLogoBuffer, footerLines, slugify } from '@/lib/branding';

type ProductRow = {
  id: string;
  name: string;
  item_type: string;
  status: string;
  primary_branch: string;
  currency: string | null;
  exw_price: number | null;
};

// i10: same view and columns as /products (tmsi.v_products, 0003/0004) —
// row visibility stays tmsi.products_visible(), currency/exw_price stay
// NULL from the view itself for a caller without can_read_costs(); "did
// at least one row come back non-null" is the same reliable signal the
// page itself uses (exw_price is NOT NULL at the table level, 0001 §3).
export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: products, error } = await supabase
    .schema('tmsi')
    .from('v_products')
    .select('id, name, item_type, status, primary_branch, currency, exw_price')
    .order('id')
    .overrideTypes<ProductRow[], { merge: false }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const seesCosts = products?.some((p) => p.exw_price !== null) ?? false;
  const generatedAt = new Date();
  const currencies = seesCosts
    ? [...new Set(products.map((p) => p.currency).filter((c): c is string => c !== null))].sort()
    : [];
  const branding = await getBranding();
  const logo = await getBrandingLogoBuffer(branding.logoId);

  const headers = ['Product', 'Type', 'Status', 'Branch', ...(seesCosts ? ['EXW price', 'Currency'] : [])];
  const widths = [28, 12, 12, 10, ...(seesCosts ? [12, 10] : [])];

  const rows = (products ?? []).map((p) => [
    `${p.name} (${p.id})`,
    p.item_type,
    p.status,
    p.primary_branch,
    ...(seesCosts ? [p.exw_price, p.currency] : []),
  ]);

  const buffer = await buildXlsx({
    sheetTitle: 'Products',
    reportTitle: `${branding.displayName} — Products`,
    scope: 'All products visible to your role',
    currency: currencies.join(', ') || '—',
    generatedBy: user.email ?? user.id,
    generatedAt,
    headers,
    widths,
    rows,
    footerLines: footerLines(branding),
    primaryColor: branding.primaryColor,
    fontFamily: branding.fontFamily,
    logo,
  });

  const filename = `${slugify(branding.displayName)}-products-${generatedAt.toISOString().slice(0, 10)}.xlsx`;

  // `as unknown as BodyInit`: a plain Uint8Array is a spec-valid Response body (and
  // works correctly at runtime, in every runtime this app targets) but
  // this project's pinned TypeScript 7.0.2 + @types/node combination
  // doesn't structurally match it against BodyInit's ArrayBufferView
  // member — confirmed by CI (TS2345) even after switching away from
  // Node's Buffer specifically to rule that out. A type-checker/lib
  // version mismatch, not a runtime bug.
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
