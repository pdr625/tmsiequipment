-- 0016 — fronteira de execução das funções, e três correcções que andam com ela.
--
-- PROPOSTA. Escrita a 2026-09-20, NÃO APLICADA — o Pedro revê primeiro.
--
-- Origem: bloco A da sessão de fronteiras laterais (2026-09-19/20), itens 59-62
-- do BACKLOG. A fronteira de custo estava provada nas TABELAS (0003/0004) e nas
-- VISTAS (v_products, v_audit_log), mas nunca no caminho por FUNÇÃO. Medido pela
-- API REST real, com JWT cunhado, duas vezes e por duas vias independentes:
--
--   tmsi.branch_margin(...)  -> logistics/sales/agent recebem VALOR DE MARGEM
--   tmsi.override_value(...) -> logistics/sales/agent recebem VALOR DE MARGEM
--   tmsi.fx_rate(...)        -> responde 200 SEM CREDENCIAL NENHUMA (anon)
--
-- Os mesmos papéis lêem ZERO linhas de tmsi.margin_grids e tmsi.price_overrides.
-- As três são SECURITY DEFINER e não verificam o papel de quem as chama: lêem
-- tabelas cuja RLS é can_read_costs() e devolvem o número à mesma.
--
-- ============================================================================
-- PORQUE NÃO SE VERIFICA can_read_costs() DENTRO DAS TRÊS — decisão do Pedro
-- ============================================================================
-- Seria o reflexo óbvio, e partiria os preços. tmsi.compute_price() chama as
-- três ao calcular o preço de venda; dentro de uma função SECURITY DEFINER o
-- JWT continua a ser o de QUEM CHAMOU, logo um can_read_costs() lá dentro daria
-- falso para sales/agent e o motor devolveria preços errados (ou nenhuns) aos
-- únicos papéis que existem para os ver. A fronteira não se põe no corpo da
-- função: põe-se em QUEM A PODE INVOCAR.
--
-- Desenho, então: revogar EXECUTE nas funções INTERNAS (as que só o motor
-- chama) e deixar o motor chamá-las como dono. compute_price() é SECURITY
-- DEFINER do postgres, por isso as suas chamadas internas correm como postgres
-- e não são afectadas por revogação nenhuma ao `authenticated`.
--
-- ============================================================================
-- INVENTÁRIO DE CHAMADORES — feito antes de escrever uma linha desta migração
-- ============================================================================
-- GRUPO A (mantêm EXECUTE a authenticated — a superfície RPC pretendida):
--   has_role .................. app (18 sítios) + 22 POLÍTICAS RLS
--   can_read_costs ............ app (5) + 6 políticas
--   can_read_operational ...... app (1) + 2 políticas
--   my_branches ............... app (1) + 3 políticas
--   products_visible .......... política products_read
--   compute_price ............. app + v_branch_prices/v_selling_prices
--                               (as duas são security_invoker=true, logo
--                               correm como o chamador e precisam do EXECUTE)
--   decide_price_proposal ..... app/proposals/actions.ts:35
--   decide_price_proposal_batch  app/proposals/actions.ts:78
--   run_import_hs_duty ........ app/import/actions.ts:47
--   run_import_products ....... app/import/actions.ts:81
--   undo_import_batch ......... app/import/actions.ts:98
--   mark_password_changed ..... app (2)
--   admin_revoke_sessions ..... app (1)
--
-- GRUPO B (perdem EXECUTE — nenhum chamador legítimo as invoca com a sessão
-- do utilizador; só compute_price/products_visible, ambas definer, ou triggers):
--   branch_margin, override_value, fx_rate ... as três da fuga
--   round_to, round_up_to .................... só compute_price
--   my_channels .............................. só compute_price e
--                                              products_visible; não está em
--                                              política nenhuma
--   audit, record_exw_version,
--   open_review_on_exw_change,
--   check_activation_requirements ............ funções de trigger; o EXECUTE do
--                                              utilizador é irrelevante (a
--                                              verificação é no CREATE TRIGGER)
--
-- ⚠️ NÃO MEXER NO GRUPO A — medido, não assumido. Numa transacção revertida:
--      revoke execute on function tmsi.has_role(tmsi.role_code)
--        from authenticated, public;
--      -> select count(*) from tmsi.products  ==>  ERRO:
--         "permission denied for function has_role"
--    As expressões de política são avaliadas COMO O UTILIZADOR QUE CONSULTA e o
--    Postgres verifica EXECUTE nessa avaliação. Revogar has_role ao
--    `authenticated` não aperta a fronteira: desliga a aplicação inteira.
--
-- ⚠️ /api/fx-age NÃO chama fx_rate(). Lê tmsi.exchange_rates directamente com
--    a SERVICE_ROLE_KEY (app/src/app/api/fx-age/route.ts:61,67) e replica o
--    WHERE/ORDER BY da função em comentário. Revogar fx_rate não o parte —
--    verificado antes de escrever isto, não deduzido do nome.

