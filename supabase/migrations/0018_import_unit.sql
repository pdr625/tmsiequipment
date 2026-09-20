-- 0018 — o importador aprende a `unit`.
--
-- PROPOSTA. Escrita a 2026-09-20, NÃO APLICADA — o Pedro revê primeiro.
--
-- Origem: `docs/HANDOVER.md` §2. A `unit` é o último bloqueio da activação —
-- `tmsi.check_activation_requirements()` exige-a para qualquer estado
-- `active`/`review`, e nem o ficheiro da carga nem o importador a escreviam.
-- Dos 49 artigos reais, só o `T-1001` a tem, e foi escrita à mão no browser.
--
-- ============================================================================
-- A FONTE DA `unit`, que é o que torna isto um campo importado e não inventado
-- ============================================================================
-- A `unit` vem da **coluna `Unit` do `PRICE_LIST`** do Excel de origem (decisão
-- do Pedro, 2026-09-20). O importador lê-a de lá, como lê todas as outras.
-- **Nunca derivada do `item_type`, nunca um default.** Um `service` pode ser
-- `MONTH` (aluguer mensal) ou `PCS`; um `equipment` pode ser `SET` (kit) ou
-- `PCS` (peça) — a distinção existe no Excel e é comercial, não estrutural.
-- Derivá-la seria inventar dados com cara de dados importados.
--
-- ============================================================================
-- AS SETE ALTERAÇÕES (duas funções)
-- ============================================================================
-- Corpos gerados de PRODUÇÃO com `pg_get_functiondef()` e alterados em
-- exactamente sete sítios (diffs revistos pelo Pedro antes de aplicar). Nenhuma
-- assinatura muda, logo `CREATE OR REPLACE` serve e os GRANT da 0016 continuam
-- válidos.
--
-- `tmsi.run_import_products()` — seis:
--
--  1. `fields` — a `unit` entra na verificação de consistência entre as linhas
--     do mesmo artigo: um ficheiro que diga `PCS` numa linha e `SET` noutra,
--     para o mesmo `product_id`, é rejeitado com o erro que já existe.
--  2. Validação contra `tmsi.units`, no mesmo molde das outras colunas de
--     referência, com `{row, column, reason}` — nunca uma mensagem genérica.
--  3. `new_row` passa a transportar a `unit`.
--  4. **Detecção de alterações** — a que se esquece, e sem a qual um artigo
--     existente nunca apareceria como `to_update` e a importação pareceria não
--     fazer nada.
--  5. `INSERT` escreve a `unit` (NULL se ausente, exactamente como hoje).
--  6. `UPDATE` preserva a `unit` existente quando a linha não a traz.
--
-- `tmsi.undo_import_batch()` — uma, e não estava prevista:
--  7. O `UPDATE` de reversão ganha a `unit`.
--
-- ⚠️ ACHADO DA PRÓPRIA PROVA, e uma nota minha que estava errada. O
-- `docs/HANDOVER.md` dizia que "o desfazer vem de graça: `import_batch_items`
-- já guarda a linha inteira". **Guarda — e não chega.** O `old_row` é um
-- `to_jsonb(existing)` completo, mas o `UPDATE` de reversão tem **lista
-- explícita de colunas**, e uma coluna nova em `tmsi.products` não entra lá
-- sozinha. Sem a alteração 7, desfazer um lote repunha tudo menos a unidade —
-- o pior tipo de reversão, a que parece ter funcionado. Apanhado pela prova (e)
-- desta migração, não por leitura de código.
--
-- ⚠️ A SEMÂNTICA DO VAZIO, que decide 4 e 6: **`unit` ausente ou vazia numa
-- linha significa "não tocar", nunca "pôr NULL"**. É a mesma regra que a 0013
-- já aplicava a `in_margin` ("célula vazia nunca é 0"), e aqui protege contra
-- um caso concreto e destrutivo: correr outra vez o ficheiro da carga v5 — que
-- não tem coluna `unit` — apagaria a unidade dos 49 artigos que a acabaram de
-- receber. Com esta semântica, esse mesmo ficheiro dá `unchanged` e não toca em
-- nada, que é o que a idempotência do item 39 promete.
--
-- ⚠️ O QUE ESTA MIGRAÇÃO **NÃO** MUDA, e é preciso saber antes de importar:
-- o importador continua a exigir a **forma completa do artigo** em cada linha
-- (`purchase_currency`, `exw_price`, `primary_subsidiary`, `scope_type`,
-- `scope_code`). Medido contra a função viva a 2026-09-20: uma linha só com
-- `product_id`/`article`/`item_type`/`category`/`unit` é rejeitada com
-- `{"column": "purchase_currency", "reason": "em falta"}`. **Um ficheiro só de
-- unidades não é importável** — a `unit` tem de viajar no ficheiro do catálogo,
-- que é também de onde ela vem. Isto é contrato, não defeito: o `sold_in` de um
-- artigo é derivado das linhas de âmbito que o ficheiro traz, logo um ficheiro
-- parcial reescreveria `sold_in` a partir de informação incompleta.

