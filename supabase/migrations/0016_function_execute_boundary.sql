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

begin;

-- ---------------------------------------------------------------------------
-- 1. (item 59) Fechar a superfície por omissão e reabrir só o que é preciso.
--
-- ALTER DEFAULT PRIVILEGES só afecta objectos FUTUROS — as funções que hoje
-- têm PUBLIC precisam de REVOKE explícito, e é o que se faz a seguir.
-- ---------------------------------------------------------------------------
alter default privileges in schema tmsi revoke execute on functions from public;

revoke execute on all functions in schema tmsi from public;
revoke execute on all functions in schema tmsi from anon;
revoke execute on all functions in schema tmsi from authenticated;

-- Grupo A, reaberto um a um. A lista é explícita por desenho: acrescentar uma
-- função nova ao schema deixa-a fechada até alguém a pôr aqui, que é o
-- comportamento que se quer.
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

-- service_role mantém tudo: é a identidade de serviço da app, não uma sessão
-- de utilizador, e já tinha acesso pleno antes desta migração.
grant execute on all functions in schema tmsi to service_role;

-- ---------------------------------------------------------------------------
-- 2. (item 62) search_path pinado nas quatro primitivas da fronteira.
--
-- A convenção foi instituída pela 0002 depois de apanhar exactamente este
-- defeito em audit(), e estas quatro ficaram de fora. Não é explorável hoje
-- (os corpos qualificam tudo, e authenticated/anon não têm CREATE em public,
-- tmsi, auth nem na base — não há onde plantar um objecto que capture um
-- nome), mas é a fronteira inteira a assentar em quatro funções sem o pino.
-- ---------------------------------------------------------------------------
alter function tmsi.has_role(tmsi.role_code)  set search_path = tmsi, pg_temp;
alter function tmsi.can_read_costs()          set search_path = tmsi, pg_temp;
alter function tmsi.my_branches()             set search_path = tmsi, pg_temp;
alter function tmsi.my_channels()             set search_path = tmsi, pg_temp;

-- ---------------------------------------------------------------------------
-- 3. (item 60) Verificação de papel ao topo da decisão em lote.
--
-- decide_price_proposal() levanta Forbidden; a versão em lote não verificava
-- nada e protegia-se só pela classificação de elegibilidade por proposta. Essa
-- classificação AGUENTA — medido com logistics, incluindo o caso adversarial
-- de lhe entregar os 21 ids (20 dos quais a RLS lhe esconde): changes a zero,
-- 21 excluídos, nenhum campo de valor, decided_count 0. Mas criava uma linha
-- vazia em tmsi.decision_batches, atribuída a quem chamou, sem ter decidido
-- nada. Passa a recusar à entrada, e o lote só nasce se houver o que decidir.
--
-- ⚠️ CREATE OR REPLACE não pode mudar a lista de parâmetros (0007 estabeleceu
-- o padrão, 0009/0015 repetiram-no) — mas aqui a assinatura NÃO muda, logo
-- CREATE OR REPLACE serve e evita ter de repetir os GRANT.
-- ---------------------------------------------------------------------------
-- NOTA PARA A REVISÃO: o corpo completo da função entra aqui, copiado da 0015
-- com duas alterações cirúrgicas e nada mais:
--   (a) logo a seguir ao `begin`:
--         if not tmsi.has_role('admin') and not tmsi.has_role('branch_manager') then
--           raise exception 'Forbidden';
--         end if;
--       (branch_manager entra porque a elegibilidade por proposta já lhe
--        permite decidir as da sua própria filial — a 0007 é que manda, e
--        esta migração não a altera)
--   (b) o `insert into tmsi.decision_batches` passa a correr só quando
--       `v_eligible_count > 0`, e o `decision_batch_id` fica null quando não há
--       nada a decidir.
-- Não o transcrevo aqui por não o querer escrever de memória: na aplicação,
-- é copiado de supabase/migrations/0015_batch_decision.sql:217 e alterado
-- nesses dois pontos, com o resto byte a byte igual.

-- ---------------------------------------------------------------------------
-- 4. (item 61) As chaves margin_* de tmsi.settings passam a exigir custos.
--
-- config_read era USING (true): qualquer autenticado lia as 6 chaves, entre
-- elas margin_min, margin_target e margin_good. Não é a margem de um artigo, é
-- a política comercial da casa — e sales/agent, que não lêem mais nenhuma
-- tabela de configuração, liam esta.
--
-- compute_price() lê margin_min/margin_target e NÃO é afectada: é SECURITY
-- DEFINER do postgres, que tem rolbypassrls.
-- O ecrã /config (app/src/app/config/page.tsx:150) lê a tabela com a sessão do
-- utilizador: um papel sem custos deixa de ver essas três linhas, e é isso que
-- se quer.
-- ---------------------------------------------------------------------------
drop policy config_read on tmsi.settings;
create policy config_read on tmsi.settings for select to authenticated
  using (key not like 'margin\_%' or tmsi.can_read_costs());

commit;

-- ============================================================================
-- PROVA OBRIGATÓRIA DEPOIS DE APLICAR (exigida pelo Pedro, 2026-09-20)
-- ============================================================================
-- 1. Impressão digital de v_branch_prices IDÊNTICA antes/depois, POR PAPEL,
--    incluindo sales e agent com artigos fictícios activos — é a prova de que
--    a revogação não partiu o motor para quem tem de ver preços:
--      select md5(string_agg(product_id||branch_id||coalesce(min_price::text,'-')
--                            ||coalesce(ref_price::text,'-'),
--                            ',' order by product_id, branch_id, scope_type))
--      from tmsi.v_branch_prices;
-- 2. Os três POST a darem recusa, pela API real, com JWT de logistics/sales/agent:
--      POST /rest/v1/rpc/branch_margin   -> 4xx
--      POST /rest/v1/rpc/override_value  -> 4xx
--      POST /rest/v1/rpc/fx_rate         -> 4xx  (e sem credencial também)
-- 3. Smoke com asserções negativas para os três RPC, verde nos três modos.
-- 4. Execução n.º 4 do protocolo.
-- 5. Nenhuma activação de artigo real antes de 1-4 estarem verdes.