--
-- ============================================================================
-- DOIS DONOS — a lição da 0011, medida outra vez e desta vez antes de aplicar
-- ============================================================================
-- As funções de tmsi têm DOIS donos:
--   postgres ....... 20 funções, e NÃO é superuser (rolsuper = false)
--   supabase_admin .. 3 funções — can_read_operational, products_visible,
--                     round_up_to — e é superuser
--
-- Isto muda a migração em dois sítios, e um deles derrubaria o motor:
--
-- 1. compute_price() é do `postgres` e chama round_up_to(), que é do
--    `supabase_admin`. Numa função SECURITY DEFINER, a verificação de EXECUTE
--    das chamadas internas é feita contra O DONO da função, não contra quem a
--    invocou. Hoje o `postgres` só alcança round_up_to() através do PUBLIC —
--    um `REVOKE EXECUTE ... FROM PUBLIC` seco tirar-lhe-ia esse acesso e
--    partiria o cálculo de preços para toda a gente. Mesma coisa para
--    v_products (dona: postgres), que chama products_visible() e
--    can_read_operational(), ambas do supabase_admin.
--    => há um GRANT EXECUTE ... TO postgres explícito, a seguir aos REVOKE.
--
-- 2. ALTER DEFAULT PRIVILEGES aplica-se por PAPEL QUE CRIA o objecto. Um
--    comando sem `FOR ROLE` afecta só os objectos criados por quem o corre
--    (aqui, supabase_admin) — os criados pelo postgres ficariam de fora, que é
--    exactamente o buraco que a 0011 teve de tapar. Hoje há default privileges
--    definidos só para o postgres.
--    => há um ALTER DEFAULT PRIVILEGES para CADA um dos dois donos.

begin;

-- ---------------------------------------------------------------------------
-- 1. (item 59) Fechar a superfície por omissão e reabrir só o que é preciso.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres       in schema tmsi revoke execute on functions from public;
alter default privileges for role supabase_admin in schema tmsi revoke execute on functions from public;

revoke execute on all functions in schema tmsi from public;
revoke execute on all functions in schema tmsi from anon;
revoke execute on all functions in schema tmsi from authenticated;

-- O motor, antes de tudo: sem isto, compute_price() (do postgres) perde o
-- acesso a round_up_to() (do supabase_admin) e v_products perde
-- products_visible()/can_read_operational(). Ver a secção "DOIS DONOS" acima.
grant execute on all functions in schema tmsi to postgres;

-- service_role é a identidade de serviço da app, não uma sessão de utilizador,
-- e já tinha acesso pleno antes desta migração.
grant execute on all functions in schema tmsi to service_role;

