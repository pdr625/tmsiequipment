-- 0021 — `tmsi.me()`, metadados do artigo na vista de custos, aviso operacional só do admin, sem TRUNCATE.
--
-- Escrita a 2026-09-24; revista e aprovada pelo Pedro no mesmo dia (o ficheiro
-- traz as decisões dele nas secções 2, 3 e 4).
--
-- Origem: itens 75, 76 e 80 do BACKLOG. Objectivo medido: a página `/prices`
-- faz **8 pedidos** ao backend por carregamento; com esta migração e o commit
-- de app que a segue, **5** (`me`, `v_branch_prices`, `branches`, `channels`,
-- `v_current_branding`). O middleware e o fluxo de refresh de sessão NÃO se
-- tocam (decisão do item 76).
--
-- ============================================================================
-- 1. `tmsi.me()` — a identidade de quem chama, numa só chamada (item 76)
-- ============================================================================
-- Devolve UMA linha: `user_id`, `full_name`, `roles[]`, `can_read_costs`,
-- `can_read_operational`, `branches[]`, `channels[]`, `must_change_password`.
-- Substitui, na página, `auth.getUser()` + `profiles` + `can_read_costs()`.
--
-- SECURITY INVOKER — e não é escolha estética, está verificado:
--   * `profiles_self` e `roles_self` deixam cada utilizador ler a SUA linha
--     (`user_id = auth.uid()`), logo o invoker chega;
--   * as quatro funções de apoio (`can_read_costs`, `can_read_operational`,
--     `my_branches`, `my_channels`) são reutilizadas tal como estão — nenhuma
--     lógica duplicada. Continuam DEFINER com `search_path` pinado, e é
--     nelas que a decisão de papel vive.
-- ⚠️ As políticas `*_self` acrescentam `OR has_role('admin')`: um admin, a ler
-- `profiles`/`user_roles` como invoker, veria TODAS as linhas. Por isso o
-- `me()` filtra sempre por `= auth.uid()` explicitamente (o mesmo motivo do
-- `.eq('user_id', …)` que a página já tinha). É a fronteira desta função e é
-- o que a célula nova do protocolo («`me()` devolve só o próprio») prova.
--
-- ⚠️ ÚNICO ALARGAMENTO DA SUPERFÍCIE RPC: `my_channels()` não tinha EXECUTE a
-- `authenticated` (0016 concedeu `my_branches` e deixou de fora a irmã). Um
-- invoker precisa dele para a chamar, logo esta migração concede-o. O
-- chamador conhecido é o `me()` (CLAUDE.md: «antes de conceder, procura o
-- chamador»). Não abre informação nova: devolve os canais do PRÓPRIO
-- `user_roles`, que a `roles_self` já deixa ler — é a `my_branches`, com
-- outro nome de coluna. A alternativa era `me()` DEFINER; preferi não
-- passar a leitura das duas tabelas para fora da RLS por causa de um grant.
--
-- `anon`: sem EXECUTE (a guarda da convenção obriga: nenhuma função de `tmsi`
-- com PUBLIC/anon). Um pedido sem sessão é recusado ao nível do privilégio,
-- como todas as outras funções. Defesa em profundidade: se um dia lá
-- chegasse uma sessão sem `auth.uid()`, o corpo devolve ZERO linhas, nunca
-- erro e nunca uma linha de identidade vazia.
--
-- Uma conta sem linha em `profiles` ainda recebe a sua linha (nome nulo,
-- `must_change_password` falso): a identidade vem do JWT, não do perfil.
--
-- ============================================================================
-- 2. `v_branch_prices` — `name`, `category_id`, `status`, `item_type` (item 75)
-- ============================================================================
-- Só projecção, como a 0020. `p` já está em âmbito nos dois braços; não há
-- junção nova nem `LATERAL` novo. Com isto a app deixa de pedir `v_products`.
--
-- ⚠️ DESVIO ao que foi pedido, a rever: pediram-se `product_name` e
-- `category`, e só nas duas vistas. O que está aqui:
--   * `v_selling_prices` JÁ projecta `name`, `category_id`, `status` e
--     `item_type` (lê de `products` por junção própria). Não precisa de
--     mudar, e NÃO é recriada — uma recriação a menos é uma reloption a menos
--     em risco. Ao contrário do que o item 75 descrevia (só se referia à
--     `v_branch_prices`), nada há a acrescentar lá.
--   * Os nomes são os que `v_selling_prices` já usa, para as duas vistas
--     terem a mesma forma e o ecrã tratar as linhas por um só tipo.
--   * São QUATRO colunas e não duas: o ecrã também filtra por `status`
--     (por omissão só `active`) e decide o `Alert` por `item_type` (item 67).
--     Com só nome e categoria o `v_products` continuaria a ser preciso, e o
--     objectivo dos 5 pedidos não se cumpria.
--   * `category_id` (o código) e não o nome da categoria: é o que o ecrã e o
--     export usam para ordenar, e evita uma junção a `categories`.
--
-- A RLS não é obstáculo: `authenticated` já tem SELECT de coluna em `name`,
-- `category_id`, `status` e `item_type` (0003) — é o que `v_selling_prices`
-- usa hoje como invoker. E as linhas que cada papel vê não mudam, só as
-- colunas.
--
-- ACEITAÇÃO: contagens idênticas por papel em todas as vistas; impressão
-- digital de `v_branch_prices` **sobre as 20 colunas que já existiam**
-- idêntica por papel — as colunas novas ficam FORA do md5 de propósito, senão
-- ele mudaria por definição (o que se prova é que nada do que já existia se
-- mexeu); e `reloptions`, dono e ACL das cinco vistas inalterados.
--
-- ============================================================================
-- 3. `settings` — o `finance` deixa de poder escrever o aviso operacional (item 80)
-- ============================================================================
-- ⚠️ A INSTRUÇÃO ERA «escrita em `settings` passa a admin-only, e se o finance
-- escrever alguma chave legitimamente pela app, diz-me antes de fechar».
-- ESCREVE: seis. O `/config` mostra ao `finance` um formulário por cada uma
-- (`updateSetting`, gate `canManageFinanceConfig` = admin OU finance):
-- `margin_good`, `margin_min`, `margin_target`, `fx_tolerance`, `fx_source`,
-- `review_days`. Fechar a tabela toda ao admin partiria isso — o ecrã continuaria
-- a desenhar os formulários e todos falhariam.
--
-- O que fecha o item 80 é só a sétima chave: `operational_price_notice`. A
-- proposta abaixo é essa: admin escreve tudo; finance escreve tudo EXCEPTO
-- essa chave. Uma linha (`ALTER POLICY`), no mesmo predicado. A alternativa
-- «admin-only na tabela toda» está comentada a seguir, e só é correcta se o
-- Pedro decidir que o finance perde também os limiares de margem.
-- DECIDIDO pelo Pedro (2026-09-24): a variante do aviso, e só ela.
--
-- Decisão do Pedro (2026-09-24): fechar só o aviso, e registar no BACKLOG a
-- assimetria dos limiares de margem — o finance escreve-os por escrita directa,
-- sem proposta nem aprovação, ao contrário de tudo o resto que mexe em preço.
--
-- ============================================================================
-- 4. `TRUNCATE` — retirado a `authenticated` e `anon` em todas as tabelas de tmsi
-- ============================================================================
-- Medido a 2026-09-24: `authenticated` tinha TRUNCATE em **26 tabelas e 4
-- vistas** de `tmsi` (não só em `settings`, `profiles` e `user_roles`), porque
-- o `pg_default_acl` do `postgres` em `tmsi` concede `arwdDxt` a tabelas novas.
-- `TRUNCATE` não passa pela RLS. Não é alcançável por HTTP — o PostgREST não o
-- expõe, e nenhum código da app ou do smoke o usa (grep) — mas fica uma tabela
-- inteira a um pedido SQL directo de distância, e é o tipo de coisa que uma
-- versão futura do PostgREST mudaria. Três passos: `REVOKE` nas existentes;
-- `ALTER DEFAULT PRIVILEGES` para as futuras (aqui funciona, ao contrário do
-- caso do PUBLIC do item 65: revoga-se uma entrada que EXISTE em
-- `pg_default_acl`, não o privilégio built-in); e a guarda passa a verificar
-- que nenhuma tabela de `tmsi` o tem, para `authenticated`, `anon` ou PUBLIC.
-- `TRIGGER` e `REFERENCES` ficam como estão: não fazem parte desta decisão.

