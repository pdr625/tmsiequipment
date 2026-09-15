/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// Item 39 — minimal `;`-delimited CSV reader, UTF-8 (BOM tolerant), the
// same shape docs/ENGINE-PARITY.md's own sample already used. Structural
// errors only (missing header, wrong column count) — business validation
// (required fields, ranges, cross-references) happens server-side in
// tmsi.run_import_hs_duty()/run_import_products(), the one place that can
// see the real schema, not duplicated here.
export type ParsedCsv = { rows: Record<string, string>[] } | { error: string };

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ';') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = clean.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return { error: 'Ficheiro vazio' };

  const header = splitLine(lines[0]).map((h) => h.trim());
  if (header.length < 2) return { error: 'Cabeçalho inválido — separador esperado: `;`' };

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    if (cells.length !== header.length) {
      return { error: `Linha ${i + 1}: ${cells.length} colunas, esperadas ${header.length}` };
    }
    const row: Record<string, string> = {};
    header.forEach((col, idx) => {
      row[col] = cells[idx].trim();
    });
    rows.push(row);
  }
  return { rows };
}
