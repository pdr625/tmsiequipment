-- 0019 — a filial de origem também vende.
--
-- PROPOSTA. Escrita a 2026-09-20, NÃO APLICADA — o Pedro revê primeiro.
--
-- ============================================================================
-- O QUE SE DESCOBRIU, E SÓ SE PODIA DESCOBRIR HOJE
-- ============================================================================
-- Ao activar os primeiros 6 artigos reais (2026-09-20), mediu-se que o
-- `sales.sa` via **três** deles — e eram os três de origem TBM. Os três de
-- origem SA, a sua própria filial, ficavam invisíveis.
--
-- Duas definições que deviam concordar, e não concordavam:
--
--   tmsi.v_branch_prices:  b.id = ANY(p.sold_in) OR b.id = p.primary_branch
--   tmsi.products_visible: ... has_role('sales') and p_sold_in && my_branches()
--                          (só sold_in — sem a origem)
--
-- E `sold_in` **exclui a origem por construção**: o importador calcula-o como
-- "os âmbitos de filial do ficheiro, menos a filial de origem" (0013), e a
-- semântica foi fixada aí. A vista de preços seguiu essa semântica e somou a
-- origem à parte; a `products_visible` (0003/0004) ficou atrás e nunca foi
-- revista quando a 0013 fixou o significado de `sold_in`.
--
-- Nunca se tinha visto porque **nada estava `active`**: as cláusulas de
-- `sales` e `agent` exigem `p_status = 'active'`, logo estavam mortas desde
-- 2026-09-04. A primeira activação de artigos reais acendeu-as.
--
-- ============================================================================
-- A RAZÃO DE NEGÓCIO, dita pelo Pedro (2026-09-20)
-- ============================================================================
-- **A origem vende.** O Excel tem folha de venda para a filial de origem, e o
-- motor da 0009 já lhe dá cadeia de preço própria — é só a `products_visible`
-- que ficou atrás. Não é uma regra nova: é a que já estava em toda a parte
-- menos aqui.
--
-- Sintoma retrospectivo: a 2026-09-16 o Pedro editou o `T-1001` no browser e
-- acrescentou `TBM` — a própria origem — ao `sold_in`. Era esta a razão. Essa
-- edição foi revertida a 2026-09-20 pela reimportação (com o seu OK), o que
-- torna esta migração o sítio certo para o problema ser resolvido, em vez de
-- artigo a artigo e à mão.
--
-- ============================================================================
-- ÂMBITO: SÓ A products_visible
-- ============================================================================
-- Varrimento de tudo o que usa `sold_in` para decidir visibilidade ou âmbito
-- (políticas, vistas, funções, código da app):
--
--   tmsi.v_branch_prices ......... já inclui `OR b.id = p.primary_branch` ✔
--   tmsi.v_selling_prices ........ construída sobre a anterior ✔
--   tmsi.compute_price ........... `see_sell` nem usa `sold_in` — é por
--                                  `b.id = any(my_branches())` ✔
--   tmsi.products_read (política)  delega em products_visible → herda a correcção
--   tmsi.v_products .............. `WHERE products_visible(...)` → herda
--   run_import_products/undo ..... calculam/repõem `sold_in`, não visibilidade ✔
--   app products/[id]/page.tsx:133 `[primary_branch, ...sold_in]` ✔
--
-- **A `products_visible` é o único sítio**, e só nas cláusulas de `sales` e de
-- `agent` — a de `branch_manager` já tinha `p_primary_branch = any(...)` desde
-- a 0003. Nada mais precisa de mudar, e nada mais muda aqui.

-- ============================================================================
-- INVARIANTE DE UMA MIGRAÇÃO QUE ALARGA VISIBILIDADE (regra nova, 2026-09-20)
-- ============================================================================
-- A verificação habitual — "impressão digital de `v_branch_prices` idêntica
-- antes e depois" — **não se aplica aqui, e exigi-la levaria a rejeitar uma
-- migração correcta**. `v_branch_prices` é `security_invoker = true`: a RLS da
-- `tmsi.products` corre por baixo e decide que artigos chegam sequer à vista.
-- Alargar a `products_visible` amplia esse conjunto, logo o md5 sobre as linhas
-- que um papel vê **tem** de mudar. Se não mudasse, a migração não teria feito
-- nada.
--
-- A invariante correcta, e é esta que se prova:
--
--   1. Para os papéis cujo conjunto NÃO é alargado (admin, product_manager,
--      finance, logistics, viewer): contagens e md5 **idênticos**.
--   2. Para os papéis alargados (sales, agent): as linhas que já viam
--      **continuam lá, com os mesmos valores** — zero desaparecidas, zero com
--      valor diferente — e as novas são só acréscimo.
--
-- Medido nesta migração, em transacção revertida:
--   sales: 3 linhas que já via -> 0 desaparecidas, 0 com valor diferente, +3
--   agent: 6 linhas que já via -> 0 desaparecidas, 0 com valor diferente, +6
--   admin/finance/logistics: md5 idêntico
--
begin;

CREATE OR REPLACE FUNCTION tmsi.products_visible(p_primary_branch text, p_sold_in text[], p_status tmsi.product_status)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'tmsi', 'pg_temp'
AS $function$
  select tmsi.has_role('admin') or tmsi.has_role('product_manager') or tmsi.has_role('finance')
      or tmsi.has_role('logistics') or tmsi.has_role('viewer')
      or (tmsi.has_role('branch_manager') and (p_primary_branch = any(tmsi.my_branches()) or p_sold_in && tmsi.my_branches()))
      -- 0019: a filial de ORIGEM também vende. Até aqui estas duas cláusulas
      -- olhavam só para `sold_in`, que por construção do importador EXCLUI a
      -- origem — logo um comercial de SA não via os artigos que a SA produz.
      -- A origem entra por concatenação ao `sold_in`, e mantém-se o operador
      -- `&&` que estas cláusulas já usavam. Tentou-se primeiro
      -- `p_primary_branch = any(<subconsulta>)`: o Postgres lê isso como
      -- sublink (comparação contra LINHAS) e não como array, e rebenta com
      -- `operator does not exist: text = text[]` — apanhado pelo ensaio desta
      -- própria migração, não em produção.
      or (tmsi.has_role('sales') and p_status = 'active'
          and (coalesce(p_sold_in, '{}') || p_primary_branch) && tmsi.my_branches())
      or (tmsi.has_role('agent') and p_status = 'active'
          and (coalesce(p_sold_in, '{}') || p_primary_branch)
              && (select coalesce(array_agg(branch_id), '{}') from tmsi.channels where id = any(tmsi.my_channels())));
$function$;

-- ---------------------------------------------------------------------------
-- A guarda da convenção (CLAUDE.md, item 65).
-- ---------------------------------------------------------------------------
revoke execute on function tmsi.products_visible(text, text[], tmsi.product_status) from public;
grant execute on function tmsi.products_visible(text, text[], tmsi.product_status) to authenticated;

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