begin;

-- ===========================================================================
-- 1. tmsi.me()
-- ===========================================================================
create function tmsi.me()
returns table (
  user_id              uuid,
  full_name            text,
  roles                text[],
  can_read_costs       boolean,
  can_read_operational boolean,
  branches             text[],
  channels             text[],
  must_change_password boolean
)
language sql
stable
security invoker
set search_path = tmsi, pg_temp
as $$
  select u.id,
         p.full_name,
         coalesce((select array_agg(distinct r.role::text order by r.role::text)
                     from tmsi.user_roles r
                    where r.user_id = u.id), '{}'::text[]),
         tmsi.can_read_costs(),
         tmsi.can_read_operational(),
         tmsi.my_branches(),
         tmsi.my_channels(),
         coalesce(p.must_change_password, false)
    from (select auth.uid() as id) u
    left join tmsi.profiles p on p.user_id = u.id
   where u.id is not null
$$;

revoke all on function tmsi.me() from public, anon;
grant execute on function tmsi.me() to authenticated;

-- O invoker precisa de EXECUTE nas funções que chama (ver o cabeçalho, §1).
grant execute on function tmsi.my_channels() to authenticated;


-- ===========================================================================
-- 2. v_branch_prices — quatro colunas no fim (item 75)
-- ===========================================================================
-- Corpo: `pg_get_viewdef('tmsi.v_branch_prices')` contra a base viva em
-- 2026-09-24, mais **quatro colunas anexadas ao fim** de cada braço do UNION
-- (é o que o `CREATE OR REPLACE VIEW` permite: só acrescentar, no fim). Nada
-- mais mudou — nem o LATERAL, nem os filtros, nem `b.id`/`ch.id AS branch_id`.
-- `WITH (security_invoker = true)` outra vez, pela lição da 0020.
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
    c.scope_type,
    p.name,
    p.category_id,
    p.status,
    p.item_type
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
    c.scope_type,
    p.name,
    p.category_id,
    p.status,
    p.item_type
   FROM tmsi.products p
     CROSS JOIN tmsi.channels ch
     CROSS JOIN LATERAL tmsi.compute_price(p.id, 'channel'::tmsi.pricing_scope, ch.id) c(product_id, branch_id, currency, fx_used, exw_local, fee, interco, transport, duty_rate, duty, total_cost, total_cost_eur, margin, list_coef, min_price, ref_price, alert, overrides, errors, scope_type)
  WHERE ch.active AND ((ch.branch_id = ANY (p.sold_in)) OR ch.branch_id = p.primary_branch);

