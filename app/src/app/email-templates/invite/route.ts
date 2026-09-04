/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// Fetched by GoTrue (GOTRUE_MAILER_TEMPLATES_INVITE, internal docker-network
// URL). Same reasoning as email-templates/recovery: GoTrue's own
// {{ .ConfirmationURL }} default routes through its /auth/v1/verify, and a
// raw POST /invite call (no code_challenge — we're not going through
// @supabase/ssr's PKCE-flow client methods) produces an implicit-flow
// token whose /verify redirect puts the session in a URL fragment
// (#access_token=...), which a server-side route handler can never see.
// token_hash + verifyOtp sidesteps that entirely.
const TEMPLATE = `<h2>You've been invited</h2>

<p>You have been invited to TMSI Equipment Price Listing. Follow this link to set your password:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Accept the invite</a></p>
`;

export function GET() {
  return new Response(TEMPLATE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
