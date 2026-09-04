/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

// Tailwind v4 ships its PostCSS integration as a separate package
// (@tailwindcss/postcss) and bundles vendor prefixing internally —
// no separate `autoprefixer` entry needed.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
