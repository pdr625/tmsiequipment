/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isAdmin, canManageProducts } from '@/lib/auth-guard';
import type { ActionState } from '@/lib/action-state';

export type ImportActionState = ActionState<{ result: unknown }>;

// Item 39, restriction 7: these two RPCs are SECURITY DEFINER and check the
// caller's role themselves (tmsi.has_role) — the checks here only avoid a
// wasted round trip for a caller who would be refused anyway, same
// convention every other admin-adjacent action in this app already uses.

export async function previewHsDuty(_prevState: ImportActionState, formData: FormData): Promise<ImportActionState> {
  return runHsDuty(formData, true);
}

export async function commitHsDuty(_prevState: ImportActionState, formData: FormData): Promise<ImportActionState> {
  return runHsDuty(formData, false);
}

async function runHsDuty(formData: FormData, dryRun: boolean): Promise<ImportActionState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };
  const rowsJson = String(formData.get('rows') ?? '');
  const filename = String(formData.get('filename') ?? '');
  const reason = String(formData.get('reason') ?? '');
  if (!dryRun && reason.trim() === '') return { error: 'Um motivo é obrigatório para gravar' };

  let rows: unknown;
  try {
    rows = JSON.parse(rowsJson);
  } catch {
    return { error: 'Ficheiro não foi lido correctamente — volta a carregá-lo' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('tmsi')
    .rpc('run_import_hs_duty', { p_rows: rows, p_dry_run: dryRun, p_filename: filename, p_reason: reason || 'pré-visualização' });
  if (error) return { error: error.message };

  if (!dryRun) {
    revalidatePath('/import');
  }
  return { success: true, result: data };
}

export async function previewProducts(_prevState: ImportActionState, formData: FormData): Promise<ImportActionState> {
  return runProducts(formData, true);
}

export async function commitProducts(_prevState: ImportActionState, formData: FormData): Promise<ImportActionState> {
  return runProducts(formData, false);
}

async function runProducts(formData: FormData, dryRun: boolean): Promise<ImportActionState> {
  if (!(await canManageProducts())) return { error: 'Forbidden' };
  const rowsJson = String(formData.get('rows') ?? '');
  const filename = String(formData.get('filename') ?? '');
  const reason = String(formData.get('reason') ?? '');
  if (!dryRun && reason.trim() === '') return { error: 'Um motivo é obrigatório para gravar' };

  let rows: unknown;
  try {
    rows = JSON.parse(rowsJson);
  } catch {
    return { error: 'Ficheiro não foi lido correctamente — volta a carregá-lo' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('tmsi')
    .rpc('run_import_products', { p_rows: rows, p_dry_run: dryRun, p_filename: filename, p_reason: reason || 'pré-visualização' });
  if (error) return { error: error.message };

  if (!dryRun) {
    revalidatePath('/import');
    revalidatePath('/products');
  }
  return { success: true, result: data };
}

export async function undoBatch(_prevState: ImportActionState, formData: FormData): Promise<ImportActionState> {
  if (!(await isAdmin())) return { error: 'Forbidden' };
  const batchId = String(formData.get('batch_id') ?? '');
  const reason = String(formData.get('reason') ?? '');
  if (reason.trim() === '') return { error: 'Um motivo é obrigatório para desfazer' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema('tmsi').rpc('undo_import_batch', { p_batch_id: batchId, p_reason: reason });
  if (error) return { error: error.message };

  revalidatePath('/import');
  revalidatePath('/products');
  return { success: true, result: data };
}
