/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getBranding, getBrandingLogoBuffer } from '@/lib/branding';

// Serves the current logo's raw bytes for <img src="/api/branding/logo">
// (the print view, the branding edit page's own preview) — always a real
// authenticated session (tmsi.branding_logos has no anon policy, 0008;
// unlike tmsi.branding itself, no email template ever needs the actual
// image). No special auth of its own beyond the caller's session: reading
// the current logo is no more sensitive than reading the display name.
export async function GET() {
  // Just to confirm a real session exists — same reasoning tmsi.branding_logos'
  // own RLS relies on, checked here too so an unauthenticated caller gets a
  // plain 404 rather than depending only on the RLS error shape.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(null, { status: 404 });
  }

  const branding = await getBranding();
  const logo = await getBrandingLogoBuffer(branding.logoId);
  if (!logo) {
    return new Response(null, { status: 404 });
  }

  // `as unknown as BodyInit`: same TS7.0.2/@types/node mismatch already
  // documented in lib/xlsx-export.ts and the two export routes — a plain
  // Uint8Array is a spec-valid Response body at runtime regardless.
  return new Response(new Uint8Array(logo.buffer) as unknown as BodyInit, {
    headers: {
      'Content-Type': branding.logoMimeType ?? `image/${logo.extension}`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
