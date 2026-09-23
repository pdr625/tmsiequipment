-- 0020 — o filtro de âmbito passa a descer antes do LATERAL.
--
-- PROPOSTA. Escrita a 2026-09-23, NÃO APLICADA — o Pedro revê primeiro.
--
-- Origem: item 69. `/prices?branch=APAC` dava `canceling statement due to
-- statement timeout` (8 s no `authenticated`).
--
-- ============================================================================
-- A CAUSA, LIDA NO PLANO
-- ============================================================================
-- `v_branch_prices` projectava `c.branch_id` — a coluna de **saída** de
-- `tmsi.compute_price`. O filtro da app (`.eq('branch_id','APAC')`) só podia
-- ser aplicado **depois** de a função correr, porque nada diz ao planeador que
-- `compute_price(_, 'branch', b.id).branch_id = b.id`: para ele a função é
-- opaca. No plano de 2026-09-23 isto aparecia assim:
--
--     ->  Function Scan on compute_price c (actual rows=0 loops=229)
--           Filter: (branch_id = 'APAC'::text)
--           Buffers: shared hit=9214
--
-- **229 execuções para produzir ZERO linhas** — `APAC` é um canal e nunca pode
-- sair como `branch_id` do braço de filial. Eram 76% dos buffers do pedido
-- gastos em trabalho deitado fora por construção. E não era só o APAC: **todo**
-- o pedido a `/prices`, filtrado ou não, executava as 283 chamadas. Filtrar não
-- comprava nada.
--
-- ============================================================================
-- A CORRECÇÃO, E PORQUE É SEGURA
-- ============================================================================
-- Projectar o id da tabela que **conduz** o `LATERAL` em vez do que a função
-- devolve:
--
--     c.branch_id   ->   b.id  AS branch_id     (braço de filial)
--     c.branch_id   ->   ch.id AS branch_id     (braço de canal)
--
-- Assim `branch_id` passa a ser uma coluna de `tmsi.branches` / `tmsi.channels`,
-- e o planeador pode empurrar o filtro para o scan dessas tabelas — **antes** de
-- `compute_price` correr uma única vez.
--
-- **A igualdade que isto assume está MEDIDA, não suposta** (2026-09-23): nas
-- 283 linhas que a vista produz, `c.branch_id` é **sempre** igual ao âmbito que
-- conduz o `LATERAL`. Zero excepções. A consulta que o verificou está no item 69
-- do BACKLOG e pode ser re-executada.
--
-- **Não há perda de linhas.** É um `CROSS JOIN LATERAL`: se `compute_price` não
-- devolver linha (guardas de papel, de estado, de dados em falta), não há linha
-- de saída — independentemente do que se projecta. A projecção só decide o
-- **valor** da coluna, e esse valor é, comprovadamente, o mesmo.
--
-- ============================================================================
-- ÂMBITO: SÓ A PROJECÇÃO
-- ============================================================================
-- `tmsi.compute_price` **não muda uma linha**. Nenhum valor de preço, custo ou
-- margem muda — e é essa a condição de aceitação: a impressão digital de
-- `v_branch_prices` tem de ficar **IDÊNTICA por papel**. Isto é desempenho; se
-- algum valor mudar, é defeito, não melhoria.
--
-- `tmsi.v_selling_prices` **herda**: lê de `v_branch_prices` e projecta
-- `v.branch_id`, que passa a ser a coluna empurrável. É a vista que `sales` e
-- `agent` usam, logo é a que mais beneficia — e a que o item 68 mostrou ser
-- fácil de esquecer. Verificado no ensaio, não assumido.
--
-- `security_invoker=true`, dono `postgres` e os grants existentes
-- (`authenticated`, `service_role`) são preservados: `CREATE OR REPLACE VIEW`
-- não lhes toca, e o ensaio confirma-o.
--
-- O QUE ESTA MIGRAÇÃO **NÃO** RESOLVE: o pedido sem filtro ("All branches")
-- continua a executar as 283 chamadas, porque aí não há filtro para descer. É
-- custo legítimo — está a pedir-se tudo. Fica registado como o gatilho da
-- eventual `price_cache` (item 71), não como defeito desta.

begin;