-- Grupo A, reaberto um a um. A lista é explícita por desenho: uma função nova
-- no schema fica fechada até alguém a pôr aqui.
grant execute on function tmsi.has_role(tmsi.role_code)            to authenticated;
grant execute on function tmsi.can_read_costs()                    to authenticated;
grant execute on function tmsi.can_read_operational()              to authenticated;
grant execute on function tmsi.my_branches()                       to authenticated;
grant execute on function tmsi.products_visible(text, text[], tmsi.product_status) to authenticated;
grant execute on function tmsi.compute_price(text, tmsi.pricing_scope, text, date) to authenticated;
grant execute on function tmsi.decide_price_proposal(bigint, text, text, uuid)     to authenticated;
grant execute on function tmsi.decide_price_proposal_batch(bigint[], text, text, boolean) to authenticated;
grant execute on function tmsi.run_import_hs_duty(jsonb, boolean, text, text)     to authenticated;
grant execute on function tmsi.run_import_products(jsonb, boolean, text, text)    to authenticated;
grant execute on function tmsi.undo_import_batch(uuid, text)       to authenticated;
grant execute on function tmsi.mark_password_changed()             to authenticated;
grant execute on function tmsi.admin_revoke_sessions(uuid)         to authenticated;

-- ---------------------------------------------------------------------------
-- 2. (item 62) search_path pinado nas quatro primitivas da fronteira.
-- A convenção foi instituída pela 0002 depois de apanhar este defeito em
-- audit(); estas quatro ficaram de fora. Não é explorável hoje (os corpos
-- qualificam tudo, e authenticated/anon não têm CREATE em lado nenhum), mas é
-- a fronteira inteira assente em quatro funções sem o pino.
-- ---------------------------------------------------------------------------
alter function tmsi.has_role(tmsi.role_code)  set search_path = tmsi, pg_temp;
alter function tmsi.can_read_costs()          set search_path = tmsi, pg_temp;
alter function tmsi.my_branches()             set search_path = tmsi, pg_temp;
alter function tmsi.my_channels()             set search_path = tmsi, pg_temp;

