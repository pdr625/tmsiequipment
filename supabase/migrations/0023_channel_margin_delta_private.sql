-- 0023 — item 110: tmsi.channels.margin_delta deixa de ser legível por qualquer conta autenticada.
--
-- Achado ao fechar o item 63: a política `ref_read` é `using (true)` e `authenticated` tinha SELECT na tabela inteira, por isso
-- um vendedor, um agente e uma conta SEM papel liam `margin_delta` (a 0009 diz que é uma coluna legada, sem leitores no motor).
--
-- Os privilégios de COLUNA são por papel de BD (`authenticated`), e todos os utilizadores da app são `authenticated`:
-- não dá para esconder a coluna só a alguns papéis da app com um REVOKE. Por isso: (1) a coluna deixa de ser legível
-- directamente; (2) quem pode vê-la lê-a por uma função SECURITY DEFINER que decide pelo MESMO critério dos custos
-- (`can_read_costs()`: admin, product_manager, finance, branch_manager, viewer) e devolve ZERO linhas aos restantes.
-- Escrever continua como antes (INSERT/UPDATE por coluna, `ref_write` só admin).
begin;

revoke select on tmsi.channels from authenticated;
grant select (id, name, branch_id, active) on tmsi.channels to authenticated;

create or replace function tmsi.channel_margin_deltas()
returns table (id text, margin_delta numeric)
language sql stable security definer set search_path to 'tmsi', 'pg_temp'
as $$
  select c.id, c.margin_delta from tmsi.channels c where tmsi.can_read_costs()
$$;
comment on function tmsi.channel_margin_deltas() is
  'margin_delta (legado) dos canais, só para quem lê custos (can_read_costs); zero linhas para os restantes. Item 110, 0023.';
revoke all on function tmsi.channel_margin_deltas() from public;
grant execute on function tmsi.channel_margin_deltas() to authenticated;

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

-- guardas próprias: a coluna já não é legível por `authenticated`, as outras continuam, e a escrita não se perdeu
do $$
begin
  if has_column_privilege('authenticated', 'tmsi.channels', 'margin_delta', 'select') then
    raise exception 'authenticated ainda lê channels.margin_delta';
  end if;
  if not (has_column_privilege('authenticated', 'tmsi.channels', 'id', 'select')
      and has_column_privilege('authenticated', 'tmsi.channels', 'name', 'select')
      and has_column_privilege('authenticated', 'tmsi.channels', 'branch_id', 'select')
      and has_column_privilege('authenticated', 'tmsi.channels', 'active', 'select')) then
    raise exception 'authenticated perdeu SELECT numa coluna que as páginas usam';
  end if;
  if not (has_column_privilege('authenticated', 'tmsi.channels', 'margin_delta', 'insert')
      and has_column_privilege('authenticated', 'tmsi.channels', 'margin_delta', 'update')) then
    raise exception 'a escrita de margin_delta perdeu-se (o admin tem de continuar a poder criar canais)';
  end if;
  if has_table_privilege('anon', 'tmsi.channels', 'select') then
    raise exception 'anon lê tmsi.channels';
  end if;
end $$;

commit;