-- ⚠️ `WITH (security_invoker = true)` É OBRIGATÓRIO AQUI, e falta dele foi um
-- erro cometido e corrigido nesta própria migração (2026-09-23).
--
-- `CREATE OR REPLACE VIEW` **reinicia as reloptions**: sem esta cláusula a
-- vista perde o `security_invoker` e passa a correr como o dono (`postgres`,
-- que tem `BYPASSRLS`). Medido: a RLS da `tmsi.products` deixa de ser aplicada
-- e o `Filter` com `products_visible()` desaparece do plano.
--
-- Não houve fuga — as contagens por papel mantiveram-se, porque as guardas
-- internas do `compute_price` (`see_sell`/`see_costs`) são a restrição que
-- vincula para os papéis de venda. Mas a primeira das duas camadas tinha
-- desaparecido, e foi precisamente isso que as 0016/0017 ensinaram a não
-- aceitar.
--
-- **Porque o ensaio não o apanhou:** comparava impressões digitais, e essas
-- ficaram idênticas — o `compute_price` mascarava a diferença. Um ensaio que
-- compara só o RESULTADO não vê uma mudança em COMO o resultado é protegido.
-- Daí a asserção nova no smoke (bloco HH) verificar também as reloptions.
create or replace view tmsi.v_branch_prices with (security_invoker = true) as
SELECT c.product_id,
    b.id AS branch_id,
    c.currency,
    c.fx_used,
    c.exw_local,
    c.fee,
    c.interco,
    c.transport,
    c.duty_rate,
    c.duty,
    c.total_cost,
    c.total_cost_eur,
    c.margin,
    c.list_coef,
    c.min_price,
    c.ref_price,
    c.alert,
    c.overrides,
    c.errors,
    c.scope_type
   FROM tmsi.products p
     CROSS JOIN tmsi.branches b
     CROSS JOIN LATERAL tmsi.compute_price(p.id, 'branch'::tmsi.pricing_scope, b.id) c(product_id, branch_id, currency, fx_used, exw_local, fee, interco, transport, duty_rate, duty, total_cost, total_cost_eur, margin, list_coef, min_price, ref_price, alert, overrides, errors, scope_type)
  WHERE (b.id = ANY (p.sold_in)) OR b.id = p.primary_branch
UNION ALL
 SELECT c.product_id,
    ch.id AS branch_id,
    c.currency,
    c.fx_used,
    c.exw_local,
    c.fee,
    c.interco,
    c.transport,
    c.duty_rate,
    c.duty,
    c.total_cost,
    c.total_cost_eur,
    c.margin,
    c.list_coef,
    c.min_price,
    c.ref_price,
    c.alert,
    c.overrides,
    c.errors,
    c.scope_type
   FROM tmsi.products p
     CROSS JOIN tmsi.channels ch
     CROSS JOIN LATERAL tmsi.compute_price(p.id, 'channel'::tmsi.pricing_scope, ch.id) c(product_id, branch_id, currency, fx_used, exw_local, fee, interco, transport, duty_rate, duty, total_cost, total_cost_eur, margin, list_coef, min_price, ref_price, alert, overrides, errors, scope_type)
  WHERE ch.active AND ((ch.branch_id = ANY (p.sold_in)) OR ch.branch_id = p.primary_branch);


-- ---------------------------------------------------------------------------
-- A guarda da convenção (CLAUDE.md, item 65).
--
-- Esta migração não cria funções — mas a guarda corre na mesma, porque custa
-- nada e o dia em que alguém acrescentar uma função a uma migração de vistas é
-- precisamente o dia em que ninguém se vai lembrar disto.
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

-- A guarda das reloptions (convenção do CLAUDE.md, 2026-09-23). Nos dois
-- sentidos: uma vista que devia ser invoker e deixou de o ser é uma camada de
-- RLS perdida; uma que NÃO devia sê-lo e passou a sê-lo parte o mascaramento
-- de colunas da 0003, que precisa de correr como dono.
do $$
declare v_mau text;
begin
  select string_agg(e.nome || ': esperado ' || case when e.invoker then 'invoker' else 'dono' end, ', ')
    into v_mau
  from (values ('v_branch_prices', true), ('v_selling_prices', true), ('v_current_branding', true),
               ('v_products', false), ('v_audit_log', false)) e(nome, invoker)
  join pg_class v on v.relname = e.nome
  join pg_namespace n on n.oid = v.relnamespace and n.nspname = 'tmsi'
  where (coalesce(array_to_string(v.reloptions, ','), '') like '%security_invoker=true%') is distinct from e.invoker;
  if v_mau is not null then
    raise exception 'reloptions erradas depois de recriar vista(s): %', v_mau;
  end if;
end $$;

-- E a guarda própria desta migração: se a projecção voltar a sair da função,
-- o filtro deixa de descer em silêncio e o item 69 regressa sem ninguém dar
-- por isso.
do $$
begin
  if pg_get_viewdef('tmsi.v_branch_prices'::regclass, true) like '%c.branch_id%' then
    raise exception 'v_branch_prices voltou a projectar c.branch_id — o filtro deixa de descer (item 69)';
  end if;
end $$;

commit;
