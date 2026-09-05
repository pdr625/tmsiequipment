/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

// i10: PDF comes from the visitor's own browser (Print -> Save as PDF),
// deliberately not a server-side renderer — a headless Chromium in this
// container would blow the VPS's 961 MB budget (design restriction of
// the prompt, not a shortcut).
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium print:hidden"
    >
      Print / Save as PDF
    </button>
  );
}
