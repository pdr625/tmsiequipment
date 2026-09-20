-- prova-guarda-anon.sql — a guarda do compute_price aguenta SOZINHA?
--
-- Passo §4.15 do docs/VERIFICATION-PROTOCOL.md. Item 64, migração 0017.
--
-- PORQUE É UM PASSO DE PROTOCOLO E NÃO DO SMOKE: com a 0016 por baixo, o anon
-- não tem EXECUTE no compute_price, logo um pedido HTTP leva **401 antes de
-- chegar ao motor**. O smoke (bloco DD) prova essa camada — e é a que protege
-- em produção — mas não consegue, por construção, exercer a guarda que está
-- por trás dela. A única forma de a pôr à prova é conceder EXECUTE ao anon
-- dentro de uma transacção que se reverte.
--
-- PORQUE `SET SESSION AUTHORIZATION` E NÃO `set role anon`: o critério da 0017
-- ancora-se no `session_user`. Um `set role anon` num psql mantém
-- session_user = postgres, logo cai no contexto de SESSÃO DIRECTA e a
-- emulação mentiria — daria "passou" onde o anon real seria negado. Só o
-- SET SESSION AUTHORIZATION reproduz o que o PostgREST faz (liga-se como
-- `authenticator` e faz SET ROLE por cima).
--
-- CADA PAPEL É MEDIDO NO SEU PRÓPRIO ÂMBITO. Um `sales` da filial SA
-- interrogado sobre a filial TBM devolve zero linhas — e isso é correcto, não
-- prova nada. "0 = 0" não diz que a guarda funciona: diz que se escolheu mal o
-- alvo (erro cometido na primeira versão deste script, 2026-09-20). Por isso o
-- `sales` é medido em SA e o `agent` no seu canal APAC, cada um sobre um
-- artigo que serve esse âmbito.
--
-- COMO CORRER (precisa de superuser — supabase_admin, nunca postgres):
--   docker cp scripts/prova-guarda-anon.sql supabase-db:/tmp/p.sql
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/p.sql
--   docker exec supabase-db rm -f /tmp/p.sql
--
-- NADA É COMITADO. Não imprime um único valor: só contagens.

begin;

-- Todos os fictícios activáveis, nunca um real. Sem linhas activas, os papéis
-- de venda não teriam nada que contar.
update tmsi.products set status = 'active'
where id in (
  select p.id from tmsi.products p
  where p.id not like 'T-1%' and p.hs_code is not null and p.gross_weight_kg is not null
    and p.unit is not null
    and ((p.primary_branch='SA' and p.sap_code_sa is not null)
      or (p.primary_branch='TBM' and p.sap_code_cn is not null)
      or (p.primary_branch='CORP' and p.sap_code_us is not null)
      or (p.primary_branch='LTD' and p.sap_code_uk is not null)));

-- Alvo dos papéis de filial (o sales é de SA): artigo activo que serve SA.
select id as art_sa from tmsi.products
where status='active' and ('SA' = any(sold_in) or primary_branch='SA')
order by id limit 1 \gset

-- Alvo do canal APAC (que serve a filial TBM): artigo activo que lá chega.
select id as art_apac from tmsi.products
where status='active' and ('TBM' = any(sold_in) or primary_branch='TBM')
order by id limit 1 \gset

select id as art_draft from tmsi.products
where status='draft' and id like 'T-1%' order by id limit 1 \gset

select user_id as uid_sales from tmsi.user_roles where role='sales' limit 1 \gset
select user_id as uid_agent from tmsi.user_roles where role='agent' limit 1 \gset

-- Destrancar o motor ao anon: é exactamente o que a 0016 proíbe, e é o que
-- permite descobrir se a guarda de dentro aguenta sem essa protecção.
grant execute on function tmsi.compute_price(text, tmsi.pricing_scope, text, date) to anon;

\echo ''
\echo '=== (A) anon REAL (session_user=authenticator), SEM claims — o par perigoso (1)/(3) ==='
set session authorization authenticator;
set role anon;
select set_config('request.jwt.claims', '', true) as _;
select 'draft/SA   ' as caso, count(*) linhas, count(total_cost) com_custo, count(min_price) com_preco
from tmsi.compute_price(:'art_draft', 'branch', 'SA');
select 'activo/SA  ' as caso, count(*) linhas, count(total_cost) com_custo, count(min_price) com_preco
from tmsi.compute_price(:'art_sa', 'branch', 'SA');
select 'activo/APAC' as caso, count(*) linhas, count(total_cost) com_custo, count(min_price) com_preco
from tmsi.compute_price(:'art_apac', 'channel', 'APAC');
reset role;
reset session authorization;