begin;

CREATE OR REPLACE FUNCTION tmsi.run_import_products(p_rows jsonb, p_dry_run boolean, p_filename text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmsi', 'public'
AS $function$
declare
  row_obj jsonb;
  idx int := 0;
  pid text;
  errors jsonb := '[]'::jsonb;
  product_ids text[] := '{}';
  one_pid text;
  grp jsonb;
  first_row jsonb;
  field text;
  fields text[] := array['article','item_type','category','sap_code_sa','hs_code_ref',
                          'gross_weight_kg','purchase_currency','exw_price','primary_subsidiary',
                          'unit'];
  branch_id text;
  category_id text;
  interco_margin numeric;
  fee_val text;
  sold_in text[];
  existing tmsi.products%rowtype;
  new_row jsonb;
  products_create jsonb := '[]'::jsonb;
  products_update jsonb := '[]'::jsonb;
  products_unchanged jsonb := '[]'::jsonb;
  overrides_create jsonb := '[]'::jsonb;
  overrides_unchanged jsonb := '[]'::jsonb;
  v_batch_id uuid;
  n int;
  scope_row jsonb;
  cur_val numeric;
begin
  if not tmsi.has_role('admin') and not tmsi.has_role('product_manager') then
    raise exception 'Forbidden';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Empty import file';
  end if;

  -- pass 1: per-row required-field presence + format, collecting distinct product_ids
  idx := 0;
  for row_obj in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    pid := nullif(trim(row_obj->>'product_id'), '');
    if pid is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'product_id', 'reason', 'em falta'); continue;
    end if;
    if pid !~ '^T-[0-9]{4}$' then
      errors := errors || jsonb_build_object('row', idx, 'column', 'product_id', 'reason', 'formato inválido (T-####)'); continue;
    end if;
    if nullif(trim(row_obj->>'article'), '') is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'article', 'reason', 'em falta'); continue;
    end if;
    if nullif(trim(row_obj->>'item_type'), '') is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'item_type', 'reason', 'em falta'); continue;
    end if;
    if row_obj->>'item_type' not in ('equipment','spare_part','option','service') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'item_type', 'reason', 'valor desconhecido'); continue;
    end if;
    if nullif(trim(row_obj->>'purchase_currency'), '') is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'purchase_currency', 'reason', 'em falta'); continue;
    end if;
    if not exists (select 1 from tmsi.currencies where code = row_obj->>'purchase_currency' and active) then
      errors := errors || jsonb_build_object('row', idx, 'column', 'purchase_currency', 'reason', 'moeda desconhecida'); continue;
    end if;
    if nullif(trim(row_obj->>'exw_price'), '') is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'exw_price', 'reason', 'em falta'); continue;
    end if;
    begin
      if (row_obj->>'exw_price')::numeric < 0 then
        errors := errors || jsonb_build_object('row', idx, 'column', 'exw_price', 'reason', 'negativo'); continue;
      end if;
    exception when others then
      errors := errors || jsonb_build_object('row', idx, 'column', 'exw_price', 'reason', 'não é um número'); continue;
    end;
    if nullif(trim(row_obj->>'primary_subsidiary'), '') is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'primary_subsidiary', 'reason', 'em falta'); continue;
    end if;
    if not exists (select 1 from tmsi.branches where name = row_obj->>'primary_subsidiary') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'primary_subsidiary', 'reason', 'filial desconhecida'); continue;
    end if;
    if row_obj->>'scope_type' not in ('branch','channel') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'scope_type', 'reason', 'tem de ser branch ou channel'); continue;
    end if;
    if nullif(trim(row_obj->>'scope_code'), '') is null then
      errors := errors || jsonb_build_object('row', idx, 'column', 'scope_code', 'reason', 'em falta'); continue;
    end if;
    if row_obj->>'scope_type' = 'branch' and not exists (select 1 from tmsi.branches where id = row_obj->>'scope_code') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'scope_code', 'reason', 'filial desconhecida'); continue;
    end if;
    if row_obj->>'scope_type' = 'channel' and not exists (select 1 from tmsi.channels where id = row_obj->>'scope_code') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'scope_code', 'reason', 'canal desconhecido'); continue;
    end if;
    if nullif(trim(row_obj->>'category'), '') is not null
       and not exists (select 1 from tmsi.categories where id = row_obj->>'category' or name = row_obj->>'category') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'category', 'reason', 'categoria desconhecida'); continue;
    end if;
    if nullif(trim(row_obj->>'hs_code_ref'), '') is not null
       and not exists (select 1 from tmsi.hs_codes where code = row_obj->>'hs_code_ref') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'hs_code_ref', 'reason', 'código HS desconhecido — correr o ficheiro de direitos primeiro'); continue;
    end if;
    -- 0018: unit. Vazia ou ausente é legítimo e significa "não tocar" (ver o
    -- UPDATE, mais abaixo) — só um valor PRESENTE e desconhecido é erro.
    if nullif(trim(row_obj->>'unit'), '') is not null
       and not exists (select 1 from tmsi.units where code = row_obj->>'unit') then
      errors := errors || jsonb_build_object('row', idx, 'column', 'unit', 'reason', 'unidade desconhecida'); continue;
    end if;
    if nullif(trim(row_obj->>'gross_weight_kg'), '') is not null then
      begin
        if (row_obj->>'gross_weight_kg')::numeric < 0 then
          errors := errors || jsonb_build_object('row', idx, 'column', 'gross_weight_kg', 'reason', 'negativo'); continue;
        end if;
      exception when others then
        errors := errors || jsonb_build_object('row', idx, 'column', 'gross_weight_kg', 'reason', 'não é um número'); continue;
      end;
    end if;
    if nullif(trim(row_obj->>'in_interco_fee'), '') is not null then
      begin
        fee_val := row_obj->>'in_interco_fee';
        if fee_val::numeric < 0 or fee_val::numeric >= 1 then
          errors := errors || jsonb_build_object('row', idx, 'column', 'in_interco_fee', 'reason', 'fora do intervalo [0,1)'); continue;
        end if;
      exception when others then
        errors := errors || jsonb_build_object('row', idx, 'column', 'in_interco_fee', 'reason', 'não é um número'); continue;
      end;
    end if;
    if nullif(trim(row_obj->>'in_transport'), '') is not null then
      begin
        if (row_obj->>'in_transport')::numeric < 0 then
          errors := errors || jsonb_build_object('row', idx, 'column', 'in_transport', 'reason', 'negativo'); continue;
        end if;
      exception when others then
        errors := errors || jsonb_build_object('row', idx, 'column', 'in_transport', 'reason', 'não é um número'); continue;
      end;
    end if;
    if nullif(trim(row_obj->>'in_margin'), '') is not null then
      begin
        if (row_obj->>'in_margin')::numeric < 0 or (row_obj->>'in_margin')::numeric >= 1 then
          errors := errors || jsonb_build_object('row', idx, 'column', 'in_margin', 'reason', 'fora do intervalo [0,1)'); continue;
        end if;
      exception when others then
        errors := errors || jsonb_build_object('row', idx, 'column', 'in_margin', 'reason', 'não é um número'); continue;
      end;
    end if;

    if not (pid = any(product_ids)) then
      product_ids := array_append(product_ids, pid);
    end if;
  end loop;

  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', errors);
  end if;

  -- pass 2: per-product consistency + derive the product-level row
  foreach one_pid in array product_ids loop
    grp := (select jsonb_agg(r) from jsonb_array_elements(p_rows) r where r->>'product_id' = one_pid);
    first_row := grp->0;

    foreach field in array fields loop
      if exists (
        select 1 from jsonb_array_elements(grp) r
         where coalesce(r->>field, '') is distinct from coalesce(first_row->>field, '')
      ) then
        errors := errors || jsonb_build_object('row', 0, 'column', field,
          'reason', format('inconsistente entre linhas do artigo %s', one_pid));
      end if;
    end loop;

    -- interco_margin: from non-origin branch rows' in_interco_fee, must agree
    select id into branch_id from tmsi.branches where name = first_row->>'primary_subsidiary';
    select distinct r->>'in_interco_fee' into fee_val
      from jsonb_array_elements(grp) r
     where r->>'scope_type' = 'branch' and r->>'scope_code' <> branch_id
       and nullif(trim(r->>'in_interco_fee'), '') is not null;
    if (select count(distinct r->>'in_interco_fee') from jsonb_array_elements(grp) r
         where r->>'scope_type' = 'branch' and r->>'scope_code' <> branch_id
           and nullif(trim(r->>'in_interco_fee'), '') is not null) > 1 then
      errors := errors || jsonb_build_object('row', 0, 'column', 'in_interco_fee',
        'reason', format('inconsistente entre filiais não-origem do artigo %s', one_pid));
    end if;
    interco_margin := coalesce(fee_val::numeric, 0);

    if nullif(trim(first_row->>'category'), '') is not null then
      select id into category_id from tmsi.categories where id = first_row->>'category' or name = first_row->>'category';
    else
      category_id := null;
    end if;

    select array_agg(distinct r->>'scope_code') into sold_in
      from jsonb_array_elements(grp) r where r->>'scope_type' = 'branch' and r->>'scope_code' <> branch_id;
    sold_in := coalesce(sold_in, '{}');

    new_row := jsonb_build_object(
      'id', one_pid, 'name', first_row->>'article', 'item_type', first_row->>'item_type',
      'category_id', category_id, 'sap_code_sa', nullif(trim(first_row->>'sap_code_sa'), ''),
      'hs_code', nullif(trim(first_row->>'hs_code_ref'), ''),
      'gross_weight_kg', nullif(trim(first_row->>'gross_weight_kg'), ''),
      'unit', nullif(trim(first_row->>'unit'), ''),
      'currency', first_row->>'purchase_currency', 'exw_price', (first_row->>'exw_price')::numeric,
      'primary_branch', branch_id, 'interco_margin', interco_margin, 'sold_in', to_jsonb(sold_in)
    );

    select * into existing from tmsi.products where id = one_pid;
    if existing.id is null then
      products_create := products_create || new_row;
    elsif existing.name is distinct from new_row->>'name'
       or existing.item_type::text is distinct from new_row->>'item_type'
       or existing.category_id is distinct from new_row->>'category_id'
       or existing.sap_code_sa is distinct from new_row->>'sap_code_sa'
       or existing.hs_code is distinct from new_row->>'hs_code'
       or existing.gross_weight_kg is distinct from (new_row->>'gross_weight_kg')::numeric
       -- 0018: só conta como alteração se a linha TROUXER unit. Ausente/vazia
       -- não é "pôr NULL", é "não tocar" — senão um ficheiro sem a coluna
       -- apagava a unidade de todos os artigos que já a tinham.
       or (new_row->>'unit' is not null and existing.unit is distinct from new_row->>'unit')
       or existing.currency is distinct from new_row->>'currency'
       or existing.exw_price is distinct from (new_row->>'exw_price')::numeric
       or existing.primary_branch is distinct from new_row->>'primary_branch'
       or existing.interco_margin is distinct from (new_row->>'interco_margin')::numeric
       or existing.sold_in is distinct from sold_in
    then
      products_update := products_update || new_row;
    else
      products_unchanged := products_unchanged || new_row;
    end if;
  end loop;

  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', errors);
  end if;

  -- pass 3: per-row overrides (transport, margin)
  idx := 0;
  for row_obj in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    if nullif(trim(row_obj->>'in_transport'), '') is not null then
      select value into cur_val from tmsi.price_overrides
       where product_id = row_obj->>'product_id' and scope_type = (row_obj->>'scope_type')::tmsi.pricing_scope
         and scope_id = row_obj->>'scope_code' and kind = 'transport' and valid_from <= current_date
         and (valid_to is null or valid_to >= current_date)
       order by valid_from desc, created_at desc limit 1;
      if cur_val is distinct from (row_obj->>'in_transport')::numeric then
        overrides_create := overrides_create || jsonb_build_object(
          'product_id', row_obj->>'product_id', 'scope_type', row_obj->>'scope_type',
          'scope_id', row_obj->>'scope_code', 'kind', 'transport', 'value', (row_obj->>'in_transport')::numeric);
      else
        overrides_unchanged := overrides_unchanged || jsonb_build_object('row', idx, 'kind', 'transport');
      end if;
    end if;
    if nullif(trim(row_obj->>'in_margin'), '') is not null then
      select value into cur_val from tmsi.price_overrides
       where product_id = row_obj->>'product_id' and scope_type = (row_obj->>'scope_type')::tmsi.pricing_scope
         and scope_id = row_obj->>'scope_code' and kind = 'margin' and valid_from <= current_date
         and (valid_to is null or valid_to >= current_date)
       order by valid_from desc, created_at desc limit 1;
      if cur_val is distinct from (row_obj->>'in_margin')::numeric then
        overrides_create := overrides_create || jsonb_build_object(
          'product_id', row_obj->>'product_id', 'scope_type', row_obj->>'scope_type',
          'scope_id', row_obj->>'scope_code', 'kind', 'margin', 'value', (row_obj->>'in_margin')::numeric);
      else
        overrides_unchanged := overrides_unchanged || jsonb_build_object('row', idx, 'kind', 'margin');
      end if;
    end if;
  end loop;

  if p_dry_run then
    return jsonb_build_object('ok', true, 'dry_run', true,
      'products_create', products_create, 'products_update', products_update, 'products_unchanged', products_unchanged,
      'overrides_create', jsonb_array_length(overrides_create), 'overrides_unchanged', jsonb_array_length(overrides_unchanged));
  end if;

  insert into tmsi.import_batches (kind, source_filename, reason, row_count, created_by)
  values ('products', p_filename, p_reason, jsonb_array_length(p_rows), auth.uid())
  returning id into v_batch_id;

  for row_obj in select * from jsonb_array_elements(products_create || products_update) loop
    select * into existing from tmsi.products where id = row_obj->>'id';
    if existing.id is null then
      insert into tmsi.products (id, name, item_type, category_id, sap_code_sa, hs_code, gross_weight_kg,
        unit,
        currency, exw_price, primary_branch, interco_margin, sold_in)
      values (row_obj->>'id', row_obj->>'name', (row_obj->>'item_type')::tmsi.item_type, row_obj->>'category_id',
        row_obj->>'sap_code_sa', row_obj->>'hs_code', (row_obj->>'gross_weight_kg')::numeric,
        row_obj->>'unit',
        row_obj->>'currency', (row_obj->>'exw_price')::numeric, row_obj->>'primary_branch',
        (row_obj->>'interco_margin')::numeric,
        coalesce((select array_agg(x) from jsonb_array_elements_text(row_obj->'sold_in') x), '{}'));
      insert into tmsi.import_batch_items (batch_id, target_table, target_pk, old_row, new_row)
      values (v_batch_id, 'products', jsonb_build_object('id', row_obj->>'id'), null, to_jsonb(row_obj));
    else
      insert into tmsi.import_batch_items (batch_id, target_table, target_pk, old_row, new_row)
      values (v_batch_id, 'products', jsonb_build_object('id', row_obj->>'id'), to_jsonb(existing), to_jsonb(row_obj));
      update tmsi.products set
        name = row_obj->>'name', item_type = (row_obj->>'item_type')::tmsi.item_type,
        category_id = row_obj->>'category_id', sap_code_sa = row_obj->>'sap_code_sa',
        hs_code = row_obj->>'hs_code', gross_weight_kg = (row_obj->>'gross_weight_kg')::numeric,
        unit = coalesce(row_obj->>'unit', existing.unit),
        currency = row_obj->>'currency', exw_price = (row_obj->>'exw_price')::numeric,
        primary_branch = row_obj->>'primary_branch', interco_margin = (row_obj->>'interco_margin')::numeric,
        sold_in = coalesce((select array_agg(x) from jsonb_array_elements_text(row_obj->'sold_in') x), '{}')
      where id = row_obj->>'id';
    end if;
  end loop;

  for row_obj in select * from jsonb_array_elements(overrides_create) loop
    declare new_id bigint;
    begin
      insert into tmsi.price_overrides (product_id, scope_type, scope_id, kind, value, reason, created_by)
      values (row_obj->>'product_id', (row_obj->>'scope_type')::tmsi.pricing_scope, row_obj->>'scope_id',
              (row_obj->>'kind')::tmsi.override_kind, (row_obj->>'value')::numeric,
              format('Importação em massa (lote %s): %s', v_batch_id, p_reason), auth.uid())
      returning id into new_id;
      insert into tmsi.import_batch_items (batch_id, target_table, target_pk, old_row, new_row)
      values (v_batch_id, 'price_overrides', jsonb_build_object('id', new_id), null, row_obj || jsonb_build_object('id', new_id));
    end;
  end loop;

  select count(*) into n from tmsi.import_batch_items ibi where ibi.batch_id = v_batch_id;
  return jsonb_build_object('ok', true, 'dry_run', false, 'batch_id', v_batch_id,
    'products_created', jsonb_array_length(products_create), 'products_updated', jsonb_array_length(products_update),
    'products_unchanged', jsonb_array_length(products_unchanged), 'overrides_created', jsonb_array_length(overrides_create),
    'overrides_unchanged', jsonb_array_length(overrides_unchanged), 'items_written', n);
