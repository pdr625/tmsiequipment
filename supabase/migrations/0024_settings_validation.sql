-- 0024 — item 86: tmsi.settings passa a validar o que guarda.
--
-- Até aqui a tabela não tinha NENHUMA restrição: como finance, `margin_min = -5` e `review_days = -5` foram aceites pela app e pela BD
-- e ficaram em vigor (03/10). O motor lê estes valores com `(value->>0)::numeric` — um valor que não seja número rebenta o cálculo
-- e um negativo é aceite em silêncio, por isso a forma tem de ser garantida AQUI, não só na página.
--
-- (1) CHECK por linha (a forma de cada chave conhecida). Chaves desconhecidas passam: quem acrescentar uma chave nova deve
--     acrescentá-la a este CHECK. Todas as linhas actuais cumprem-no (validado na criação).
-- (2) Gatilho para a ORDEM margin_min < margin_target < margin_good, que envolve três linhas e por isso não cabe num CHECK.
--     Vale em cada estado em vigor: a app grava uma chave de cada vez, logo para subir `margin_min` acima de `margin_target`
--     sobe-se primeiro `margin_target` (e antes dele `margin_good`). É o que o `Alert` do motor assume sem verificar.
begin;

alter table tmsi.settings add constraint settings_value_shape check (
  case
    when key in ('margin_good', 'margin_min', 'margin_target', 'fx_tolerance') then
      case when jsonb_typeof(value) = 'number'
           then (value #>> '{}')::numeric > 0 and (value #>> '{}')::numeric < 1
           else false end
    when key = 'review_days' then
      case when jsonb_typeof(value) = 'number'
           then (value #>> '{}')::numeric > 0 and (value #>> '{}')::numeric = trunc((value #>> '{}')::numeric)
           else false end
    when key = 'fx_source' then
      case when jsonb_typeof(value) = 'string' then length(btrim(value #>> '{}')) > 0 else false end
    when key = 'operational_price_notice' then
      coalesce(jsonb_typeof(value) = 'boolean', false)
    else true
  end
);

create or replace function tmsi.settings_margin_order()
returns trigger language plpgsql security definer set search_path to 'tmsi', 'pg_temp'
as $$
declare
  v_min numeric; v_tgt numeric; v_good numeric;
begin
  if new.key not in ('margin_min', 'margin_target', 'margin_good') then
    return null;
  end if;
  select (value #>> '{}')::numeric into v_min  from tmsi.settings where key = 'margin_min'    and jsonb_typeof(value) = 'number';
  select (value #>> '{}')::numeric into v_tgt  from tmsi.settings where key = 'margin_target' and jsonb_typeof(value) = 'number';
  select (value #>> '{}')::numeric into v_good from tmsi.settings where key = 'margin_good'   and jsonb_typeof(value) = 'number';
  if v_min is not null and v_tgt is not null and not (v_min < v_tgt) then
    raise exception 'margin_min (%) tem de ser menor que margin_target (%): para subir o mínimo acima do alvo, suba primeiro o alvo (e antes dele margin_good)', v_min, v_tgt
      using errcode = 'check_violation';
  end if;
  if v_tgt is not null and v_good is not null and not (v_tgt < v_good) then
    raise exception 'margin_target (%) tem de ser menor que margin_good (%): para subir o alvo acima do bom, suba primeiro margin_good', v_tgt, v_good
      using errcode = 'check_violation';
  end if;
  return null;
end $$;
revoke all on function tmsi.settings_margin_order() from public;
comment on function tmsi.settings_margin_order() is 'Item 86, 0024: margin_min < margin_target < margin_good em cada estado em vigor.';

create trigger trg_settings_margin_order
  after insert or update of value on tmsi.settings
  for each row execute function tmsi.settings_margin_order();

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

-- guardas próprias: restrição VÁLIDA (as linhas actuais cumprem-na), gatilho presente, função definer com search_path pinado
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'tmsi.settings'::regclass and conname = 'settings_value_shape'
                 and contype = 'c' and convalidated) then
    raise exception 'settings_value_shape em falta ou não validada';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'tmsi.settings'::regclass and tgname = 'trg_settings_margin_order' and not tgisinternal) then
    raise exception 'trg_settings_margin_order em falta';
  end if;
  if not exists (select 1 from pg_proc where oid = 'tmsi.settings_margin_order()'::regprocedure and prosecdef
                 and proconfig @> array['search_path=tmsi, pg_temp']) then
    raise exception 'settings_margin_order() deve ser SECURITY DEFINER com search_path pinado';
  end if;
end $$;

commit;
