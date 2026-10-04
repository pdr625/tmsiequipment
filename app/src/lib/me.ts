/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { cache } from 'react';
import { createSupabaseServerClient } from './supabase-server';

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

async function pedirMe(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<Me | null> {
  const { data } = await supabase.schema('tmsi').rpc('me');
  const linhas = data as unknown as Me[] | null;
  return linhas?.[0] ?? null;
}

// Menu lateral (2026-10-04): o layout das páginas autenticadas e a própria
// página precisam do `me()` NO MESMO pedido. `cache()` do React partilha o
// resultado dentro de um único render do servidor, por isso chamar
// `getMe()` (sem argumento) no layout e na página custa UMA ida à BD, não
// duas — é o que mantém o `/prices` nos 8 pedidos medidos (item 85).
// Com argumento (`getMe(supabase)`), como nos Route Handlers dos exports,
// faz o pedido directo com o cliente dado, como antes: não há render
// partilhado a que se agarrar.
const meDoPedido = cache(async () => pedirMe(await createSupabaseServerClient()));

export async function getMe(
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<Me | null> {
  return supabase ? pedirMe(supabase) : meDoPedido();
}
