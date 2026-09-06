/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { getBrandingInternal } from '@/lib/branding';

// Fetched directly by GoTrue (GOTRUE_MAILER_TEMPLATES_RECOVERY, internal
// docker-network URL, not through nginx/the public internet) and parsed as
// a Go template — the {{ .X }} placeholders below are GoTrue's, not ours;
// this route just returns the raw text.
//
// Links to /auth/confirm with token_hash + type=recovery instead of using
// GoTrue's own default {{ .ConfirmationURL }} (which points at GoTrue's own
// /auth/v1/verify and redirects back with a PKCE `code`). The PKCE
// code_verifier lives in a cookie in whichever browser context requested
// the reset — it's often opened somewhere else (phone's mail app, a
// different browser), which was breaking every real attempt. verifyOtp with
// a token_hash needs no such local state, so it works regardless of where
// the link is opened.
//
// item 26: display name is now the configured one (getBrandingInternal —
// this route has no session/cookies at all, GoTrue calls it directly),
// never a hardcoded client name.
export async function GET() {
  const branding = await getBrandingInternal();
  const template = `<h2>Reset password</h2>

<p>Follow this link to reset the password for your ${branding.displayName} account:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset password</a></p>
`;
  return new Response(template, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
