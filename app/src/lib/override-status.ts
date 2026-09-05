/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// today <= valid_from -> future; valid_to set and < today -> expired;
// otherwise active. tmsi.override_value() (0001 §7) evaluates the exact
// same range for compute_price() itself — this mirrors that read-only
// classification for display, never the actual decision of which
// override applies to a calculation.
export function overrideStatus(validFrom: string, validTo: string | null): 'active' | 'expired' | 'future' {
  const today = new Date().toISOString().slice(0, 10);
  if (validFrom > today) return 'future';
  if (validTo !== null && validTo < today) return 'expired';
  return 'active';
}
