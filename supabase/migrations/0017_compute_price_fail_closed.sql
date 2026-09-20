-- 0017 — as guardas do compute_price deixam de falhar abertas.
--
-- PROPOSTA. Escrita a 2026-09-20, NÃO APLICADA — o Pedro revê primeiro.
--
-- Origem: item 64. A 0016 fechou o SINTOMA (revogou EXECUTE ao anon, logo um
-- pedido sem credencial leva 401 antes de chegar ao motor). Esta migração
-- fecha a CAUSA, para a falha-aberta não voltar por outro caminho — por
-- exemplo se alguém, um dia, voltar a conceder EXECUTE a anon sem perceber o
-- que isso destranca.
--
-- ============================================================================
-- A FALHA
-- ============================================================================
-- As três guardas do compute_price estavam escritas como "autenticado MAS sem
-- direito a custos":
--
--   if auth.uid() is not null and not see_sell then return; end if;
--   if auth.uid() is not null and not see_costs and p.status <> 'active' then return; end if;
--   if auth.uid() is not null and not see_costs then   -- anula 11 colunas
--
-- Para o anon, auth.uid() é NULL, logo as três condições dão falso e NENHUMA
-- dispara: sem sessão, a resposta trazia o breakdown de custo inteiro de um
-- artigo real em draft. A guarda tratava "sem sessão" como "de confiança".
--
-- Varrimento do mesmo padrão (2026-09-20), para não ficar só aqui:
--   funções ... compute_price é a ÚNICA com `auth.uid() is not null`. As outras
--               10 que usam auth.uid() fazem-no para ATRIBUIR autoria
--               (created_by, decided_by) ou para se auto-limitarem
--               (`where user_id = auth.uid()`), nunca como condição de guarda.
--   políticas .. as 7 que usam uid() fazem `proposed_by = uid()`; para o anon
--               dá NULL = ... -> NULL -> falso. FALHA FECHADA, que é o correcto.
--   vistas ..... zero ocorrências de uid() nas cinco.
--
-- ============================================================================
-- O CRITÉRIO, E PORQUE NÃO É `current_role`
-- ============================================================================
-- Medido DENTRO de uma SECURITY DEFINER do postgres (é lá que a decisão é
-- tomada, e lá os sinais são outros):
--
--   contexto                            current_role  session_user   auth.uid()  claim role
--   (1) psql directo, sem claims        postgres      postgres       NULL        NULL
--   (2) psql + claims + set role auth   postgres      postgres       <uuid>      authenticated
--   (3) anon, claims vazias             postgres      postgres       NULL        NULL
--   (3b) anon, claims {"role":"anon"}   postgres      postgres       NULL        anon
--   (4) authenticated via PostgREST     postgres      postgres       <uuid>      authenticated
--
-- `current_role` e `current_user` são o DONO em todos os casos — dentro de uma
-- definer não dizem nada sobre quem chamou. Um critério assente neles daria
-- "confiança" sempre e desligava as guardas para toda a gente.
--
-- (1) e (3) são INDISTINGUÍVEIS por uid/claims: ambos tudo NULL. O que os
-- separa é o `session_user`, e esse foi medido a sério, não emulado:
--
--   pg_stat_activity -> authenticator | "PostgREST 14.12"
--
-- TODO pedido HTTP entra como session_user = authenticator (anon,
-- authenticated ou service_role) — SET ROLE e SECURITY DEFINER nunca alteram o
-- session_user. É essa a âncora.
--
-- ⚠️ DISCIPLINA DA EMULAÇÃO DE ANON, que este critério impõe:
--    uma emulação de anon por psql (`set role anon`) tem session_user =
--    postgres, logo cai no contexto (1) e é classificada como CONFIANÇA se não
--    trouxer claims. Para exercer o caminho real tem de pôr a claim de papel:
--        select set_config('request.jwt.claims', '{"role":"anon"}', true);
--    Sem isso a emulação mente — dá "passou" onde o anon real seria negado.
--    O bloco DD do smoke não é afectado: fala HTTP real, entra por
--    authenticator. O passo novo do protocolo (§4.15) usa SET SESSION
--    AUTHORIZATION para exercer o caminho verdadeiro, sem emulação nenhuma.
--
-- service_role: pelo inventário de chamadores NÃO há consumidor legítimo de
-- compute_price por service_role (o /api/fx-age lê tmsi.exchange_rates
-- directamente com a service key, nunca o motor). Passa a ser tratado como
-- chamador de API. Se aparecer um consumidor, acrescenta-se à lista de
-- confiança — não se acrescenta sem chamador conhecido.