end $function$;

-- ---------------------------------------------------------------------------
-- 7. tmsi.undo_import_batch() — a reversão tem de repor a unit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tmsi.undo_import_batch(p_batch_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmsi', 'public'
AS $function$
declare
  b tmsi.import_batches%rowtype;
  item tmsi.import_batch_items%rowtype;
  n int := 0;
begin
  if not tmsi.has_role('admin') then
    raise exception 'Forbidden';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required';
  end if;

  select * into b from tmsi.import_batches where id = p_batch_id;
  if b.id is null then
    raise exception 'Batch % not found', p_batch_id;
  end if;
  if b.status <> 'committed' then
    raise exception 'Batch % is already %, not committed', p_batch_id, b.status;
  end if;

  for item in
    select * from tmsi.import_batch_items where batch_id = p_batch_id order by id desc
  loop
    if item.target_table = 'hs_codes' then
      if item.old_row is null then
        delete from tmsi.hs_codes where code = item.target_pk->>'code';
      else
        update tmsi.hs_codes set description = item.old_row->>'description' where code = item.target_pk->>'code';
      end if;
    elsif item.target_table = 'customs_rates' then
      if item.old_row is null then
        delete from tmsi.customs_rates where id = (item.target_pk->>'id')::bigint;
      else
        -- old_row here is the PRIOR active rate, itself a historical row, not
        -- this row's own former values (customs_rates is append-only) -- undo
        -- of an "update" case removes the row this batch inserted, same as a
        -- pure insert; the prior rate is still there, untouched, and becomes
        -- current again automatically (latest effective_date/created_at wins).
        delete from tmsi.customs_rates where id = (item.target_pk->>'id')::bigint;
      end if;
    elsif item.target_table = 'products' then
      if item.old_row is null then
        delete from tmsi.products where id = item.target_pk->>'id';
      else
        update tmsi.products set
          name = item.old_row->>'name',
          item_type = (item.old_row->>'item_type')::tmsi.item_type,
          category_id = item.old_row->>'category_id',
          sap_code_sa = item.old_row->>'sap_code_sa',
          hs_code = item.old_row->>'hs_code',
          gross_weight_kg = (item.old_row->>'gross_weight_kg')::numeric,
          -- 0018: sem esta linha, desfazer um lote repunha TUDO menos a
          -- unidade. O old_row guarda a linha inteira (to_jsonb(existing)),
          -- mas este UPDATE tem lista explícita de colunas — uma coluna nova
          -- em tmsi.products não entra aqui sozinha. Apanhado pela prova (e)
          -- da própria 0018: o artigo ficou com a unit gravada depois de
          -- desfazer.
          unit = item.old_row->>'unit',
          currency = item.old_row->>'currency',
          exw_price = (item.old_row->>'exw_price')::numeric,
          primary_branch = item.old_row->>'primary_branch',
          interco_margin = (item.old_row->>'interco_margin')::numeric,
          sold_in = coalesce((select array_agg(x) from jsonb_array_elements_text(item.old_row->'sold_in') x), '{}')
        where id = item.target_pk->>'id';
      end if;
    elsif item.target_table = 'price_overrides' then
      -- always this batch's own insert (price_overrides is append-only,
      -- never touched in place by the importer either) -- undo = delete.
      delete from tmsi.price_overrides where id = (item.target_pk->>'id')::bigint;
    else
      raise exception 'Unhandled target_table in batch item: %', item.target_table;
    end if;
    n := n + 1;
  end loop;

  update tmsi.import_batches
     set status = 'reverted', reverted_at = clock_timestamp(), reverted_by = auth.uid()
   where id = p_batch_id;

  return jsonb_build_object('ok', true, 'batch_id', p_batch_id, 'items_undone', n);
end $function$;

-- ---------------------------------------------------------------------------
-- A guarda da convenção (CLAUDE.md, item 65).
--
-- `alter default privileges ... in schema ... revoke ... from public` é no-op:
-- o EXECUTE a PUBLIC vem do built-in GLOBAL do PostgreSQL, e uma entrada com
-- âmbito de schema só sabe acrescentar, nunca retirar. `CREATE OR REPLACE` não
-- mexe na ACL de uma função que já existe — mas a guarda corre na mesma, porque
-- o custo é nulo e o dia em que alguém acrescentar uma função auxiliar aqui é
-- precisamente o dia em que ninguém se vai lembrar disto.
-- ---------------------------------------------------------------------------
revoke execute on function tmsi.run_import_products(jsonb, boolean, text, text) from public;
grant execute on function tmsi.run_import_products(jsonb, boolean, text, text) to authenticated;
revoke execute on function tmsi.undo_import_batch(uuid, text) from public;
grant execute on function tmsi.undo_import_batch(uuid, text) to authenticated;

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

commit;
