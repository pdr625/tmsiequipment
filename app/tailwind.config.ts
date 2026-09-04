/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import type { Config } from 'tailwindcss';

// Tailwind v4 is CSS-first (theme tokens live in globals.css via `@theme`);
// this file only pins the content scan paths explicitly rather than
// relying on v4's automatic detection.
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
};

export default config;
