-- 0025 — item 45: apagar/anonimizar um utilizador.
--
-- Fluxo (a app orquestra): (1) removal_blockers() → (2) apagar a conta no GoTrue (some o email, o hash e as sessões; `profiles` e
-- `user_roles` caem por CASCADE) → (3) redact_removed_user() redige o nome e o email que ficaram no audit_log e deixa um registo
-- mínimo, sem dados pessoais, em tmsi.removed_users.
--
-- O audit_log mantém o UUID do autor: é a prova de quem fez o quê, e sem perfil deixa de ser ligável a uma pessoa. O que se redige é só
-- o nome e o email das linhas de `profiles` desse utilizador (as únicas do audit_log com dados pessoais — medido: 32 linhas de 7435);
-- o `row_pk` dessas linhas é a linha inteira em texto, por isso passa a ser o UUID. É uma alteração deliberada ao audit_log, feita só por
-- esta função (SECURITY DEFINER, só admin, só depois de a conta ter desaparecido), e fica registada em removed_users.
begin;

create table tmsi.removed_users (
  user_id       uuid primary key,
  removed_at    timestamptz not null default now(),
  removed_by    uuid not null,
  rows_redacted integer not null check (rows_redacted >= 0)
);
comment on table tmsi.removed_users is
  'Item 45, 0025: utilizadores removidos. Sem dados pessoais (só o UUID, quando e por quem). Escrita só por redact_removed_user().';

alter table tmsi.removed_users enable row level security;
-- ler: quem lê o audit_log (para o /audit dizer «Removed user»); escrever: ninguém directamente
create policy removed_users_read on tmsi.removed_users for select
  using (tmsi.has_role('admin') or tmsi.has_role('finance') or tmsi.has_role('viewer') or tmsi.has_role('branch_manager'));
revoke all on tmsi.removed_users from anon, authenticated;
grant select on tmsi.removed_users to authenticated;

create trigger trg_audit_removed_users
  after insert or update or delete on tmsi.removed_users
  for each row execute function tmsi.audit();

-- Devolve o motivo por que NÃO se pode remover este utilizador, ou NULL se pode.
create or replace function tmsi.removal_blockers(p_user uuid)
returns text language plpgsql stable security definer set search_path to 'tmsi', 'pg_temp'
as $$
begin
  if not tmsi.has_role('admin') then
    raise exception 'Forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from tmsi.profiles where user_id = p_user) then
    return 'Unknown user';
  end if;
  if p_user = auth.uid() then
    return 'You cannot remove your own account';
  end if;
  -- «último admin»: já não precisa de regra própria — quem chama é admin e não pode ser o alvo (acima), logo sobra sempre pelo menos ele.
  return null;
end $$;
revoke all on function tmsi.removal_blockers(uuid) from public;
grant execute on function tmsi.removal_blockers(uuid) to authenticated;

-- Redige o nome e o email do utilizador removido no audit_log e regista a remoção. Idempotente. Devolve as linhas redigidas.
create or replace function tmsi.redact_removed_user(p_user uuid)
returns integer language plpgsql security definer set search_path to 'tmsi', 'pg_temp'
as $$
declare
  v_n integer;
begin
  if not tmsi.has_role('admin') then
    raise exception 'Forbidden' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from auth.users where id = p_user) then
    raise exception 'The account still exists: delete it first (nothing is redacted for a live user)';
  end if;

  update tmsi.audit_log set
    row_pk  = p_user::text,
    old_row = case when old_row is null then null else (old_row - 'full_name' - 'email') || jsonb_build_object('full_name', '[removed]', 'email', '[removed]') end,
    new_row = case when new_row is null then null else (new_row - 'full_name' - 'email') || jsonb_build_object('full_name', '[removed]', 'email', '[removed]') end
  where table_name = 'profiles'
    and (old_row ->> 'user_id' = p_user::text or new_row ->> 'user_id' = p_user::text)
    and (row_pk <> p_user::text
         or coalesce(old_row ->> 'email', '[removed]') <> '[removed]' or coalesce(new_row ->> 'email', '[removed]') <> '[removed]'
         or coalesce(old_row ->> 'full_name', '[removed]') <> '[removed]' or coalesce(new_row ->> 'full_name', '[removed]') <> '[removed]');
  get diagnostics v_n = row_count;

  insert into tmsi.removed_users (user_id, removed_by, rows_redacted) values (p_user, auth.uid(), v_n)
  on conflict (user_id) do update set rows_redacted = tmsi.removed_users.rows_redacted + excluded.rows_redacted;
  return v_n;
end $$;
revoke all on function tmsi.redact_removed_user(uuid) from public;
grant execute on function tmsi.redact_removed_user(uuid) to authenticated;

-- guarda do repo: nenhuma função de `tmsi` com EXECUTE a PUBLIC/anon
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

-- guardas próprias
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'tmsi.removed_users'::regclass) then
    raise exception 'removed_users sem RLS';
  end if;
  if has_table_privilege('authenticated', 'tmsi.removed_users', 'insert') or has_table_privilege('authenticated', 'tmsi.removed_users', 'update')
     or has_table_privilege('authenticated', 'tmsi.removed_users', 'delete') or has_table_privilege('anon', 'tmsi.removed_users', 'select') then
    raise exception 'removed_users com privilégios a mais';
  end if;
  if (select count(*) from pg_proc where oid in ('tmsi.removal_blockers(uuid)'::regprocedure, 'tmsi.redact_removed_user(uuid)'::regprocedure)
        and prosecdef and proconfig @> array['search_path=tmsi, pg_temp']) <> 2 then
    raise exception 'removal_blockers/redact_removed_user devem ser SECURITY DEFINER com search_path pinado';
  end if;
end $$;

commit;
