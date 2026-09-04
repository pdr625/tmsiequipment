/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase-middleware';

// /auth/* covers the PKCE code-exchange route (/auth/confirm); it has to be
// public since the visitor doesn't have a session yet when they land there.
// /email-templates/* is fetched by GoTrue itself (no user session at all —
// caught live: without this, GoTrue got our /login page's HTML instead of
// the template, since the redirect-to-/login response was what got fetched).
const PUBLIC_PATHS = ['/login', '/forgot-password', '/auth', '/api/health', '/email-templates'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'));
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);

  if (!user && !isPublic(request.nextUrl.pathname)) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