\echo ''
\echo '=== (B) anon REAL, com claims {"role":"anon"} (o caminho 3b) ==='
set session authorization authenticator;
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) as _;
select 'activo/SA  ' as caso, count(*) linhas, count(total_cost) com_custo, count(min_price) com_preco
from tmsi.compute_price(:'art_sa', 'branch', 'SA');
select 'activo/APAC' as caso, count(*) linhas, count(total_cost) com_custo, count(min_price) com_preco
from tmsi.compute_price(:'art_apac', 'channel', 'APAC');
reset role;
reset session authorization;

\echo ''
\echo '=== (C) sales AUTENTICADO, caminho real, na SUA filial ==='
set session authorization authenticator;
select set_config('request.jwt.claims', json_build_object('sub', :'uid_sales', 'role','authenticated')::text, true) as _;
set role authenticated;
select 'draft/SA   ' as caso, count(*) linhas, count(total_cost) com_custo, count(min_price) com_preco
from tmsi.compute_price(:'art_draft', 'branch', 'SA');
select 'activo/SA  ' as caso, count(*) linhas, count(total_cost) com_custo, count(min_price) com_preco
from tmsi.compute_price(:'art_sa', 'branch', 'SA');
reset role;
reset session authorization;

\echo ''
\echo '=== (D) sales EMULADO por psql (session_user=postgres) — tem de dar o mesmo que (C) ==='
select set_config('request.jwt.claims', json_build_object('sub', :'uid_sales', 'role','authenticated')::text, true) as _;
set local role authenticated;
select 'draft/SA   ' as caso, count(*) linhas, count(total_cost) com_custo, count(min_price) com_preco
from tmsi.compute_price(:'art_draft', 'branch', 'SA');
select 'activo/SA  ' as caso, count(*) linhas, count(total_cost) com_custo, count(min_price) com_preco
from tmsi.compute_price(:'art_sa', 'branch', 'SA');
reset role;

\echo ''
\echo '=== (C2) agent AUTENTICADO, caminho real, no SEU canal ==='
set session authorization authenticator;
select set_config('request.jwt.claims', json_build_object('sub', :'uid_agent', 'role','authenticated')::text, true) as _;
set role authenticated;
select 'activo/APAC' as caso, count(*) linhas, count(total_cost) com_custo, count(min_price) com_preco
from tmsi.compute_price(:'art_apac', 'channel', 'APAC');
reset role;
reset session authorization;

\echo ''
\echo '=== (D2) agent EMULADO por psql — tem de dar o mesmo que (C2) ==='
select set_config('request.jwt.claims', json_build_object('sub', :'uid_agent', 'role','authenticated')::text, true) as _;
set local role authenticated;
select 'activo/APAC' as caso, count(*) linhas, count(total_cost) com_custo, count(min_price) com_preco
from tmsi.compute_price(:'art_apac', 'channel', 'APAC');
reset role;

\echo ''
\echo '=== (E) sessão directa sem claims — acesso pleno (smoke A/B, provas de motor) ==='
select set_config('request.jwt.claims', '', true) as _;
select 'activo/SA  ' as caso, count(*) linhas, count(total_cost) com_custo, count(min_price) com_preco
from tmsi.compute_price(:'art_sa', 'branch', 'SA');

\echo ''
\echo '=== VEREDICTO ESPERADO ==='
\echo '(A) e (B): TODOS a 0 linhas — e 0, nao uma linha mascarada, porque a'
\echo '           guarda do see_sell dispara primeiro: o anon nao tem papel'
\echo '           nenhum, logo nem sequer lado de venda.'
\echo '(C) = (D): draft 0 ; activo/SA 1 linha, com_custo=0, com_preco=1'
\echo '(C2)=(D2): activo/APAC 1 linha, com_custo=0, com_preco=1'
\echo '           (a igualdade prova que a emulacao por psql nao mente)'
\echo '(E)      : activo/SA 1 linha, com_custo=1 — acesso pleno'
\echo ''

rollback;
