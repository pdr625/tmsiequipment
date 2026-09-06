/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import ExcelJS from 'exceljs';

// item 26: the italic grey footer used to be lib/notice.ts's NOTICE_TEXT —
// the software's OWN licence/copyright notice, hardcoded. Restriction (d)
// of the prompt makes that a real bug, not a style choice: licence data
// must never appear in an exported document. footerLines now comes from
// the caller (branding config, tmsi.branding.footer_text/legal_text via
// lib/branding.ts's own footerLines()) — this module has no idea what
// licence text even is any more, on purpose.
const DEFAULT_ARGB = 'FF1F2937'; // matches the branding table's own default #1f2937

function hexToArgb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`;
}

// i10: shared workbook shape for every export route (prices, products).
// Columns/rows are the CALLER's responsibility to already have narrowed to
// exactly what that role sees on the equivalent screen (0003/0004's
// boundary is the view/RPC the route queries, not anything in here) —
// this module only renders whatever it's handed, it enforces nothing.
//
// Deliberately NOT using ExcelJS's `worksheet.columns = [...]` bulk setter:
// that call writes its `header` values into row 1, which would collide
// with the metadata block (title/scope/currency/generated) written first.
// Header row + widths are set independently instead (addRow for the
// header text, getColumn(i).width for sizing) — no ambiguity about which
// row ends up as the real header.
export async function buildXlsx(opts: {
  sheetTitle: string;
  reportTitle: string;
  scope: string;
  currency: string;
  generatedBy: string;
  generatedAt: Date;
  headers: string[];
  widths: number[];
  rows: (string | number | null)[][];
  footerLines: string[];
  primaryColor?: string;
  fontFamily?: string;
  logo?: { buffer: Buffer; extension: 'png' | 'jpeg' } | null;
}): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = opts.generatedBy;
  workbook.created = opts.generatedAt;
  const titleArgb = opts.primaryColor ? hexToArgb(opts.primaryColor) : DEFAULT_ARGB;
  const fontName = opts.fontFamily || 'Calibri';

  // Sheet names are capped at 31 characters by the xlsx format itself.
  const sheet = workbook.addWorksheet(opts.sheetTitle.slice(0, 31));

  if (opts.logo) {
    // `as unknown as Parameters<...>[0]`: exceljs's own .d.ts declares a
    // MODULE-LOCAL `interface Buffer extends ArrayBuffer` for this one
    // field — under this project's `esnext` lib (which adds the
    // resizable-ArrayBuffer members: resize/resizable/maxByteLength/
    // detached/transfer/transferToFixedLength), @types/node's real
    // Buffer no longer structurally satisfies exceljs's stale shim.
    // Confirmed real (a fresh `npx tsc --noEmit` on a clean clone, not a
    // CI fluke) and confirmed harmless at runtime — same class of
    // type-checker/lib mismatch already documented elsewhere in this
    // file and in the two export routes for Buffer vs BodyInit.
    // Parameters<>[0] avoids having to name exceljs's own (unexported)
    // Image interface.
    const imageId = workbook.addImage({
      buffer: opts.logo.buffer,
      extension: opts.logo.extension,
    } as unknown as Parameters<typeof workbook.addImage>[0]);
    // Fixed footprint (roughly a 120x40px logo area) — this module has no
    // way to know the source image's own aspect ratio without a second
    // decode step; a v1 choice, not a limitation of the format. Excel
    // images float over cells rather than push rows down, so a blank
    // spacer row of a similar height clears space for it before the
    // title text starts underneath.
    sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 40 } });
    sheet.addRow([]).height = 30;
  }

  sheet.addRow([opts.reportTitle]).font = { bold: true, size: 14, name: fontName, color: { argb: titleArgb } };
  sheet.addRow([`Scope: ${opts.scope}`]).font = { name: fontName };
  sheet.addRow([`Currency: ${opts.currency}`]).font = { name: fontName };
  sheet.addRow([`Generated: ${opts.generatedAt.toISOString()} by ${opts.generatedBy}`]).font = { name: fontName };
  sheet.addRow([]);

  const headerRow = sheet.addRow(opts.headers);
  headerRow.font = { bold: true, name: fontName };

  for (const row of opts.rows) {
    sheet.addRow(row.map((v) => v ?? '—')).font = { name: fontName };
  }

  if (opts.footerLines.length > 0) {
    sheet.addRow([]);
    for (const line of opts.footerLines) {
      sheet.addRow([line]).font = { italic: true, size: 9, name: fontName, color: { argb: 'FF666666' } };
    }
  }

  opts.widths.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });

  sheet.pageSetup = {
    orientation: 'landscape',
    printTitlesRow: `${headerRow.number}:${headerRow.number}`,
  };

  // Node's Buffer (what writeBuffer() actually returns) doesn't satisfy
  // DOM lib's BodyInit under this project's TS/@types/node combo — caught
  // by CI, not assumed (TS2345, Buffer<ArrayBufferLike> vs BodyInit). A
  // plain Uint8Array does, cleanly, with no generic-parameter mismatch.
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
