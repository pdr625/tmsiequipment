/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// The app's own licence/ownership notice, shown ONLY here (the login page
// footer) — restriction (d) of item 26's prompt, absolute: this text must
// always stay affixed in the app and never appear in an exported or
// printed document. It used to also be duplicated (as NOTICE_TEXT, a
// second constant reproducing /NOTICE's own first two paragraphs) into
// the .xlsx export footer and the /prices print footer — that was
// exactly the bug this restriction exists to catch, not a style choice.
// Both now use the client's own configured footer instead
// (tmsi.branding.footer_text/legal_text via lib/branding.ts's
// footerLines()), which is never this text.
export const PROPRIETARY_NOTICE = [
  '© 2026 Pedro Alexandre. Proprietary software — authorised users only.',
  'Unauthorised access or use is prohibited and may be prosecuted.',
];
