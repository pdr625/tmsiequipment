-- 0027 — item 49: retenção de 5 anos do tmsi.audit_log.
--
-- O prazo decidido (docs/DATA-PROCESSING-NOTICE.md §1) é 5 anos a partir da data de cada entrada. Esta migração implementa o MECANISMO, não um
-- agendamento: nada é apagado sozinho. A entrada mais antiga é de 2026-09-03, por isso nada é elegível antes de 2031-09-03.
--
-- purge_audit_log(p_dry_run default true):
--   * só admin; por omissão SÓ CONTA (simulação) — apagar exige pedir explicitamente `false`;
--   * o prazo (5 anos) está FIXO aqui dentro, sem parâmetro de data: ninguém consegue, por engano ou má fé, apagar entradas mais recentes;
--   * cada purga real deixa uma linha em tmsi.audit_purges (quem, quando, até que data, quantas) — um registo de auditoria que se apaga
--     tem de deixar rasto próprio, fora do alcance da própria purga.
begin;

create table tmsi.audit_purges (
  id             bigint generated always as identity primary key,
  run_at         timestamptz not null default now(),
  run_by         uuid not null,
  cutoff         timestamptz not null,
  rows_deleted   bigint not null check (rows_deleted > 0),
  oldest_deleted timestamptz not null
);
comment on table tmsi.audit_purges is 'Item 49, 0027: purgas do audit_log (quem, quando, até que data, quantas). Escrita só por purge_audit_log().';

alter table tmsi.audit_purges enable row level security;
create policy audit_purges_read on tmsi.audit_purges for select
  using (tmsi.has_role('admin') or tmsi.has_role('finance') or tmsi.has_role('viewer') or tmsi.has_role('branch_manager'));
revoke all on tmsi.audit_purges from anon, authenticated;
grant select on tmsi.audit_purges to authenticated;

create trigger trg_audit_audit_purges
  after insert or update or delete on tmsi.audit_purges
  for each row execute function tmsi.audit();

create or replace function tmsi.purge_audit_log(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path to 'tmsi', 'pg_temp'
as $$
declare
  v_cutoff   timestamptz := now() - interval '5 years';
  v_eligible bigint;
  v_oldest   timestamptz;
  v_deleted  bigint := 0;
begin
  if not tmsi.has_role('admin') then
    raise exception 'Forbidden' using errcode = 'insufficient_privilege';
  end if;

  select count(*), min(at) into v_eligible, v_oldest from tmsi.audit_log where at < v_cutoff;

  if not p_dry_run and v_eligible > 0 then
    delete from tmsi.audit_log where at < v_cutoff;
    get diagnostics v_deleted = row_count;
    insert into tmsi.audit_purges (run_by, cutoff, rows_deleted, oldest_deleted) values (auth.uid(), v_cutoff, v_deleted, v_oldest);
  end if;

  return jsonb_build_object('dry_run', p_dry_run, 'cutoff', v_cutoff, 'eligible', v_eligible, 'oldest_eligible', v_oldest, 'deleted', v_deleted);
end $$;
revoke all on function tmsi.purge_audit_log(boolean) from public;
grant execute on function tmsi.purge_audit_log(boolean) to authenticated;
comment on function tmsi.purge_audit_log(boolean) is 'Item 49, 0027: apaga entradas do audit_log com mais de 5 anos. Só admin; por omissão só simula; prazo fixo.';

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
  if not (select relrowsecurity from pg_class where oid = 'tmsi.audit_purges'::regclass) then
    raise exception 'audit_purges sem RLS';
  end if;
  if has_table_privilege('authenticated', 'tmsi.audit_purges', 'insert') or has_table_privilege('authenticated', 'tmsi.audit_purges', 'update')
     or has_table_privilege('authenticated', 'tmsi.audit_purges', 'delete') or has_table_privilege('anon', 'tmsi.audit_purges', 'select') then
    raise exception 'audit_purges com privilégios a mais';
  end if;
  if not exists (select 1 from pg_proc where oid = 'tmsi.purge_audit_log(boolean)'::regprocedure and prosecdef and proconfig @> array['search_path=tmsi, pg_temp']) then
    raise exception 'purge_audit_log() deve ser SECURITY DEFINER com search_path pinado';
  end if;
  if (select count(*) from pg_proc where proname = 'purge_audit_log') <> 1 then
    raise exception 'purge_audit_log tem de ter UMA só assinatura (sem sobrecarga com parâmetro de data)';
  end if;
end $$;

commit;
