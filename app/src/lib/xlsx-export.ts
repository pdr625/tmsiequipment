/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import ExcelJS from 'exceljs';
import { NOTICE_TEXT } from './notice';

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
}): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = opts.generatedBy;
  workbook.created = opts.generatedAt;

  // Sheet names are capped at 31 characters by the xlsx format itself.
  const sheet = workbook.addWorksheet(opts.sheetTitle.slice(0, 31));

  sheet.addRow([opts.reportTitle]).font = { bold: true, size: 14 };
  sheet.addRow([`Scope: ${opts.scope}`]);
  sheet.addRow([`Currency: ${opts.currency}`]);
  sheet.addRow([`Generated: ${opts.generatedAt.toISOString()} by ${opts.generatedBy}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(opts.headers);
  headerRow.font = { bold: true };

  for (const row of opts.rows) {
    sheet.addRow(row.map((v) => v ?? '—'));
  }

  sheet.addRow([]);
  for (const line of NOTICE_TEXT) {
    sheet.addRow([line]).font = { italic: true, size: 9, color: { argb: 'FF666666' } };
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