-- ===========================================================================
-- 3. settings.config_write
-- ===========================================================================
-- ANTES (0016, `pg_policies` em 2026-09-24):
--   USING / WITH CHECK:  has_role('admin') OR has_role('finance')
--
-- DEPOIS (proposta — admin tudo; finance tudo menos o aviso operacional).
-- O `WITH CHECK` cobre também o renomear: o finance não pode passar outra
-- chave a chamar-se `operational_price_notice`.
alter policy config_write on tmsi.settings
  using      (tmsi.has_role('admin'::tmsi.role_code)
              or (tmsi.has_role('finance'::tmsi.role_code) and key <> 'operational_price_notice'))
  with check (tmsi.has_role('admin'::tmsi.role_code)
              or (tmsi.has_role('finance'::tmsi.role_code) and key <> 'operational_price_notice'));

-- ===========================================================================
-- 4. TRUNCATE
-- ===========================================================================
revoke truncate on all tables in schema tmsi from authenticated, anon;
alter default privileges for role postgres in schema tmsi
  revoke truncate on tables from authenticated, anon;

-- ---------------------------------------------------------------------------
-- A guarda da convenção (CLAUDE.md, item 65): esta migração CRIA uma função,
-- por isso a guarda é obrigatória e não de cortesia.
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

-- A guarda das reloptions, nos dois sentidos (CLAUDE.md, 0020).
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

-- A guarda do TRUNCATE: nenhuma tabela ou vista de `tmsi` o concede a
-- authenticated, anon ou PUBLIC. (grantee 0 = PUBLIC.)
do $$
declare v_abertas text;
begin
  select string_agg(distinct c.relname, ', ' order by c.relname) into v_abertas
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where n.nspname = 'tmsi' and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and a.privilege_type = 'TRUNCATE'
    and (a.grantee = 0 or a.grantee = 'authenticated'::regrole or a.grantee = 'anon'::regrole);
  if v_abertas is not null then
    raise exception 'Tabelas de tmsi com TRUNCATE a authenticated/anon/PUBLIC: %', v_abertas;
  end if;
end $$;

-- Guardas próprias desta migração: (i) o filtro continua a descer (item 69) —
-- a projecção de `branch_id` não pode ter voltado à função; (ii) `me()` é
-- invoker; (iii) a política de `settings` tem mesmo a cláusula nova.
do $$
begin
  if pg_get_viewdef('tmsi.v_branch_prices'::regclass, true) like '%c.branch_id%' then
    raise exception 'v_branch_prices voltou a projectar c.branch_id — o filtro deixa de descer (item 69)';
  end if;
  if (select prosecdef from pg_proc where oid = 'tmsi.me()'::regprocedure) then
    raise exception 'tmsi.me() ficou SECURITY DEFINER — devia ser invoker';
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'tmsi' and tablename = 'settings' and policyname = 'config_write'
                   and qual like '%operational_price_notice%' and with_check like '%operational_price_notice%') then
    raise exception 'settings.config_write não tem a exclusão do aviso operacional';
  end if;
end $$;

commit;