begin;

-- ---------------------------------------------------------------------------
-- 1. O predicado de confiança.
--
-- NUNCA LANÇA EXCEPÇÃO, por desenho: claims ausentes, vazias ou malformadas
-- devolvem `false` (= chamador de API, guardas aplicam), nunca um erro. Uma
-- guarda que rebenta é uma guarda que alguém desliga; e falhar para o lado
-- fechado é o único lado aceitável. auth.uid() está DENTRO do bloco protegido
-- precisamente porque também ele faz cast de jsonb e rebentaria com claims
-- malformadas.
--
-- SECURITY INVOKER, deliberadamente: esta função só lê `session_user` e GUCs
-- da sessão, que são iguais para qualquer identidade efectiva — o SECURITY
-- DEFINER não lhe daria nada, e uma definer de superuser alcançável a partir
-- do motor é superfície de ataque sem contrapartida. Verificado que o caminho
-- aguenta como invoker: chamada de dentro do compute_price, a identidade
-- efectiva é o `postgres`, que tem EXECUTE em `auth.uid()` (ela própria
-- invoker, dona `supabase_auth_admin`) — e o compute_price já a chama
-- directamente hoje, pelo mesmo caminho.
-- ---------------------------------------------------------------------------
create or replace function tmsi.is_trusted_db_session() returns boolean
language plpgsql stable security invoker set search_path = tmsi, pg_temp as $fn$
begin
  -- (a) sessão directa na base? qualquer pedido por PostgREST entra como
  --     `authenticator`, logo falha já aqui.
  if session_user not in ('postgres', 'supabase_admin') then
    return false;
  end if;

  begin
    -- (b) sem identidade JWT?
    if auth.uid() is not null then
      return false;
    end if;

    -- (c) sem claim de papel? (sem claims de todo = sessão directa limpa)
    if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = '' then
      return true;
    end if;
    return (current_setting('request.jwt.claims', true)::jsonb ->> 'role') is null;
  exception when others then
    return false;   -- malformadas: API, nunca erro
  end;
end $fn$;

-- A armadilha da 0011, e outra vez da 0016: esta função é criada pelo
-- supabase_admin e chamada de DENTRO do compute_price, definer do postgres —
-- a identidade efectiva lá dentro é o `postgres`, e a 0016 fechou o default a
-- PUBLIC. Sem este grant o motor rebenta com "permission denied for function
-- is_trusted_db_session" para toda a gente.
--
-- Só ao postgres: não há chamador conhecido por service_role (o /api/fx-age lê
-- tmsi.exchange_rates directamente com a service key, nunca o motor), e um
-- grant sem chamador é superfície que ninguém pediu.
-- ⚠️ REVOKE EXPLÍCITO, e a razão pela qual ele tem de estar aqui (achado
-- 2026-09-20, ao verificar esta própria migração depois de aplicada):
-- o `alter default privileges for role supabase_admin ... revoke execute on
-- functions from public` da 0016 **não funciona**. Medido: mesmo com a entrada
-- criada em pg_default_acl (`postgres=X/supabase_admin`), uma função nova
-- criada pelo supabase_admin nasce na mesma com `=X/supabase_admin` — ou seja,
-- PUBLIC com EXECUTE. Só as defaults do `postgres` fazem efeito nesta
-- instância (é por isso que o compute_price, criado por ele, não tem PUBLIC).
-- Conclusão operacional: toda a migração que crie função tem de revogar o
-- PUBLIC à mão. O cabeçalho da 0016 prometia um default-deny que, para funções
-- criadas pelo supabase_admin, não existe — ver BACKLOG item 65.
revoke execute on function tmsi.is_trusted_db_session() from public;
grant execute on function tmsi.is_trusted_db_session() to postgres;

