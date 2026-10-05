-- 0022 — `tmsi.audit_log`: nunca mais autor nulo (item 94).
--
-- Escrita a 2026-10-05; decisão do Pedro registada no item 94 («as rotinas de manutenção passam a assinar com uma
-- identidade `system` reconhecível, um UUID fixo documentado, nunca `null`»).
--
-- O problema, medido: 3314 de 6633 linhas do `audit_log` tinham `actor` nulo, e a contagem crescia todos os dias
-- (98 a 3/out, 210 a 4/out, 351 a 5/out). Vêm TODAS de sessões directas à base de dados sem claims — o `smoke.py` a limpar
-- o seu fixture, migrações, manutenção, cascatas (a eliminação de uma conta no item 57) — porque o gatilho `audit()`
-- grava `auth.uid()`, que é nulo fora de um pedido HTTP. As 7 identidades que assinam são todas HTTP reais: o caminho
-- da aplicação já assinava sempre bem.
--
-- A solução está no gatilho, não nos scripts: se não há sessão autenticada, assina como `system`. Assim nenhuma sessão
-- directa futura — do smoke, minha ou de ninguém — volta a produzir nulos, sem ensinar cada rotina a assinar.
--
-- ============================================================================
-- Decisões (a confirmar; nenhuma reescreve o passado)
-- ============================================================================
-- (a) O UUID de `system` é 00000000-0000-0000-0000-000000000001: fixo, documentado, e NÃO é um utilizador (não existe
--     em `auth.users`; `audit_log.actor` não tem chave estrangeira, por isso não precisa de existir). Um UUID aleatório
--     nunca começa por 24 zeros, logo não colide com uma conta real. Está também em `app/src/lib/system-actor.ts`; o
--     smoke compara os dois.
-- (b) O HISTÓRICO NÃO SE REESCREVE. As 3314 linhas com `actor` nulo ficam como estão: alterar linhas de um registo de
--     auditoria é a última coisa que um registo de auditoria deve fazer em silêncio. A página `/audit` mostra os nulos
--     antigos como «system (legacy, no identity)». Se o Pedro quiser relabelá-los, é um passo à parte, deliberado.
-- (c) «Nunca nulo» impõe-se com uma restrição `NOT VALID`: vale para as linhas NOVAS e não valida as antigas.
--
-- Esta migração recria funções em `tmsi`: termina com `REVOKE` explícito e a guarda do CLAUDE.md (item 65).

begin;

-- ----------------------------------------------------------------------------
-- 1. A identidade `system`
-- ----------------------------------------------------------------------------
create or replace function tmsi.system_actor()
returns uuid
language sql
immutable
parallel safe
as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;

comment on function tmsi.system_actor() is
  'UUID fixo do autor «system» no audit_log: escritas directas à base de dados, sem sessão autenticada (manutenção, '
  'smoke, migrações, cascatas). Não é um utilizador. Item 94. Espelho em app/src/lib/system-actor.ts.';

-- Só o gatilho (SECURITY DEFINER, dono `postgres`) a usa: ninguém mais precisa de EXECUTE.
revoke all on function tmsi.system_actor() from public;

-- ----------------------------------------------------------------------------
-- 2. O gatilho: sem `auth.uid()`, assina como `system`
-- ----------------------------------------------------------------------------
create or replace function tmsi.audit()
returns trigger
language plpgsql
security definer
set search_path to 'tmsi', 'pg_temp'
as $function$
declare pk text;
begin
  pk := coalesce(to_jsonb(coalesce(new, old))->>'id',
                 to_jsonb(coalesce(new, old))::text);
  -- 0022 (item 94): fora de um pedido HTTP não há auth.uid(); assina como `system` em vez de gravar nulo.
  insert into tmsi.audit_log (actor, table_name, row_pk, action, old_row, new_row)
  values (coalesce(auth.uid(), tmsi.system_actor()), tg_table_name, pk, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $function$;

-- `create or replace` preserva as permissões, mas reafirma-se a regra: nada de EXECUTE a PUBLIC.
revoke all on function tmsi.audit() from public;

-- ----------------------------------------------------------------------------
-- 3. «Nunca nulo», só para as linhas novas
-- ----------------------------------------------------------------------------
alter table tmsi.audit_log
  add constraint audit_log_actor_not_null check (actor is not null) not valid;

-- ----------------------------------------------------------------------------
-- 4. Guardas (levantam excepção ANTES do `commit` se algo falhar)
-- ----------------------------------------------------------------------------
-- (i) a regra do CLAUDE.md: nenhuma função de `tmsi` com EXECUTE a PUBLIC/anon.
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

-- (ii) guardas próprias: o gatilho usa mesmo `system_actor()`, continua definer com search_path pinado, e a restrição
--      existe e é NOT VALID (se fosse VALID teria de validar 3314 linhas antigas, e falharia).
do $$
begin
  if pg_get_functiondef('tmsi.audit()'::regprocedure) not like '%coalesce(auth.uid(), tmsi.system_actor())%' then
    raise exception 'tmsi.audit() não assina como system quando auth.uid() é nulo';
  end if;
  if not (select prosecdef from pg_proc where oid = 'tmsi.audit()'::regprocedure) then
    raise exception 'tmsi.audit() deixou de ser SECURITY DEFINER';
  end if;
  if not exists (select 1 from pg_proc where oid = 'tmsi.audit()'::regprocedure
                 and proconfig @> array['search_path=tmsi, pg_temp']) then
    raise exception 'tmsi.audit() perdeu o search_path pinado';
  end if;
  if tmsi.system_actor() <> '00000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'tmsi.system_actor() devolve outro UUID';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'tmsi.audit_log'::regclass and conname = 'audit_log_actor_not_null'
                   and contype = 'c' and not convalidated) then
    raise exception 'audit_log_actor_not_null em falta, ou validada (devia ser NOT VALID: o histórico não se reescreve)';
  end if;
end $$;

commit;
