/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { NextResponse } from 'next/server';
import packageJson from '../../../../package.json';

export function GET() {
  return NextResponse.json({ status: 'ok', version: packageJson.version });
}
