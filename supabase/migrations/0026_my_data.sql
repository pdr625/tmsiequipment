-- 0026 — item 46: «os meus dados». tmsi.my_data() devolve, num só JSON, o que o sistema guarda sobre QUEM CHAMA — e nada de terceiros.
--
-- É a fonte do ficheiro que a app serve em /account/export. Vive na BD (e não em vários pedidos da app) por duas razões: um só sítio
-- decide o que sai, e dá para o provar com sessões simuladas, papel a papel. Não exige nenhum papel (qualquer pessoa autenticada pode
-- pedir os seus dados), mas só olha para auth.uid(): não há parâmetro «de quem».
--
-- O que NÃO sai, de propósito: o `row_pk` e o conteúdo de linhas de `profiles` que não sejam as suas (um admin que editou o perfil de
-- um colega tem esse nome/email no row_pk da sua própria entrada de auditoria — não é dado seu), e o UUID/identidade de outras pessoas
-- (quem alterou a sua conta aparece como «another user»). O que a função não vê (sessões, IP, logs do servidor, cópias de segurança)
-- vem declarado em `not_included`.
begin;

create or replace function tmsi.my_data()
returns jsonb language plpgsql stable security definer set search_path to 'tmsi', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'user_id', v_uid,
    'about_this_file', 'The personal data TMSI Equipment Price Listing holds about you. Generated for you only; it contains nothing about other people.',
    'profile', (select to_jsonb(p) from tmsi.profiles p where p.user_id = v_uid),
    'roles', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from tmsi.user_roles r where r.user_id = v_uid), '[]'::jsonb),
    -- o que FEZ: quando, em que tabela, em que registo, que acção (não o conteúdo das alterações, que é dado da empresa)
    'actions_you_performed', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', a.at, 'table', a.table_name, 'action', a.action,
               'record', case when a.table_name = 'profiles' then coalesce(a.new_row ->> 'user_id', a.old_row ->> 'user_id') else a.row_pk end)
             order by a.at desc)
      from (select * from tmsi.audit_log where actor = v_uid order by at desc limit 50000) a), '[]'::jsonb),
    -- o que FOI FEITO à sua conta (perfil e papéis): é dado seu
    'changes_to_your_account', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', a.at, 'table', a.table_name, 'action', a.action,
               'by', case when a.actor = v_uid then 'you' else 'another user' end,
               'before', a.old_row, 'after', a.new_row)
             order by a.at desc)
      from tmsi.audit_log a
      where a.table_name in ('profiles', 'user_roles')
        and (a.old_row ->> 'user_id' = v_uid::text or a.new_row ->> 'user_id' = v_uid::text)), '[]'::jsonb),
    'not_included', jsonb_build_array(
      'Sign-in sessions (IP address, browser) — held by the authentication service; ask the data controller.',
      'Web server access logs — they include your IP address and the pages requested; ask the data controller.',
      'Nightly database backups — they hold a copy of the data above until they expire (30 days).',
      'Your password — stored only as a one-way hash, never readable by anyone.')
  );
end $$;
revoke all on function tmsi.my_data() from public;
grant execute on function tmsi.my_data() to authenticated;
comment on function tmsi.my_data() is 'Item 46, 0026: os dados de quem chama, num JSON. Só auth.uid(); nada de terceiros.';

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

do $$
begin
  if not exists (select 1 from pg_proc where oid = 'tmsi.my_data()'::regprocedure and prosecdef and proconfig @> array['search_path=tmsi, pg_temp']) then
    raise exception 'my_data() deve ser SECURITY DEFINER com search_path pinado';
  end if;
  if has_function_privilege('anon', 'tmsi.my_data()', 'execute') then
    raise exception 'anon executa my_data()';
  end if;
end $$;

commit;
