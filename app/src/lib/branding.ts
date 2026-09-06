/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { createSupabaseServerClient } from './supabase-server';

// item 26: the whole point of this module is that NONE of these defaults
// name any real client — "Equipment Price Listing" is a plain description
// of what the app does, not a brand. Every screen/document falls back to
// exactly this until an admin saves something at /config/branding — never
// undefined/null propagating into a title or a document header.
export type Branding = {
  displayName: string;
  tagline: string;
  footerText: string;
  legalText: string;
  primaryColor: string;
  fontFamily: string;
  logoId: number | null;
  logoMimeType: string | null;
};

const DEFAULT_BRANDING: Branding = {
  displayName: 'Equipment Price Listing',
  tagline: '',
  footerText: '',
  legalText: '',
  primaryColor: '#1f2937',
  fontFamily: 'Arial',
  logoId: null,
  logoMimeType: null,
};

type BrandingRow = {
  display_name: string;
  tagline: string;
  footer_text: string;
  legal_text: string;
  primary_color: string;
  font_family: string;
  logo_id: number | null;
  logo_mime_type: string | null;
};

function fromRow(row: BrandingRow): Branding {
  return {
    displayName: row.display_name,
    tagline: row.tagline,
    footerText: row.footer_text,
    legalText: row.legal_text,
    primaryColor: row.primary_color,
    fontFamily: row.font_family,
    logoId: row.logo_id,
    logoMimeType: row.logo_mime_type,
  };
}

// For server components/actions with a real request context (cookies()
// available) — works for an authenticated session AND for a session-less
// one (the login page): tmsi.v_current_branding is anon-readable (0008),
// so @supabase/ssr's server client resolves it as `anon` with no session
// and still gets a row back, never a 401.
export async function getBranding(): Promise<Branding> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .schema('tmsi')
    .from('v_current_branding')
    .select('display_name, tagline, footer_text, legal_text, primary_color, font_family, logo_id, logo_mime_type')
    .overrideTypes<BrandingRow[], { merge: false }>()
    .maybeSingle();
  return data ? fromRow(data) : DEFAULT_BRANDING;
}

// For contexts with NO request/cookies at all — today only the GoTrue
// email templates (app/src/app/email-templates/*/route.ts), fetched
// directly by GoTrue inside the docker network, never through a browser.
// A bare, header-less fetch to PostgREST resolves as `anon`
// (PGRST_DB_ANON_ROLE=anon in docker-compose.yml) — tmsi.branding is
// anon-readable for exactly this reason (0008's own header comment).
// Never throws: an email template must still render something sane if
// the DB is briefly unreachable, same "never abort" spirit as
// vps-stats.sh's own fallbacks (item 18).
export async function getBrandingInternal(): Promise<Branding> {
  try {
    const res = await fetch('http://rest:3000/v_current_branding', { cache: 'no-store' });
    if (!res.ok) return DEFAULT_BRANDING;
    const rows: BrandingRow[] = await res.json();
    return rows[0] ? fromRow(rows[0]) : DEFAULT_BRANDING;
  } catch {
    return DEFAULT_BRANDING;
  }
}

// Footer text on documents (print/export) — restriction (d) of the
// prompt: license/ownership text (NOTICE_TEXT, now removed from both,
// see notice.ts) never appears here again, only what an admin configured
// for this client. Blank fields are simply omitted, never a placeholder
// string baked into a real downloaded file.
export function footerLines(b: Branding): string[] {
  return [b.footerText, b.legalText].map((s) => s.trim()).filter((s) => s !== '');
}

type LogoRow = { data: string; mime_type: string };

// Raw logo bytes for embedding in the .xlsx export (exceljs's own
// addImage() needs a Buffer, not a URL) — the print view instead just
// points an <img> at /api/branding/logo, since a browser can fetch that
// itself; this helper exists for the one context that can't (the export
// route building the file server-side, in one pass, before responding).
export async function getBrandingLogoBuffer(
  logoId: number | null,
): Promise<{ buffer: Buffer; extension: 'png' | 'jpeg' } | null> {
  if (logoId === null) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('tmsi')
    .from('branding_logos')
    .select('data, mime_type')
    .eq('id', logoId)
    .overrideTypes<LogoRow[], { merge: false }>()
    .maybeSingle();
  if (error || !data) return null;
  const hex = data.data.startsWith('\\x') ? data.data.slice(2) : data.data;
  return {
    buffer: Buffer.from(hex, 'hex'),
    extension: data.mime_type === 'image/png' ? 'png' : 'jpeg',
  };
}

// Export filenames used to be a literal "tmsi-" prefix — replaced with a
// slug of the configured display name so a renamed deployment doesn't
// keep downloading files named after the old client. Falls back to
// "export" for a name that slugifies to nothing (e.g. all punctuation),
// never an empty filename segment.
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'export';
}