-- ---------------------------------------------------------------------------
-- 3. (item 60) decide_price_proposal_batch: verificação de papel à entrada, e
-- o lote só nasce se houver o que decidir.
--
-- O corpo abaixo foi gerado de PRODUÇÃO com pg_get_functiondef() e alterado em
-- exactamente dois sítios (o diff foi revisto pelo Pedro antes de aplicar) —
-- não foi copiado da 0015 nem escrito de memória. A assinatura não muda, logo
-- CREATE OR REPLACE serve e os GRANT da secção 1 continuam válidos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tmsi.decide_price_proposal_batch(p_proposal_ids bigint[], p_decision text, p_reason text DEFAULT NULL::text, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmsi', 'pg_temp'
AS $function$
declare
  v_id bigint;
  v_pr tmsi.price_proposals%rowtype;
  v_eligible bigint[] := '{}';
  v_excluded jsonb := '[]'::jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_before numeric;
  v_after numeric;
  v_key text;
  v_batch_id uuid;
  v_decided_count integer;
begin
  -- 0016 (item 60): verificação de papel à entrada. decide_price_proposal()
  -- sempre levantou Forbidden; esta não verificava nada e protegia-se só pela
  -- classificação de elegibilidade por proposta. Essa classificação aguenta
  -- (medido: 21 ids entregues por um logistics, zero valores devolvidos), mas
  -- deixava qualquer autenticado criar um lote vazio em decision_batches.
  -- branch_manager entra porque a elegibilidade da 0007 já lhe permite decidir
  -- as propostas da sua própria filial — esta migração não altera a 0007.
  if not tmsi.has_role('admin') and not tmsi.has_role('branch_manager') then
    raise exception 'Forbidden';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;
  if p_decision = 'rejected' and (p_reason is null or p_reason = '') then
    raise exception 'A reason is required to reject a batch';
  end if;
  if p_proposal_ids is null or array_length(p_proposal_ids, 1) is null then
    raise exception 'No proposal ids given';
  end if;

  -- classify: eligible vs excluded (with reason), deduplicating the input
  foreach v_id in array (select array_agg(distinct x) from unnest(p_proposal_ids) x) loop
    select * into v_pr from tmsi.price_proposals where id = v_id;
    if v_pr.id is null then
      v_excluded := v_excluded || jsonb_build_object('id', v_id, 'reason', 'not found');
    elsif v_pr.status <> 'pending' then
      v_excluded := v_excluded || jsonb_build_object('id', v_id, 'reason', 'already ' || v_pr.status, 'target_table', v_pr.target_table);
    elsif not (
      tmsi.has_role('admin')
      or (v_pr.branch_id is not null and tmsi.has_role('branch_manager') and v_pr.branch_id = any(tmsi.my_branches()))
    ) then
      v_excluded := v_excluded || jsonb_build_object(
        'id', v_id, 'reason', 'not eligible for your role/branch',
        'target_table', v_pr.target_table, 'branch_id', v_pr.branch_id
      );
    else
      v_eligible := array_append(v_eligible, v_id);
    end if;
  end loop;

  -- legibility (restriction 3): a real before/after per eligible proposal,
  -- not a bare count. "Before" is the same latest-effective lookup
  -- compute_price()/fx_rate()/branch_margin() already use per table — never
  -- a placeholder, never derived from the proposal's own payload.
  foreach v_id in array v_eligible loop
    select * into v_pr from tmsi.price_proposals where id = v_id;
    v_before := null; v_key := null; v_after := null;

    if v_pr.target_table = 'exchange_rates' then
      v_key := v_pr.payload->>'currency';
      v_after := (v_pr.payload->>'rate_per_eur')::numeric;
      select rate_per_eur into v_before from tmsi.exchange_rates
       where currency = (v_pr.payload->>'currency')::char(3) order by effective_date desc, created_at desc limit 1;
    elsif v_pr.target_table = 'interco_fees' then
      v_key := (v_pr.payload->>'supplier_branch') || '->' || (v_pr.payload->>'seller_branch');
      v_after := (v_pr.payload->>'fee')::numeric;
      select fee into v_before from tmsi.interco_fees
       where supplier_branch = v_pr.payload->>'supplier_branch' and seller_branch = v_pr.payload->>'seller_branch'
       order by effective_date desc, created_at desc limit 1;
    elsif v_pr.target_table = 'transport_tiers' then
      v_key := (v_pr.payload->>'branch_id') || '/tier ' || (v_pr.payload->>'tier');
      v_after := (v_pr.payload->>'cost')::numeric;
      select cost into v_before from tmsi.transport_tiers
       where branch_id = v_pr.payload->>'branch_id' and tier = (v_pr.payload->>'tier')::smallint
       order by effective_date desc, created_at desc limit 1;
    elsif v_pr.target_table = 'customs_rates' then
      v_key := (v_pr.payload->>'hs_code') || '/' || (v_pr.payload->>'zone');
      v_after := (v_pr.payload->>'rate')::numeric;
      select rate into v_before from tmsi.customs_rates
       where hs_code = v_pr.payload->>'hs_code' and zone = (v_pr.payload->>'zone')::tmsi.customs_zone
       order by effective_date desc, created_at desc limit 1;
    elsif v_pr.target_table = 'margin_grids' then
      v_key := (v_pr.payload->>'branch_id') || '/tier ' || (v_pr.payload->>'tier');
      v_after := (v_pr.payload->>'margin')::numeric;
      select margin into v_before from tmsi.margin_grids
       where branch_id = v_pr.payload->>'branch_id' and tier = (v_pr.payload->>'tier')::smallint
       order by effective_date desc, created_at desc limit 1;
    elsif v_pr.target_table = 'price_overrides' then
      v_key := (v_pr.payload->>'product_id') || '/' || (v_pr.payload->>'scope_id') || '/' || (v_pr.payload->>'kind');
      v_after := (v_pr.payload->>'value')::numeric;
      select value into v_before from tmsi.price_overrides
       where product_id = v_pr.payload->>'product_id' and scope_type = (v_pr.payload->>'scope_type')::tmsi.pricing_scope
         and scope_id = v_pr.payload->>'scope_id' and kind = (v_pr.payload->>'kind')::tmsi.override_kind
         and valid_from <= current_date and (valid_to is null or valid_to >= current_date)
       order by valid_from desc, created_at desc limit 1;
    elsif v_pr.target_table = 'branch_pricing_params' then
      v_key := (v_pr.payload->>'branch_id') || '/ref_factor';
      v_after := (v_pr.payload->>'ref_factor')::numeric;
      select ref_factor into v_before from tmsi.branch_pricing_params
       where branch_id = v_pr.payload->>'branch_id' order by effective_date desc, created_at desc limit 1;
    elsif v_pr.target_table = 'currency_rounding_params' then
      v_key := (v_pr.payload->>'currency') || '/rounding';
      v_after := (v_pr.payload->>'rounding')::numeric;
      select rounding into v_before from tmsi.currency_rounding_params
       where currency = (v_pr.payload->>'currency')::char(3) order by effective_date desc, created_at desc limit 1;
    end if;

    v_changes := v_changes || jsonb_build_object(
      'id', v_id, 'target_table', v_pr.target_table, 'key', v_key,
      'before', v_before, 'after', v_after, 'reason', v_pr.reason
    );
  end loop;

  if p_dry_run then
    return jsonb_build_object(
      'ok', true, 'dry_run', true,
      'eligible_count', array_length(v_eligible, 1),
      'excluded_count', jsonb_array_length(v_excluded),
      'excluded', v_excluded, 'changes', v_changes
    );
  end if;

  -- commit: atomic by construction — a single function invocation is one
  -- transaction; any exception from decide_price_proposal() (including its
  -- own internal eligibility re-check, or a row decided by someone else
  -- since the preview) aborts everything decided so far in this call too.
  v_decided_count := coalesce(array_length(v_eligible, 1), 0);

  -- 0016 (item 60): o lote só nasce se houver o que decidir. Antes, uma
  -- chamada sem nenhuma proposta elegível deixava na mesma uma linha em
  -- decision_batches com decided_count = 0 — registo de uma decisão que nunca
  -- houve. v_batch_id fica null nesse caso e decide_price_proposal() não é
  -- chamada nenhuma vez, logo nada o recebe.
  if v_decided_count > 0 then
    v_batch_id := gen_random_uuid();
    insert into tmsi.decision_batches (id, decision, reason, decided_count, excluded_count, decided_by)
    values (v_batch_id, p_decision, p_reason, v_decided_count, jsonb_array_length(v_excluded), auth.uid());
  end if;

  foreach v_id in array v_eligible loop
    perform tmsi.decide_price_proposal(v_id, p_decision, p_reason, v_batch_id);
  end loop;

  return jsonb_build_object(
    'ok', true, 'dry_run', false, 'batch_id', v_batch_id,
    'decided_count', v_decided_count, 'excluded_count', jsonb_array_length(v_excluded), 'excluded', v_excluded
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. (item 61) As chaves margin_* de tmsi.settings passam a exigir custos.
--
-- config_read era USING (true): qualquer autenticado lia as 6 chaves, entre
-- elas margin_min, margin_target e margin_good. Não é a margem de um artigo, é
-- a política comercial da casa — e sales/agent, que não lêem mais nenhuma
-- tabela de configuração, liam esta.
--
-- compute_price() lê margin_min/margin_target e NÃO é afectada: é SECURITY
-- DEFINER do postgres, que tem rolbypassrls. O ecrã /config
-- (app/src/app/config/page.tsx:150) lê com a sessão do utilizador, logo um
-- papel sem custos deixa de ver essas três linhas — que é o que se quer.
-- ---------------------------------------------------------------------------
drop policy config_read on tmsi.settings;
create policy config_read on tmsi.settings for select to authenticated
  using (key not like 'margin\_%' or tmsi.can_read_costs());

commit;
