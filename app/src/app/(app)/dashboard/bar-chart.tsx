/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// Plain HTML bars, no charting library (i8 prompt §2.8 — this host has
// 961 MB RAM and no build headroom for a chart bundle). No 'use client':
// hover is CSS-only (:hover) and the tooltip is a native `title`
// attribute, so this never needs to ship JS to the browser.

const SERIES_VARS = ['--series-1', '--series-2', '--series-3', '--series-4'] as const;
const OTHER_LABEL = 'Other';

export type BarDatum = { key: string; label: string; value: number };

// Fixed categorical colour per entity (i8 prompt §2.3: "atribuída à
// entidade"), assigned in the order the caller passes — never
// re-assigned when the caller's own filtering changes which subset is
// shown. Beyond 4 entities, the 5th+ are folded into one "Other" bucket
// (§2.3: "a 5.ª série não existe") rather than cycling the palette or
// inventing a 5th hex.
function withColor(data: BarDatum[]): (BarDatum & { color: string | null })[] {
  const named = data.slice(0, 4).map((d, i) => ({ ...d, color: `var(${SERIES_VARS[i]})` }));
  const rest = data.slice(4);
  if (rest.length === 0) return named;
  return [
    ...named,
    { key: '__other__', label: OTHER_LABEL, value: rest.reduce((sum, d) => sum + d.value, 0) / rest.length, color: null },
  ];
}

export function BarChart({
  title,
  data,
  format,
  caption,
}: {
  title: string;
  data: BarDatum[];
  format: (v: number) => string;
  caption?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="dashboard-charts rounded-lg border p-4" style={{ borderColor: 'var(--chart-border)', background: 'var(--chart-surface)' }}>
        <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--chart-text)' }}>
          {title}
        </h3>
        <p className="text-sm" style={{ color: 'var(--chart-text-muted)' }}>
          No data for this period.
        </p>
      </div>
    );
  }

  const coloured = withColor(data);
  const max = Math.max(...coloured.map((d) => d.value), 0.0001);

  return (
    <div className="dashboard-charts rounded-lg border p-4" style={{ borderColor: 'var(--chart-border)', background: 'var(--chart-surface)' }}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--chart-text)' }}>
        {title}
      </h3>
      {caption && (
        <p className="mb-3 text-xs" style={{ color: 'var(--chart-text-muted)' }}>
          {caption}
        </p>
      )}

      {/* Legend — >=2 categories here (prompt §2.5). */}
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {coloured.map((d) => (
          <li key={d.key} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--chart-text-muted)' }}>
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: d.color ?? 'var(--chart-text-muted)' }}
            />
            {d.label}
          </li>
        ))}
      </ul>

      {/* Bars: thin, ~4px rounded ends, 2px gap, direct label in text
         colour (never the series fill — §2.4, series 3/4 fail 3:1 on the
         light surface). */}
      <div className="flex flex-col gap-0.5">
        {coloured.map((d) => (
          <div key={d.key} className="flex items-center gap-2" title={`${d.label}: ${format(d.value)}`}>
            <span className="w-16 shrink-0 truncate text-xs" style={{ color: 'var(--chart-text-muted)' }}>
              {d.label}
            </span>
            <div className="h-3.5 flex-1">
              <div
                className="h-full rounded-[4px]"
                style={{ width: `${Math.max((d.value / max) * 100, 3)}%`, background: d.color ?? 'var(--chart-text-muted)' }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-xs font-medium" style={{ color: 'var(--chart-text)' }}>
              {format(d.value)}
            </span>
          </div>
        ))}
      </div>

      {/* Accessible table fallback, required alongside the direct labels
         whenever a series colour reads below 3:1 (§2.4) — kept for every
         chart, not conditionally, since which series lands in slots 3/4
         depends on how many categories are shown. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs underline" style={{ color: 'var(--chart-text-muted)' }}>
          View as table
        </summary>
        <table className="mt-2 w-full border-collapse text-xs">
          <thead>
            <tr className="text-left" style={{ color: 'var(--chart-text-muted)' }}>
              <th className="py-1 pr-4">{title}</th>
              <th className="py-1">Value</th>
            </tr>
          </thead>
          <tbody>
            {coloured.map((d) => (
              <tr key={d.key} style={{ color: 'var(--chart-text)' }}>
                <td className="py-1 pr-4">{d.label}</td>
                <td className="py-1">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