-- ---------------------------------------------------------------------------
-- 2. As três guardas do compute_price.
--
-- Corpo gerado de PRODUÇÃO com pg_get_functiondef() e alterado em exactamente
-- quatro sítios: a declaração de `v_api_caller`, a sua atribuição única, e as
-- três guardas a lerem a variável em vez de `auth.uid() is not null`.
-- Nada mais muda: mesma assinatura, mesma aritmética, mesmas colunas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tmsi.compute_price(p_product text, p_scope_type tmsi.pricing_scope, p_scope_id text, p_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(product_id text, branch_id text, currency character, fx_used numeric, exw_local numeric, fee numeric, interco numeric, transport numeric, duty_rate numeric, duty numeric, total_cost numeric, total_cost_eur numeric, margin numeric, list_coef numeric, min_price numeric, ref_price numeric, alert text, overrides text[], errors text[], scope_type tmsi.pricing_scope)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'tmsi', 'public'
AS $function$
declare
  p   tmsi.products%rowtype;
  b   tmsi.branches%rowtype;  -- the ORIGIN branch for channel scope too
  ch  tmsi.channels%rowtype;
  bp  tmsi.branch_pricing_params%rowtype;  -- (E, 0010) latest ref_factor/list_coef for b
  see_costs boolean; see_sell boolean;
  v_api_caller boolean;
  cur char(3);
  fx_prod numeric; fx_branch numeric;
  v_fee numeric; v_transport numeric; v_duty_rate numeric; v_margin numeric; v_coef numeric;
  v_exw_local numeric; v_interco numeric; v_duty numeric; v_total numeric; v_total_eur numeric;
  v_min numeric; v_ref numeric; ov text[] := '{}'; err text[] := '{}'; o numeric;
  min_m numeric; tgt_m numeric;
  v_round_step numeric;
  is_flat_priced boolean;  -- (0010-B): option/service, margin zero, fee zero
begin
  select * into p from tmsi.products where id = p_product;

  if p_scope_type = 'channel' then
    select * into ch from tmsi.channels where id = p_scope_id and active;
    if ch.id is null then return; end if;
    select * into b from tmsi.branches where id = ch.branch_id;
  else
    select * into b from tmsi.branches where id = p_scope_id;
  end if;
  if p.id is null or b.id is null then return; end if;
  cur := b.currency;
  is_flat_priced := p.item_type in ('option', 'service');

  select bpp.* into bp from tmsi.branch_pricing_params bpp
   where bpp.branch_id = b.id and bpp.effective_date <= p_date
   order by bpp.effective_date desc, bpp.created_at desc limit 1;

  select crp.rounding into v_round_step from tmsi.currency_rounding_params crp
   where crp.currency = cur and crp.effective_date <= p_date
   order by crp.effective_date desc, crp.created_at desc limit 1;

  see_costs := tmsi.has_role('admin') or tmsi.has_role('product_manager') or tmsi.has_role('finance')
            or tmsi.has_role('viewer')
            or (p_scope_type = 'branch' and tmsi.has_role('branch_manager') and b.id = any(tmsi.my_branches()));
  see_sell  := see_costs
            or (p_scope_type = 'branch' and tmsi.has_role('logistics'))
            or (p_scope_type = 'branch' and tmsi.has_role('sales') and b.id = any(tmsi.my_branches()))
            or (p_scope_type = 'branch' and tmsi.has_role('agent')
                and b.id in (select c.branch_id from tmsi.channels c where c.id = any(tmsi.my_channels())))
            or (p_scope_type = 'channel' and tmsi.has_role('agent') and p_scope_id = any(tmsi.my_channels()));
  -- 0017: o predicado é avaliado UMA vez por chamada e guardado. O seu bloco
  -- `exception` abre uma subtransacção de cada vez que corre, e esta função
  -- corre POR LINHA nas vistas (v_branch_prices faz CROSS JOIN LATERAL sobre
  -- todos os artigos × âmbitos) — avaliá-lo três vezes por linha seria pagar
  -- três subtransacções onde uma chega.
  v_api_caller := not tmsi.is_trusted_db_session();

  if v_api_caller and not see_sell then return; end if;
  if v_api_caller and not see_costs and p.status <> 'active' then return; end if;

  -- FX: unchanged, cur already correct for both scopes.
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'fx', p_date);
  if o is not null then
    fx_used := o; ov := array_append(ov, 'fx');
  else
    fx_prod   := case when p.currency = 'EUR' then 1 else tmsi.fx_rate(p.currency, p_date) end;
    fx_branch := case when cur = 'EUR' then 1 else tmsi.fx_rate(cur, p_date) end;
    if fx_prod is null or fx_branch is null then
      err := array_append(err, 'missing exchange rate'); fx_used := null;
    else
      fx_used := fx_branch / fx_prod;
    end if;
  end if;
  v_exw_local := p.exw_price * coalesce(fx_used, 0);

  -- interco fee (0012): now the article's own tmsi.products.interco_margin
  -- — a single value per article, not looked up per (origin, destination)
  -- branch pair any more (tmsi.interco_fees kept for history, no longer
  -- read here). Same priority order as before this migration: an explicit
  -- override still wins over everything, flat-priced items and channel
  -- scope still hard-zero, and selling from the article's own origin
  -- branch still never charges itself. The "missing interco fee" error is
  -- gone with it — interco_margin is not null on every article, so this
  -- branch of the if/elsif can no longer fail to produce a value.
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'fee', p_date);
  if o is not null then
    v_fee := o; ov := array_append(ov, 'fee');
  elsif is_flat_priced then
    v_fee := 0;
  elsif p_scope_type = 'channel' then
    v_fee := 0;
  elsif p.primary_branch = b.id then
    v_fee := 0;
  else
    v_fee := p.interco_margin;
  end if;
  v_interco := v_exw_local * (1 + v_fee);

  -- transport: byte-identical to 0009/0010.
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'transport', p_date);
  if o is not null then v_transport := o; ov := array_append(ov, 'transport');
  elsif p.item_type in ('option', 'service') then v_transport := 0;
  elsif p_scope_type = 'branch' and p.primary_branch = b.id then v_transport := 0;
  else
    select t.cost into v_transport from (
      select distinct on (tt.tier) tt.tier, tt.max_weight_kg, tt.cost
        from tmsi.transport_tiers tt
       where tt.branch_id = b.id and tt.effective_date <= p_date
       order by tt.tier, tt.effective_date desc, tt.created_at desc
    ) t
     where t.max_weight_kg is null or p.gross_weight_kg < t.max_weight_kg
     order by t.tier limit 1;
    if v_transport is null then err := array_append(err, 'missing transport tier / weight'); v_transport := 0; end if;
  end if;

  -- customs duty: byte-identical to 0009/0010.
  if p_scope_type = 'channel' then
    v_duty_rate := 0;
  else
    o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'duty', p_date);
    if o is not null then v_duty_rate := o; ov := array_append(ov, 'duty');
    elsif p.primary_branch = b.id or p.item_type in ('option', 'service') then v_duty_rate := 0;
    else
      select c.rate into v_duty_rate from tmsi.customs_rates c
       where c.hs_code = coalesce(
               (select h.hs_code from tmsi.product_hs_overrides h
                 where h.product_id = p.id and h.scope_type = 'branch' and h.scope_id = b.id),
               p.hs_code)
         and c.zone = b.zone
         and c.effective_date <= p_date
       order by c.effective_date desc, c.created_at desc limit 1;
      if v_duty_rate is null then err := array_append(err, 'missing customs rate for HS/zone'); v_duty_rate := 0; end if;
    end if;
  end if;
  v_duty  := v_interco * v_duty_rate;
  v_total := v_interco + v_transport + v_duty;
  v_total_eur := case when cur = 'EUR' then v_total
                      else v_total / coalesce(tmsi.fx_rate(cur, p_date), 1) end;

  -- margin: byte-identical to 0010.
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'margin', p_date);
  if o is not null then
    v_margin := o; ov := array_append(ov, 'margin');
  elsif is_flat_priced then
    v_margin := 0;
  elsif p_scope_type = 'channel' then
    err := array_append(err, 'missing channel margin override'); v_margin := 0;
  else
    v_margin := tmsi.branch_margin(b.id, v_total_eur, p_date);
    if v_margin is null then err := array_append(err, 'missing margin grid'); v_margin := 0; end if;
  end if;

  -- list coefficient: byte-identical to 0010.
  o := tmsi.override_value(p.id, p_scope_type, p_scope_id, 'coef', p_date);
  if o is not null then v_coef := o; ov := array_append(ov, 'coef');
  elsif p_scope_type = 'channel' then v_coef := 1;
  else v_coef := bp.list_coef; end if;

  -- rounding: byte-identical to 0010.
  v_min := tmsi.round_up_to(v_total / (1 - v_margin) * v_coef, v_round_step);
  v_ref := tmsi.round_to(v_min * bp.ref_factor, v_round_step);

  select (value->>0)::numeric into min_m from tmsi.settings where key = 'margin_min';
  select (value->>0)::numeric into tgt_m from tmsi.settings where key = 'margin_target';

  if v_api_caller and not see_costs then
    return query select p.id, coalesce(ch.id, b.id), cur,
      null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
      null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
      v_min, v_ref, null::text, null::text[], null::text[], p_scope_type;
    return;
  end if;

  return query select p.id, coalesce(ch.id, b.id), cur,
    fx_used, v_exw_local, v_fee, v_interco, v_transport, v_duty_rate, v_duty, v_total, v_total_eur,
    v_margin, v_coef, v_min, v_ref,
    case when array_length(err, 1) > 0 then 'error'
         when v_margin < coalesce(min_m, 0.15) then 'critical'
         when v_margin < coalesce(tgt_m, 0.25) then 'warning' else 'ok' end,
    ov, err, p_scope_type;
