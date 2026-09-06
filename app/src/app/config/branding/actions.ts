/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/auth-guard';
import type { ActionState } from '@/lib/action-state';

export type BrandingActionState = ActionState;

// item 26 §4 of the prompt: "limite de tamanho e tipo validado no
// servidor" — a `<input accept="...">` on the client is convenience only,
// this is the real gate. PNG/JPEG only, never SVG (0008's own header
// comment: exceljs.addImage() doesn't accept it, and this app never
// renders raw SVG markup so there's no XSS angle either way to weigh).
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Admin-only (item 26 §1(b)) — not routed through tmsi.price_proposals:
// this is presentation, never a published price, so 0007's approval
// workflow deliberately does not apply here (restriction 3 of the
// prompt, registered in migration 0008's own header and in STATE.md).
// Every field becomes a brand-new row (tmsi.branding is append-only,
// 0008) — there is no UPDATE path, by design, same shape as
// tmsi.price_proposals' own missing UPDATE/DELETE policy.
export async function saveBranding(_prevState: BrandingActionState, formData: FormData): Promise<BrandingActionState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };

  const display_name = String(formData.get('display_name') ?? '').trim();
  const tagline = String(formData.get('tagline') ?? '');
  const footer_text = String(formData.get('footer_text') ?? '');
  const legal_text = String(formData.get('legal_text') ?? '');
  const primary_color = String(formData.get('primary_color') ?? '');
  const font_family = String(formData.get('font_family') ?? '').trim();
  const logoFile = formData.get('logo');

  if (display_name === '') return { error: 'Display name is required' };
  if (!HEX_COLOR.test(primary_color)) return { error: 'Primary colour must be a hex value, e.g. #1f2937' };
  if (font_family === '') return { error: 'Font family is required' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // No new file selected: carry the existing logo forward unchanged —
  // editing just the text must not silently clear a previously uploaded
  // logo, and must not re-insert/re-audit an unchanged multi-hundred-KB
  // blob (0008's own header comment on why the two tables are separate).
  const { data: current } = await supabase.schema('tmsi').from('v_current_branding').select('logo_id').maybeSingle();
  let logo_id: number | null = current?.logo_id ?? null;

  if (logoFile instanceof File && logoFile.size > 0) {
    if (!ALLOWED_LOGO_TYPES.includes(logoFile.type)) {
      return { error: 'Logo must be a PNG or JPEG image' };
    }
    if (logoFile.size > MAX_LOGO_BYTES) {
      return { error: `Logo must be ${MAX_LOGO_BYTES / (1024 * 1024)} MB or smaller` };
    }
    const buffer = Buffer.from(await logoFile.arrayBuffer());
    const { data: newLogo, error: logoError } = await supabase
      .schema('tmsi')
      .from('branding_logos')
      .insert({
        // PostgREST/Postgres bytea input accepts the same "\x"+hex format
        // it uses for output — a plain string here, cast by Postgres
        // itself on the way in, never raw binary through JSON (which
        // can't carry it).
        data: `\\x${buffer.toString('hex')}`,
        mime_type: logoFile.type,
        filename: logoFile.name || null,
        byte_size: logoFile.size,
        created_by: user.id,
      })
      .select('id')
      .single();
    if (logoError) return { error: logoError.message };
    logo_id = newLogo.id;
  }

  const { error } = await supabase.schema('tmsi').from('branding').insert({
    display_name,
    tagline,
    footer_text,
    legal_text,
    primary_color,
    font_family,
    logo_id,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  // 'layout' so the root layout's generateMetadata() (browser tab title)
  // and every page's own <h1> pick up the new name immediately, not just
  // /config/branding itself.
  revalidatePath('/', 'layout');
  return { success: true };
}
