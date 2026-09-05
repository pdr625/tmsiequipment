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
// /logout is a Route Handler (not the old signOut Server Action bound to
// `/`) precisely so it can be named here — a Server Action's POST would
// otherwise be indistinguishable, at the middleware level, from any other
// POST to the flagged user's current page.
const PUBLIC_PATHS = ['/login', '/forgot-password', '/auth', '/api/health', '/email-templates', '/logout'];

// i9: routes that stay reachable even while must_change_password is set,
// besides the always-public ones above. /reset-password is the older
// email-recovery completion page (i1) — also a legitimate way to end up
// with a new, self-chosen password, so it must not dead-end a flagged
// user who follows a recovery link instead of using /account/password.
const CHANGE_PASSWORD_PATHS = ['/account/password', '/reset-password'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'));
}

function isChangePasswordPath(pathname: string) {
  return CHANGE_PASSWORD_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'));
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, mustChangePassword } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (user && mustChangePassword && !isPublic(pathname) && !isChangePasswordPath(pathname)) {
    return NextResponse.redirect(new URL('/account/password', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
