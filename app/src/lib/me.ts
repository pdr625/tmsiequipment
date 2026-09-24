/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import type { createSupabaseServerClient } from './supabase-server';

// 0021 (item 76): quem chama, numa só chamada. Substitui `auth.getUser()` +
// `profiles` + `can_read_costs()` nas páginas e nos exports — três pedidos
// (dois deles ao GoTrue/PostgREST em série) por um. É SECURITY INVOKER e
// filtra por auth.uid() dentro da BD: devolve UMA linha, a do próprio, e
// nenhuma linha se a sessão não tiver identidade. O middleware não usa isto —
// continua a fazer o seu próprio getUser(), que é o que refresca a sessão.
export type Me = {
  user_id: string;
  full_name: string | null;
  roles: string[];
  can_read_costs: boolean;
  can_read_operational: boolean;
  branches: string[];
  channels: string[];
  must_change_password: boolean;
};

export async function getMe(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<Me | null> {
  const { data } = await supabase.schema('tmsi').rpc('me');
  const linhas = data as unknown as Me[] | null;
  return linhas?.[0] ?? null;
}
