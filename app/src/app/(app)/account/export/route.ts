/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getMe } from '@/lib/me';

// Item 46 (0026): «os meus dados». Todo o conteúdo vem de tmsi.my_data(), que só olha para auth.uid() — esta rota não recebe parâmetro
// nenhum sobre DE QUEM são os dados. Sem sessão, 401. A resposta nunca é guardada em cache (é pessoal).
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const me = await getMe(supabase);
  if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data, error } = await supabase.schema('tmsi').rpc('my_data');
  if (error) return NextResponse.json({ error: 'Could not build your data file' }, { status: 500 });

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="tmsi-my-data-${day}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