end $function$;
-- ---------------------------------------------------------------------------
-- 3. A guarda da convenção (CLAUDE.md, item 65).
--
-- `alter default privileges ... in schema ... revoke ... from public` é no-op:
-- o EXECUTE a PUBLIC vem do built-in GLOBAL do PostgreSQL, e uma entrada com
-- âmbito de schema só sabe acrescentar, nunca retirar. Logo cada função nova
-- nasce aberta e tem de ser fechada à mão — e isto falha a migração ANTES do
-- COMMIT se alguma ficou por fechar.
--
-- aclexplode com grantee = 0 (o PUBLIC) em vez de comparar texto: uma ACL nula
-- significa built-in, ou seja PUBLIC, e essa não aparece em comparação de
-- strings nenhuma.
-- ---------------------------------------------------------------------------
do $$
declare v_abertas text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_abertas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tmsi'
    and (p.proacl is null
         or exists (select 1 from aclexplode(p.proacl) a
                    where a.privilege_type = 'EXECUTE'
                      and (a.grantee = 0 or a.grantee = 'anon'::regrole)));
  if v_abertas is not null then
    raise exception 'Funções de tmsi com EXECUTE a PUBLIC/anon: %', v_abertas;
  end if;
end $$;

commit;


-- ============================================================================
-- PROVA OBRIGATÓRIA — em transacção revertida, ANTES de aplicar
-- ============================================================================
-- Está em docs/VERIFICATION-PROTOCOL.md §4.15 como passo re-executável, e o
-- script em scripts/prova-guarda-anon.sql. Tem de ser um passo de protocolo e
-- não do smoke porque, com a 0016 por baixo, o anon leva 401 ANTES de chegar
-- ao motor: nenhum pedido HTTP consegue exercer a guarda. A única forma de a
-- pôr à prova sozinha é conceder-lhe EXECUTE dentro de uma transacção que se
-- reverte.
