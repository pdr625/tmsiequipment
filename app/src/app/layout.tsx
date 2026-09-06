/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import type { Metadata } from 'next';
import './globals.css';
import { getBranding } from '@/lib/branding';

// item 26: dynamic instead of a literal string — every request re-reads
// tmsi.v_current_branding (anon-readable, 0008), so a fresh session even
// before login already shows the configured name in the browser tab.
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    title: branding.displayName,
    robots: 'noindex, nofollow',
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
