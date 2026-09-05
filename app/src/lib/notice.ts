/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// Single source for the login page's own short footer — was inline JSX
// there until this module existed; kept as its own constant rather than
// merged with NOTICE_TEXT below, which is a different, more formal text
// for a different audience (a downloaded file, not a page footer).
export const PROPRIETARY_NOTICE = [
  '© 2026 Pedro Alexandre. Proprietary software — authorised users only.',
  'Unauthorised access or use is prohibited and may be prosecuted.',
];

// i10 (export/print footers): "o texto do NOTICE" in the prompt means the
// repository's own /NOTICE file, not this app's shorter login-page blurb
// above — verified by reading that file rather than assumed from the
// nearest-sounding string already in the codebase. Reproduces its first
// two paragraphs (title/copyright + the prohibition statement); the
// "Author"/"Third-party components" paragraphs are repository-level
// notices, not something a business user needs repeated on every
// exported price list, so left out here deliberately.
export const NOTICE_TEXT = [
  'TMSI Equipment Price Listing — Copyright (c) 2026 Pedro Alexandre. All rights reserved.',
  'PROPRIETARY AND CONFIDENTIAL. Unauthorised use, copying, modification, distribution or execution of this software, in whole or in part, is strictly prohibited. See the LICENSE file for the full terms.',
];
