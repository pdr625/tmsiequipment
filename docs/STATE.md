# STATE.md — TMSI Equipment Price Listing (infra)

Documento vivo do estado real da infra deste projecto. Sem segredos — só *onde* eles vivem.
Actualizado por toda a sessão que altere o estado do TMSI (ver secção 6).

**Etapa actual: E3, iteração 8 (dashboard) — ✅ FECHADA. A E3 está completa.** Próximo: decisão
do Pedro entre E5 (operações, antes de utilizadores reais) e E4/0006 (quando a decisão L2
fechar) — nenhuma das duas arranca sem a primeira execução formal do
`docs/VERIFICATION-PROTOCOL.md` (gate de produção, `docs/ROADMAP.md`). Ordem e critérios de
saída de cada etapa: `docs/ROADMAP.md`. E0, E1, E2, E3 (i1–i8) e as migrações 0003/0004/0005
estão fechadas.

## E3, iteração 8 — Dashboard (KPIs e margens por filial) — ✅ FECHADA 2026-09-04 — **E3 completa**

**Digest:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:3cc4e108bc85eb6589e5547cb7e67042094ec4335483dce526426dd91e2bb68e`
(`Created` 2026-09-04T22:41:08Z, commit `3e71bb1`, CI concluído 22:41:20Z — ordem consistente).
**Footprint pós-deploy:** RAM available 144 MB; swap 1084/4095 MB (≈26%); disco 48%.

`/dashboard`, gate `can_read_costs()` apenas (admin já é o primeiro membro dessa própria função
— um `isAdmin()` à parte só alargaria o gate, nunca o estreitaria). Cinco secções, todas lidas
pelas mesmas vistas/funções que os ecrãs já existentes usam (restrição 2 do prompt): tiles de
estado (`tmsi.v_products`, `review` destacado), margem média por filial em barras
(`tmsi.v_branch_prices`, só produtos `active` — o rascunho de um produto ainda não é uma decisão
de preço real), frescura dos câmbios por moeda (mesmo desempate `effective_date desc, created_at
desc` do `tmsi.fx_rate()`, 0005 — nunca uma regra nova), overrides activos
(`tmsi.price_overrides`, mesma janela de validade do `tmsi.override_value()`), e actividade
recente (`tmsi.audit_log`, últimas 10).

**Regras de dataviz do prompt (§2), seguidas à letra:** paleta categórica CVD-safe nos hexes
exactos, como custom properties CSS, com `prefers-color-scheme` E `[data-theme]` ligados (a app
não tem toggle de tema nenhum ainda — defensivo para um futuro toggle, confirmado a compilar
correctamente no CSS final servido em produção, ver prova 3 abaixo); rótulos directos nas barras
em cor de texto (nunca a cor da série — as cores 3/4 falham 3:1 no `surface` claro) + vista de
tabela acessível por gráfico; paleta de estado própria (vermelho, nunca reutilizada das quatro
cores categóricas) para o tile `review` e o aviso de câmbio velho, sempre ícone + texto.

**Achado de F1, apanhado na revisão antes do commit (nunca chegou a correr em CI):**
`new Map(array.map(x => [x.a, x.b]))` — o padrão de construir um `Map` a partir de tuplos
inferidos inline dentro de `.map()` é um ponto conhecido de inferência frágil em TypeScript (o
literal `[x.a, x.b]` nem sempre é inferido como tuplo `[K, V]` através de uma chamada genérica
aninhada). Reescrito para o mesmo padrão imperativo (`for` + `.set()`) já usado no resto do
ficheiro para os outros três agregados, em vez de arriscar um round-trip ao CI para confirmar.

**Provas (F3):**
1. **Cada tile/gráfico comparado ao SQL corrido à mão no `psql`** (claims JWT reais, admin):
   tiles de estado (`draft 2, active 8, review 2, discontinued 1` — `pending`/`inactive`
   correctamente a 0, não ausentes); margem média por filial (`CORP 44.3%, LTD 44.3%, SA 54.0%,
   TBM 65.0%`, só produtos activos); frescura (`CNY/GBP/USD`, todas com a taxa mais recente de
   hoje, `0` dias); overrides activos = `4` (inclui o override real criado pelo Pedro na i6,
   ainda válido); actividade recente = as 10 entradas mais recentes do `audit_log` — todos os
   valores coincidem exactamente com a query equivalente da app.
2. **Ramo do aviso de frescura:** como todas as três moedas têm taxa de hoje (idade 0), o limiar
   real (30 dias) nunca dispara com os dados actuais — provado correctamente sem inventar dados
   falsos: baixei temporariamente `STALE_RATE_DAYS` para `-1` no ficheiro local (nunca commitado
   — `git diff` confirmado limpo depois de reverter), tracei a lógica com os dados reais
   (`0 > -1` = verdadeiro) e confirmei que o ramo de aviso (borda + `WarnBadge` com ícone+texto)
   é o mesmo padrão condicional `{cond && <X/>}` já provado em produção nesta app (i6, i4) — sem
   servidor local para correr (este VPS não tem `node` nem faz builds, restrição 1), a
   verificação é um trace de código deliberado, não uma execução, registado como tal.
3. **Dark mode:** sem browser para alternar o tema ao vivo, confirmado ao nível que consigo —
   o CSS realmente servido em produção (`/_next/static/chunks/*.css`) contém os três blocos
   exactos (`.dashboard-charts` base, `@media (prefers-color-scheme: dark)`, e
   `:root[data-theme='dark']`), com os hexes exactos do prompt em cada um. A confirmação visual
   fica para o passo manual do Pedro.
4. **Ramo negado:** `sales.sa` e `logistics.test` — `can_read_costs()` = `false` para ambos
   (logo `/dashboard` redirecciona, mesmo gate que a app usa); e, defesa em profundidade,
   `tmsi.v_branch_prices` (margem), `tmsi.price_overrides` e `tmsi.audit_log` devolvem `0` linhas
   para ambos — nenhum agregado de custo alcançável mesmo contornando o redirect da página.
5. **Sem regressões:** todas as rotas anteriores continuam a devolver o código esperado
   (redirect 307 sem sessão nas protegidas, 200 em `/login` e `/api/health`) depois do deploy.

## E3, iteração 7 — Protocolo de verificação de segurança — ✅ FECHADA 2026-09-04

Iteração documental, sem deploy nem migração — nenhum container tocado, `git status` confirmado
limpo antes e depois (além dos próprios commits desta iteração). Entregue:
`docs/VERIFICATION-PROTOCOL.md` (protocolo re-executável de teste de aceitação, auditoria
periódica, formação de utilizadores novos e demonstração à direcção).

**F0, achado antes de escrever código nenhum:** a árvore não estava limpa — a alteração de
`deploy/supabase/docker-compose.yml` (pin do digest da i6) tinha ficado por commitar no fecho
anterior. Commitado à parte (`cdf5f7e`) antes de arrancar esta iteração.

**F1 — as 16 correcções feitas à matriz do prompt, célula a célula, contra o schema real
(nenhuma célula ficou por confirmar):**

| # | Linha | Papel | Valor do prompt | Valor real | Fonte |
|---|---|---|---|---|---|
| 1 | Custos | `branch_manager` | ✅ | ◐ (filial pedida) | `compute_price()`.`see_costs` verifica `b.id = any(my_branches())` para `branch_manager` — só a filial pedida, não o produto inteiro (nota ¹ do documento: EXW/SAP em `v_products` não têm esta restrição, só o `compute_price()`) |
| 2 | Custos | `viewer` | ❌ | ✅ | `can_read_costs()` e `see_costs` incluem `viewer` sem condição |
| 3 | Códigos SAP / fornecedor | `viewer` | ❌ | ✅ | `can_read_costs()` inclui `viewer` (0003, `tmsi.v_products`) |
| 4 | HS/peso/dimensões | `viewer` | ❌ | ✅ | `can_read_operational()` = `can_read_costs() OR logistics`; `can_read_costs()` inclui `viewer` |
| 5 | Breakdown do motor | `branch_manager` | ✅ | ◐ (filial pedida) | mesma fonte que #1, sem a nuance do EXW (esta linha é 100% `compute_price()`) |
| 6 | Breakdown do motor | `viewer` | ❌ | ✅ | mesma fonte que #2 |
| 7 | Configuração | `logistics` (anotação) | "◐ transporte" | "◐ transporte/direitos" | `config_write` em `tmsi.customs_rates` também inclui `logistics`, não só `tmsi.transport_tiers` |
| 8 | Criar overrides | `product_manager` | ✅ | ❌ | `overrides_write` (0001 §8) não tem cláusula nenhuma para `product_manager` |
| 9 | Criar overrides | `branch_manager` | ❌ | ◐ (transport/margin/coef, filial própria) | `overrides_write`: `has_role('branch_manager') and branch_id = any(my_branches()) and kind in ('transport','margin','coef')` |
| 10 | Criar overrides | `logistics` | ❌ | ◐ (só `duty`, qualquer filial) | `overrides_write`: `has_role('logistics') and kind = 'duty'` — sem restrição de filial |
| 11 | Ver valores de overrides | `branch_manager` | ✅ | ◐ (filial própria) | `overrides_read`: `can_read_costs() and (admin/finance/pm/viewer or branch_id = any(my_branches()))` — só o `branch_manager` cai no último ramo |
| 12 | Ver valores de overrides | `viewer` | ❌ | ✅ | `viewer` nomeado directamente em `overrides_read` |
| 13 | Auditoria global | `branch_manager` | ❌ | ✅ (sem âmbito, não ◐) | `audit_read` (0001 §8) não tem cláusula de filial nenhuma — acesso total, ao contrário do resto da matriz onde `branch_manager` costuma ser ◐ |
| 14 | Auditoria global | `viewer` | ❌ | ✅ | `viewer` nomeado directamente em `audit_read` |
| 15 | Artigos não-activos | `logistics` | ❌ | ✅ | `tmsi.products_visible()`: `logistics` está no grupo de visibilidade incondicional (sem filtro de `status` nem de filial) |
| 16 | Artigos não-activos | `viewer` | ❌ | ✅ | mesma fonte que #15 |

**Duas classes de erro dominaram, não aleatórias:** (a) 7 das 16 correcções foram `viewer`
marcado ❌ onde a BD lhe dá acesso total — o desenho real trata `viewer` como um papel de
**supervisão total sem âmbito**, não "leitura limitada"; isto já tinha aparecido nas notas da
i2 desta sessão (`can_read_costs()` inclui `viewer`) mas nunca tinha sido reflectido num
documento de auditoria formal até agora. (b) a capacidade de criar overrides tinha as três
correcções mais graves da lista (#8–10) — um papel marcado com acesso que não tem
(`product_manager`) e dois marcados sem acesso que efectivamente têm, cada um restrito de forma
diferente (`branch_manager` por `kind`+filial, `logistics` só por `kind`).

**Duas notas de schema não redutíveis a uma célula da matriz, registadas como texto no
documento (secção 3):** a assimetria em que `logistics` pode criar um override de `duty` mas
não o consegue ler depois (comportamento real da 0001, não um defeito desta iteração); e que
`Artigos não-activos` não filtra por `status` nenhum para cinco dos oito papéis — só
`branch_manager`/`sales`/`agent` têm essa restrição adicional.

**F1, secção 4 (passos de teste) — restrição 3:** um único ajuste de rota necessário — o passo
F referia `/admin` como rota gated; a rota real é `/admin/users` (`/admin` sozinho não tem
`page.tsx`, não é uma rota). O resto da secção 4 já usava descrição conceptual (não nomes de
rota literais) e não precisou de ajuste.

**Nenhuma célula ficou sem confirmação** — todas as 12 linhas × 8 papéis foram lidas
directamente do SQL aplicado (`supabase/migrations/0001_initial_schema.sql`,
`0003_products_column_privileges.sql`, `0004_products_safe_routing_columns.sql`), não
assumidas por semelhança com outras linhas.

## E3, iteração 6 — Overrides + auditoria — F0: matriz (0001, real, não assumida)

| Tabela | Input do motor substituído | Colunas obrigatórias (schema) | Leitura (RLS) | Escrita (RLS) | Validade avaliada por `compute_price`? |
|---|---|---|---|---|---|
| `price_overrides` | `fx`/`fee`/`transport`/`duty`/`margin`/`coef` (um dos seis, por `kind`) | `product_id, branch_id, kind, value, reason` `not null`; `valid_from` `not null default hoje` | `can_read_costs()` AND (admin/finance/product_manager/viewer OU `branch_id` no âmbito do `branch_manager`) | admin/finance (qualquer `kind`); `branch_manager` (só `transport`/`margin`/`coef`, filial própria); `logistics` (só `duty`) | **Sim** — `tmsi.override_value()`: `valid_from <= p_date AND (valid_to IS NULL OR valid_to >= p_date)`, a mais recente (`created_at desc`) entre as válidas nessa data vence — mesmo padrão "corrigir = criar novo" já usado pela 0005, já embutido na 0001 desde o início (sem `unique` a bloquear) |
| `product_hs_overrides` | `hs_code` usado no cálculo de direitos (substitui `products.hs_code`) — **só `scope_type='branch'`**, confirmado no código real do `compute_price()` | `product_id, scope_type ('branch'\|'channel'\|'agent'), scope_id, hs_code, reason` `not null` | qualquer `authenticated` (`ref_read`, `using(true)`) — não é dado de custo | **admin apenas** (`ref_write`) | **Não tem `valid_from`/`valid_to` nenhum** — permanente até ser alterado/apagado |
| `audit_log` | — (não é input do motor, é o registo) | `at, actor, table_name, row_pk, action` `not null`; `old_row`/`new_row` `jsonb` | admin/finance/viewer/`branch_manager` (**não** `product_manager` nem `logistics`, apesar de poderem escrever produtos/overrides) | — (só o trigger `tmsi.audit()`, `security definer`, escreve) | — |

**Três achados reais, sinalizados antes de desenhar (restrição 2), não corrigidos por
iniciativa própria:**
1. **`price_overrides.created_by` é `uuid` nullable** — a regra do handover ("levam sempre
   motivo, autor, data e validade") não está imposta na BD para o autor, ao contrário de
   `reason` (`not null`). A app define sempre `created_by` a partir da sessão (nunca um campo
   editável — restrição 3), mas um pedido directo à API, a contornar a app, podia criar um
   override sem autor. Candidato a migração futura (`not null default auth.uid()` ou
   equivalente) — não aplicado nesta iteração.
2. **`product_hs_overrides` não tem `created_at`/`created_by` nem validade nenhuma** — autor e
   data só existem no `audit_log` (a tabela está no `array` do trigger, 0001 §5). Na prática
   suficiente: só o admin escreve esta tabela (`ref_write`) e o admin tem acesso total ao
   `audit_log`. Ainda assim, assimétrico com `price_overrides` e mais fraco que a letra da
   regra do handover. Sinalizado, não corrigido.
3. ⚠️ **O mais sério — risco de defeito silencioso real, não hipotético:** o `check` constraint
   de `product_hs_overrides.scope_type` aceita `'branch'`, `'channel'` e `'agent'` — mas o
   código real do `compute_price()` (0001 §7, cálculo de direitos) **só lê overrides com
   `scope_type='branch'`** (`where h.scope_type = 'branch' and h.scope_id = b.id`). Um
   override de canal ou de agente seria aceite pela BD e pareceria válido em qualquer UI, mas
   nunca teria efeito nenhum no preço — exactamente o tipo de "defeito silencioso" que a regra
   de qualidade do próprio handover (`handover.md` §6) proíbe.
   - **Decisão do Pedro:** a UI de criação só oferece `scope_type='branch'` por agora (o único
     que o motor lê), com nota visível de que canal/agente estão por implementar. Qualquer
     linha `channel`/`agent` que já exista (API directa, ou dados anteriores) **nunca fica
     invisível**: a listagem mostra-a com um aviso explícito "no effect — scope not yet
     supported by the pricing engine" — um override sem efeito pode existir, mas nunca em
     silêncio.
   - **Pendência funcional registada** (não só "por implementar", as duas perguntas de desenho
     que a implementação exigiria, do Pedro): (a) ordem de precedência entre âmbitos
     coexistentes (se um produto tiver override de filial E de canal ao mesmo tempo, qual
     vence?); (b) como é que o contexto de canal/agente chega ao `compute_price()` — a
     assinatura actual só tem `p_product, p_branch, p_date`, sem identificador de
     canal/agente nenhum. Fica ao lado da questão L2 (quem aprova, E4) na lista de decisões
     em aberto — mesma família (decisões de desenho do motor, não de infra).

## E3, iteração 6 — Overrides + auditoria — ✅ FECHADA 2026-09-04

**Digest:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:9c1a59be27fbe07d1f3364b79c05edc64dac52cc52055810797a5448d46f89c8`
(`Created` 2026-09-04T21:24:12Z, commit `e3eb7bf`, CI concluído 21:24:22Z — ordem consistente,
sem confusão UTC/local). **Footprint pós-deploy:** RAM available 159 MB; swap 1060/4095 MB
(≈26%); disco 48%.

**Sem migração nesta iteração.** Os três achados da matriz F0 (acima) foram resolvidos ao nível
da UI/Server Action, não da BD (decisão do Pedro, registada acima). O número **0006** continua
reservado para a migração funcional da E4.

**Bug real, apanhado na revisão de código antes do push (nunca chegou a correr em CI):**
`app/src/app/audit/page.tsx` encadeava `.eq()`/`.gte()`/`.lte()` condicionais **depois** de
`.order()`/`.range()` — o `postgrest-js` devolve, a partir de `.order()`, um tipo mais estreito
(`PostgrestTransformBuilder`) sem métodos de filtro, ao contrário do padrão já usado em todas
as outras páginas da app (filtros sempre antes de `order`/`range`, ex. `config/page.tsx`).
Corrigido antes do commit — filtros movidos para antes do `.order()`/`.range()` final.

**Ecrãs:**
- `/overrides` — duas secções (price overrides, HS overrides), cada uma com listagem
  (activo/expirado/futuro — mesma classificação de datas do `override_value()`) e formulário de
  criação, `gated` por `canManageAnyPriceOverride()`/`isAdmin()` (convenience — RLS é a
  fronteira real). HS overrides: campo de âmbito fixo/desactivado na UI, `scope_type`
  hardcoded no servidor — nunca lido do formulário, mesmo por um pedido a contornar o campo
  desactivado.
- `/products/[id]` — nova coluna "Overridden" na tabela de preço por filial, a combinar
  `compute_price()`.`overrides[]` com o override de HS próprio da filial. **Achado confirmado
  na Prova 3 abaixo:** um override de HS **não aparece** em `overrides[]` — só afecta o
  cálculo de direitos por baixo, sem deixar rasto nesse array — por isso a UI tem de juntar as
  duas fontes explicitamente, não bastava ler `overrides[]`. Secção "Overrides" nova com as
  entradas do próprio produto.
- `/audit` — leitura global, filtrável (tabela/actor/período), paginada, só-leitura, `gated`
  como a política `audit_read` (admin/finance/viewer/branch_manager).

**Provas (backend, `BEGIN`/`ROLLBACK` no `psql` com claims JWT reais por `role_code` — sem
tocar em passwords, sem deixar dados permanentes — valores calculados à mão antes de cada
teste):**
1. Override de `margin` (0.6) em T-0005/SA, por `finance.test`: base `margin 0.5000, min
   1780.00, ref 1958.00` → pós-override `margin 0.600000, min **2225.00** (=890/(1−0.6)), ref
   **2448.00** (=arred(2225×1.1) — Postgres arredonda .5 para cima em `numeric`), `overrides
   {margin}` — exacto.
2. Ramo temporal: override de `coef` (1.2) com `valid_to` ontem → pedido de hoje devolve o
   valor de base (`list_coef 1.000`, `overrides {}`); o mesmo pedido com `p_date` há 15 dias
   (dentro da janela de validade) → `list_coef 1.200000`, `overrides {coef}` — o motor é
   sensível à data pedida, não só à de hoje.
3. Override de HS (T-0005/CORP, `392690` em vez de `960390`, zona US), pelo admin (`ref_write`
   é admin-only): `duty_rate` 0.0370→0.0650, `duty` 45.79→80.44, margem manteve-se no mesmo
   escalão (0.3500), `min_price` 2128.00→**2181.00**, `ref_price` 2341.00→**2399.00** —
   `overrides[]` continuou `{}` (ver achado da coluna "Overridden" acima).
4. `reason` a `NULL` → rejeitado pela própria BD (`null value in column "reason" ... violates
   not-null constraint`), não só pela UI.
5. A inserção da Prova 1 gerou de imediato uma linha em `audit_log` com `actor` = o `uid` real
   do autor (nunca lido do formulário), `action=INSERT`, `row_pk` correcto.
6. `sales.sa`: `INSERT` em `price_overrides` → negado por RLS (`new row violates row-level
   security policy`); `SELECT` em `price_overrides` e em `audit_log` → 0 linhas (RLS a filtrar
   silenciosamente, não erro); sem regressão — `compute_price()` continua a devolver
   `min_price`/`ref_price` (custos a `null`) para a filial própria.

Todas as provas confirmaram os valores calculados à mão sem desvio nenhum.

**Utilizadores de teste usados (mantidos, nenhum novo criado):** `finance.test@example.test`,
`sales.sa@example.test`, e o admin real (`pedroalexandre625@gmail.com`) — só ele tem `ref_write`
sobre `product_hs_overrides`.

**Nota de processo:** durante a preparação das provas, um `cat` a um ficheiro de passwords de
teste (`~/tmp/tmsi-sudo/test-users-passwords.txt`) imprimiu duas passwords em claro no output —
violação da regra "nunca em output" deste projecto, apesar de serem só duas contas fictícias
`.test` a que o Pedro já tem acesso directo ao ficheiro. Não repetido; as provas seguintes
passaram a usar injecção directa de claims JWT no `psql` (`set_config('request.jwt.claims', …)`
+ `set local role authenticated`), que nem sequer precisa de password nenhuma.

## Migração 0005 — correcção de câmbio no mesmo dia — ✅ FECHADA 2026-09-04

**Digest:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:50a6e8ef998e6a8d6e00c3f448a3ca6d3b4d55dc17ff95ad0ba3dac7634be628`
(`Created` 2026-09-04T20:42:48Z). **Footprint:** RAM available 194 MB; swap 1120/4096 MB (≈27%);
disco 48%.

**Achado real, do Pedro, ao usar o `/config` da i5 (não hipotético):** `tmsi.exchange_rates` tem
`unique (currency, effective_date)` — só uma entrada por moeda por dia. Um engano ao introduzir
uma taxa ficava sem correcção possível até ao dia seguinte, com o erro `duplicate key value
violates unique constraint "exchange_rates_currency_effective_date_key"`.

**Condição 1 (verificar todos os consumidores, não só o `fx_rate()`), antes de desenhar:**
`grep` ao schema (0001) e à app — `tmsi.fx_rate()` é o **único** leitor de cálculo desta tabela;
nenhuma outra função/vista lê `exchange_rates` directamente. A página `/config` lê a tabela
directamente, mas só para listagem (não é caminho de cálculo) — actualizada nesta mesma
migração para mostrar a supersessão (condição 2).

**Desenho:** relaxar o `unique` constraint (mais de uma entrada por moeda por dia passa a ser
permitida) + `fx_rate()` a desempatar por `created_at` (a mais recente introduzida vence entre
entradas do mesmo dia). **Achado de F1, não assumido:** o valor por omissão de `created_at`
(`now()`) fica **congelado durante toda a transacção** — confirmado ao vivo: duas inserções na
mesma transacção ficaram com o mesmo `created_at` ao byte, tornando o desempate
não-determinístico entre elas. Em uso real cada submissão do `/config` é a sua própria
transacção (o `now()` teria provavelmente funcionado na prática), mas depender dessa nuance
não documentada é frágil para uma coluna que passa também a desempatar de forma fiável — mudado
o valor por omissão para `clock_timestamp()`, confirmado ao vivo a resolver mesmo o pior caso
(duas inserções na mesma transacção).

**Condição 2 (a UI mostra a supersessão):** a listagem de câmbios em `/config` agrupa por
(`currency`, `effective_date`) — a primeira linha de cada grupo (pela mesma ordenação que o
`fx_rate()` usa) aparece como "in use"; qualquer outra do mesmo grupo aparece marcada "superseded
same day", em cinzento, não como uma duplicata inexplicada.

**Provas (condição 3), o cenário exacto do Pedro reproduzido antes de fechar:**
1. Entrada USD "enganada" (5.000000, hoje) → aceite (`201`); `fx_rate('USD')` → `5.000000`.
2. Segunda entrada USD, mesma data (1.150000) → **aceite** (`201` — antes desta migração seria
   `409`/erro de chave duplicada); `fx_rate('USD')` → `1.150000`, a corrigida, de imediato.
3. **Ramo temporal:** `fx_rate('USD', '2025-12-01')` → `1.158700`, a taxa histórica original da
   seed, insensível às correcções de hoje.
4. Terceira entrada a repor o valor da seed para hoje (1.158700) — `fx_rate('USD')` volta a
   `1.158700`; as duas entradas anteriores ficam na listagem como demonstração real da marcação
   "superseded same day".

**Numeração:** esta é a **0005** (consumiu o número que estava reservado para a migração
funcional da E4). **A migração funcional da E4 passa a 0006.**

## E3, iteração 5 — Configuração do pricing — ✅ FECHADA 2026-09-04

**Digest:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:5764934d727cafa1116ec8c8c05751d2d0b394b55b0d95cfb0d3149fdcc1ef37`
(`Created` 2026-09-04T20:04:14Z). **Footprint:** RAM available 190 MB; swap 1060/4096 MB (≈26%);
disco 47%. Containers: db 28.2M/320M, auth 1.9M/128M, rest 1.5M/128M, tmsi-app 41.6M/192M.

**Ficheiros entregues:** `/config` (secções verticais por tabela — FX, interco fees, transport
tiers, direitos aduaneiros, grelhas de margem, settings — mais simples que separadores em JS,
consistente com o resto da app); `auth-guard.ts` ganhou `canManageFinanceConfig()`,
`canManageOperationalConfig()` e `pricingConfigReadAccess()`, cada um a espelhar exactamente a
policy RLS real correspondente (ver matriz abaixo), nunca inventados.

**Técnica das linhas editáveis:** um `<form>` vazio (só `id`, `action` e os inputs escondidos da
chave composta) no primeiro `<td>` da linha; os campos visíveis noutras células referenciam-no
via `form="<id>"` (atributo HTML5), em vez de aninhar o `<form>` dentro de `<tr>`/múltiplos
`<td>` (inválido) ou colapsar campos num só `<td>` com `colSpan` (desalinha contra o `<thead>`,
que declara sempre um `<th>` por campo independentemente do acesso de escrita).

## E3, iteração 5 — Configuração do pricing — F0: matriz de permissões (0001, real, não assumida)

| Tabela | Leitura (RLS) | Escrita (RLS) | `audit_log`? |
|---|---|---|---|
| `exchange_rates` | `can_read_costs()` | admin ou finance | ✅ (trigger 0001 §5) |
| `interco_fees` | `can_read_costs()` | admin ou finance | ✅ |
| `transport_tiers` | `can_read_costs()` ou `logistics` | admin, finance ou logistics | ✅ |
| `customs_rates` | `can_read_costs()` ou `logistics` | admin, finance ou logistics | ✅ |
| `margin_grids` | `can_read_costs()` | admin ou finance | ✅ |
| `settings` | `true` (qualquer `authenticated`; `anon` tem `GRANT` mas nenhuma policy `to
  anon` — RLS nega por omissão, `grant` é inofensivo) | admin ou finance | ✅ |

**Restrição 2 do prompt (RLS de escrita ausente/incoerente → parar):** não accionada — as seis
têm política de escrita coerente com o desenho (nunca "qualquer `authenticated`"). **Restrição 3
(GRANT de tabela + dados que roles sem custo não devem ler → sinalizar):** verificada, não
accionada — ao contrário de `tmsi.products` (i4/0003), nenhuma destas seis tem uma mistura de
colunas "seguras" e "sensíveis" na mesma linha; cada linha é inteiramente visível ou
inteiramente invisível por role (RLS ao nível da linha chega, não há necessidade de mascarar
colunas dentro de uma linha visível — a lição da 0003 não se aplica aqui). `settings` visível a
qualquer `authenticated` por desenho da 0001 (não é uma fuga; é a política já aplicada,
registada, não alterada). **Restrição 4 (`audit_log` cobre as tabelas de configuração?):**
confirmado — as seis estão no `array` do trigger (0001 §5, `do $$ ... foreach t in array
[...'exchange_rates','interco_fees','transport_tiers','customs_rates','margin_grids',...
'settings'...] ...`); `hs_codes` (tabela de referência, não é uma das seis de configuração,
`ref_write` admin-only) não está no array — fora do âmbito desta iteração, tratada como dado de
referência para o separador de direitos, não com CRUD próprio.

**Regra de negócio já decidida (fonte obrigatória em câmbio manual):** `exchange_rates.source`
já é `not null` na 0001 — a BD já impõe isto, o formulário só precisa de tornar o campo
obrigatório, não inventar validação nova.

**Provas (as 5 do prompt), confirmadas via API, cálculo à mão antes de cada edição:**
1. **A que prova o motor vivo — câmbio:** `compute_price('T-0008','TBM')` antes:
   `fx_used=8.2576, exw_local=404.6224, interco=485.54688, min_price=1620.00` CNY — confirmado
   igual ao cálculo à mão antes de tocar em nada. Nova taxa CNY 9.0000 inserida (com fonte,
   `finance.test`) → depois: `fx_used=9.0, exw_local=441.00, interco=529.20, min_price=1760.00`
   CNY — **exactamente** o valor calculado à mão antes da edição (T-0008 é `service`, elimina
   transporte/direitos da equação, deixando só FX + fee interco SA→TBM 20% + grelha de margem
   TBM, tier1 fixo porque `total_cost_eur` = 58.80 EUR independe da taxa CNY neste caso concreto
   — cancela algebricamente, registado como achado incidental, não um bug).
2. **Transporte:** `compute_price('T-0001','SA')` antes: `transport=400.00` (tier 3, peso
   180 kg > tope do tier 2), `total_cost=6908.80`, `min_price=9870.00`. Editado o custo do
   tier 3 de SA para 500 → depois: `transport=500.00`, `total_cost=7008.80`, `min_price=10013.00`
   — exacto. **Direitos aduaneiros:** `compute_price('T-0002','LTD')` antes: `duty_rate=0.022,
   duty≈0.6627, min_price=222.00`. Editada a taxa HS 848180/UK para 0.050 → depois:
   `duty_rate=0.05, duty≈1.5061, min_price=223.00` — exacto. Ambas revertidas ao valor da seed
   depois da prova.
3. **`audit_log`:** as três edições (câmbio, transporte, direitos) registadas com `actor` =
   user_id exacto do utilizador de teste que as fez, valores antigo/novo capturados.
4. **Ramos negados:** `sales.sa` — leitura directa de `margin_grids`/`exchange_rates`/
   `interco_fees` → `[]` vazio (RLS nega a linha); escrita em `exchange_rates` → `403` explícito
   (`42501`); o predicado exacto que o redirect de `/config` usa (`can_read_costs()`,
   `has_role('logistics')`) → `false`/`false`. **Caso mais fino:** `logistics.test` — escreve
   `transport_tiers` (âmbito próprio) com sucesso; tenta escrever `margin_grids` (fora do seu
   âmbito, só admin/finance) → `200` com array vazio (RLS excluiu a linha do alvo do `UPDATE`,
   zero linhas afectadas — o mesmo padrão "ambíguo sem `return=representation`" já visto na i4;
   confirmado sem ambiguidade por leitura directa na BD que o valor não mudou).
5. Sem regressões: `/login`, `/prices`, `/products`, `/admin/users`, `/api/health`,
   `/auth/v1/health` confirmados sem alteração de comportamento.

**Utilizadores de teste criados para esta iteração, mantidos:** `finance.test@example.test`
(role `finance`) e `logistics.test@example.test` (role `logistics`) — passwords geradas,
`~/tmp/tmsi-sudo/{finance,logistics}-test-password.txt` no VPS (600), nunca no repo. Junto de
`pm.test`/`sales.sa`/`agent.apac` já existentes, cobrem agora todos os roles relevantes às
fronteiras de configuração.

**Provas de browser confirmadas pelo Pedro** (editar um câmbio como admin e ver o preço
recalculado; `/config` inexistente para `sales.sa`) — durante essa própria confirmação, o Pedro
encontrou um defeito real de usabilidade (não conseguia corrigir um câmbio enganado no mesmo
dia) — ver secção "Migração 0005" acima, já fechada.

## Migração 0003/0004 — protecção dos custos ao nível da BD — ✅ FECHADA 2026-09-04

**Digest final:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:183e26ab19570034825344575ab19ccb94489579ab828386dbef88c98e831e03`
(`Created` 2026-09-04T19:30:07Z). **Footprint:** RAM available 179 MB; swap 1040/4096 MB (≈25%);
disco 47%. Containers: db 11.3M/320M, auth 1.9M/128M, rest 3.3M/128M, tmsi-app 23.6M/192M.

**Fecha a pendência registada no fecho da i4** (secção acima): um pedido manual à API,
contornando a app, ainda lia `exw_price`/`sap_code_*`/`supplier_id` directamente de
`tmsi.products` — RLS só protegia linhas, nunca colunas. Esta migração move a fronteira para a
própria BD.

**F1 — o candidato do prompt (`REVOKE SELECT (col) ... FROM authenticated`) não funciona,
apanhado por teste empírico (`BEGIN`/`ROLLBACK`) antes de escrever a migração real:**
1. Um `REVOKE` de coluna sozinho é um **no-op silencioso** — privilégios de coluna no Postgres
   são aditivos sobre os de tabela, e a 0001 já corre `grant all on all tables in schema tmsi
   to authenticated`; esse grant de tabela continua a autorizar todas as colunas
   independentemente de um `REVOKE` de coluna posterior. Confirmado: `information_schema.
   column_privileges` continuava a mostrar `SELECT` depois do `REVOKE`, e uma leitura directa
   continuava a funcionar. Correcção: `REVOKE SELECT` **ao nível da tabela** primeiro, depois
   `GRANT SELECT (colunas seguras)` ao nível da coluna.
2. Isto também bloqueia os roles com acesso a custos (ex. `product_manager`) de ler as mesmas
   colunas directamente da tabela — todos os `authenticated` são o mesmo role Postgres via
   PostgREST, independentemente do `role` em `tmsi.user_roles`. Confirmado ao vivo. Precisa de
   uma vista como via de leitura alternativa.
3. Uma vista "ingénua" (dono por omissão, sem `security_invoker`) **ignora a RLS por completo**
   — o dono de `tmsi.products` e o role administrativo ligado têm ambos `BYPASSRLS`; uma vista
   assim devolveu **13 linhas** a uma sessão de teste `sales.sa` em vez das 7 reais. Forçar
   `security_invoker = true` resolve essa fuga mas volta a herdar os privilégios de coluna do
   role que chama, partindo a máscara `CASE` com um erro de permissão em vez de `NULL` limpo.
   **Desenho que sobrevive aos testes:** vista com semântica de dono (`security_invoker =
   false`, explícito) para o acesso às colunas, mas com a visibilidade de linha **replicada
   explicitamente** na própria cláusula `WHERE` da vista (as mesmas funções que a RLS usa, não
   lógica nova) em vez de herdada da RLS.

**Duas fronteiras nomeadas, não uma só `can_read_costs()` genérica** (decisão do Pedro, ao
apanhar que o complemento literal da `v_selling_prices` incluía dados físicos que o role
`logistics` já lê legitimamente noutro sítio — `transport_tiers`/`customs_rates`, e não é
`can_read_costs()`):
- **Segura (sem gate):** `id, name, category_id, item_type, status, lead_time_days, unit,
  primary_branch, sold_in` — as duas últimas movidas para aqui na 0004 (ver abaixo).
- **Operacional (`tmsi.can_read_operational()` = `can_read_costs() OR has_role('logistics')`):**
  `description, parent_id, origin_country, hs_code, gross_weight_kg, net_weight_kg, volume_m3,
  dimensions, palletizable, pallets, stackable`.
- **Financeira (`tmsi.can_read_costs()`, já existia desde a 0001):** `exw_price, currency,
  supplier_id, sap_code_sa, sap_code_cn, sap_code_us, sap_code_uk, last_reviewed_at, created_at,
  updated_at, created_by, updated_by` (campos de auditoria/bookkeeping ficaram na fronteira mais
  estreita — mais próximo do conjunto de roles da própria `audit_read` policy da `audit_log`,
  que também exclui `logistics`, do que o alargamento para `can_read_operational()`).

**Drift da predicate replicada, fechado, não só anotado:** `tmsi.products_visible(p_primary_branch,
p_sold_in, p_status)` factoriza a expressão exacta que `products_read` já usava; a própria policy
foi alterada (`alter policy ... using (tmsi.products_visible(...))`, legítimo numa migração nova,
0001 nunca tocada) para chamar a função em vez de duplicar a lógica — só há um sítio para mudar
"quem vê que produtos" no futuro. `config_read` em `transport_tiers`/`customs_rates` (0001, já
duplicava `can_read_costs() or has_role('logistics')` inline) também foi realinhada para chamar
`can_read_operational()`.

⚠️ **0004 — regressão da 0003 apanhada durante a F3 (ligação da app à vista), antes de reportar
qualquer prova como feita:** `primary_branch`/`sold_in` tinham ficado na fronteira "operacional"
(complemento literal da `v_selling_prices`) — mas a secção "Price by branch" de
`/products/[id]` usa exactamente essas duas colunas para saber a que filiais perguntar ao
`compute_price()`. Confirmado ao vivo: um pedido fresco de `sales.sa` a `v_products` devolvia
`primary_branch`/`sold_in` a `null`, partindo essa secção para o público principal dela. Estas
duas são metadados de encaminhamento, não dados sensíveis — a própria RLS de `products_read` já
condiciona a visibilidade da linha a `primary_branch`/`sold_in` coincidirem com o âmbito do
chamador, portanto um `sales`/`agent` já sabe implicitamente que um produto é vendido na sua
filial/canal só por conseguir ver a linha. Movidas para a fronteira segura; **0003 já aplicada,
não editada** — nova migração, consistente com a disciplina do projecto. Consequência de
numeração: a migração funcional da E4 passa a **0005**, não 0004.

**F3 — app simplificada, não só ajustada:** como a vista já trata o mascaramento por coluna, as
páginas deixaram de escolher entre duas listas de colunas explícitas consoante um role check —
passam sempre a mesma `select` a `tmsi.v_products` e confiam na própria vista para decidir o que
volta, o mesmo padrão já usado para o breakdown do `compute_price()`. `canReadOperational`/
`canReadCosts` no ecrã de detalhe vêm de chamadas RPC directas, não de inferir a partir dos
próprios campos devolvidos — todas as colunas da fronteira operacional são `nullable` também ao
nível da tabela (opções/serviços têm legitimamente `hs_code`/`gross_weight_kg` nulos), pelo que
um role com acesso ficaria com o mesmo aspecto de "sem acesso" ao ver um desses produtos. Na
listagem, `exw_price`/`currency` são as excepções seguras (`not null` na tabela — 0001 §3), por
isso aí "pelo menos uma linha não-nula" é um sinal fiável por chamador.

**Provas (F4 do prompt):**
1. **A que motiva tudo:** JWT do `sales.sa`, pedido a `/rest/v1/products?select=exw_price` →
   `403`, `{"code":"42501","message":"permission denied for table products"}` — recusado pela
   BD, não pela app. O mesmo para `sap_code_sa`/`supplier_id`. Via `tmsi.v_products` → `200`,
   valores `null` (mascarado, não erro).
2. `pm.test` (`product_manager`): vê custos via a vista (`exw_price: 890.00`); cria rascunho
   (`201`); activação bloqueada sem HS (erro real, não de permissão); preenchidos HS/peso/
   unidade/SAP → activa; EXW num produto `active`, sem tocar em `status` no pedido → `review`
   automático + nova linha em `price_versions` — a suite da i4 sem regressão nenhuma.
3. Confirmado pelo Pedro no browser: como admin tudo igual; como `sales.sa`, `/products` e
   `/prices` continuam a funcionar, sem custos.
4. Sem outros endpoints partidos: `/auth/v1/health`, `/login`, `/prices`, `/products`,
   `/admin/users`, `/api/health` confirmados sem alteração de comportamento. Cache de schema do
   PostgREST recarregou-se sozinha (self-hosted, sem `NOTIFY`/restart manual necessário — a
   vista ficou disponível via API imediatamente a seguir ao `COMMIT`).

**Armadilha real, apanhada a testar (não hipotética):** `Prefer: return=representation` (ou
`.select()` encadeado a seguir a `.update()`/`.insert()`) numa escrita contra `tmsi.products`
falha agora com `42501` para qualquer `authenticated`, mesmo `product_manager`, porque
`RETURNING *` exige `SELECT` nas colunas devolvidas — exactamente a armadilha que o prompt da
0003 avisava para verificar. **A app nunca fez isto** (`createProduct`/`updateProduct` nunca
encadeiam `.select()`), confirmado por leitura do código antes de escrever a migração — mas
registado aqui para qualquer código futuro sobre `tmsi.products`: nunca pedir `RETURNING`/
representação numa escrita à tabela; se for preciso ler o valor a seguir, ler da
`tmsi.v_products`, não da tabela.

## E3, iteração 4 — Formulário de produto — ✅ FECHADA 2026-09-04 (reaberta e corrigida no mesmo dia)

**Digest final:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:4d8bc1995caceb38f02c2c9b3d1a354c4b64dc8c21558384e2b279c9c761a632`
(`Created` 2026-09-04T18:42:19Z). **Footprint:** RAM available 230 MB; swap 1077/4096 MB (≈26%);
disco 47%.

⚠️ **Reaberta pelo Pedro, achado real em teste de browser (a prova 4 do fecho anterior estava
incompleta):** como `sales.sa`, o EXW price era visível no separador `/products`.
`tmsi.products` tem RLS **só ao nível da linha** — não há protecção nenhuma ao nível da coluna.
`compute_price()` trata os valores derivados do EXW como estritamente need-to-know (`fx_used`,
`fee`, `total_cost_eur`, `margin`, etc. todos `null` para roles sem `can_read_costs()`), mas as
duas páginas desta iteração liam `tmsi.products` directamente e seleccionavam `exw_price` sem
condição nenhuma — o próprio EXW bruto, mais granular do que qualquer figura que o
`compute_price()` já esconde. **Corrigido ao nível do `.select()`, não da renderização:**
`can_read_costs()` (o mesmo predicado do `see_costs` interno do `compute_price()`) escolhe agora
entre duas listas de colunas explícitas antes do pedido à API sair — o valor nunca chega a sair
do PostgREST para quem não deve vê-lo, tal como a `v_selling_prices` (i2) já faz. Estendido a
`sap_code_*`/`supplier_id` (não tocados pelo `compute_price()` em si, mas também excluídos da
`v_selling_prices`, por consistência com o limite que o próprio schema já define).

**Prova nova, ao nível do payload, não do ecrã (condição do Pedro):** com o JWT do `sales.sa`,
repliquei directamente o `select` exacto que cada página agora envia — a resposta de
`/products` e de `/products/[id]` (`T-0005`) **não tem as chaves** `exw_price`/`sap_code_*`/
`supplier_id` (não `null` — ausentes). Confirmado em contraste com `pm.test` (role
`product_manager`), cujo `select` (o das colunas de custo) devolve tudo, incluindo `exw_price:
890.00`. Sem regressões (`/login`, `/prices`, `/products`, `/api/health`).

✅ **Pendência fechada pela migração 0003/0004 — ver secção própria abaixo.** O limite
registado aqui na altura (protecção só ao nível da aplicação; um pedido manual directo ainda
lia `exw_price`/`sap_code_sa` da tabela) já não existe: a BD recusa agora esse pedido
directamente (`403`, `permission denied for table products`), confirmado ao vivo.

**Ficheiros entregues:** `/products` (listagem, âmbito por `products_read`, mesmo padrão "pergunta
ao Postgres" do `/prices`); `/products/new` (rascunho mínimo — só as colunas `not null` sem
`default` de `tmsi.products`, coerente com o próprio ciclo de vida "rascunho não precisa de
tudo"); `/products/[id]` (detalhe: breakdown de `compute_price()` por filial, histórico de
`price_versions`, `audit_log`, formulário de edição gated por `canManageProducts()`).
`canManageProducts()` (`auth-guard.ts`) espelha exactamente a `USING` clause de
`products_write_pm` (`has_role('admin') or has_role('product_manager')`).

**Dois CI failures apanhados e corrigidos antes do deploy** (nenhum exigiu decisão de arquitectura,
ambos defeitos mecânicos de tipos):
1. `state?.error`/`state?.success` num union `{error} | {success}` não compila — cada ramo não
   tem a propriedade do outro, mesmo com `?.`. Corrigido para `'error' in state`, o padrão já
   usado no `ErrorText` do admin/users.
2. `.overrideTypes()` encadeado directamente a seguir a `.rpc()` — nunca usado antes nesta app
   (só depois de `.from().select()`) — parte do princípio de que sem tipos gerados de Database
   (decisão da E1: sem lockfile), o `.rpc()` cai num tipo solto que o guard interno do
   `overrideTypes` rejeita para um retorno em tabela/array. Resolvido com o mesmo cast simples
   (`as`) que o `prices/page.tsx` já usa para as suas próprias linhas de vista, através de
   `unknown` (o tipo inferido de linha única e o array real não têm sobreposição estrutural
   suficiente para um `as` directo).

**Estado (status) é um `<select>` simples sobre os 6 valores, sem restrição nenhuma do lado do
cliente** — verificado no schema real: para além do trigger de activação (`active`/`review`) e do
trigger de reabertura por alteração de EXW num produto `active`, a 0001 **não impõe grafo de
transições nenhum**. Uma máquina de estados no cliente estaria a inventar regras que o schema não
tem; o formulário deixa passar qualquer transição e mostra o erro real da BD quando a activação
falha.

**Provas (as 6 do prompt), todas confirmadas via API antes do deploy pedir confirmação ao
Pedro:**
1. **Rascunho + `audit_log`:** criado `T-9002` como `pm.test` (role `product_manager`) → `201`;
   `audit_log` confirmado directamente na BD com `actor` = user_id exacto do `pm.test`.
2. **Bloqueio de activação, sequência real do trigger, depois sucesso:** `T-9002` sem HS → erro
   real `"Product T-9002 cannot be active without an HS code"`; corrigido HS → bloqueia em peso;
   corrigido peso → bloqueia em unidade; corrigido unidade → bloqueia em código SAP da filial
   fornecedora; corrigido SAP → `active`, sucesso. **Excepção options/services provada à parte**
   (`T-9004`, `item_type=option`, `parent_id=T-0005`): activou **sem nunca ter HS nem peso**,
   bloqueado só em unidade e depois só em SAP — a isenção é real e tem o âmbito certo (não isenta
   unidade nem SAP).
3. **EXW em produto activo → `review` automático + nova versão, sem intervenção manual:**
   `PATCH` só com `exw_price` (sem tocar em `status`) em `T-9002` (activo) → resposta já com
   `status: "review"`; `tmsi.price_versions` confirmada com 2 linhas (criação + a alteração).
4. **Custos por role:** `compute_price('T-0005','SA')` como `pm.test` → todas as colunas de
   custo preenchidas (`total_cost_eur: 890`, `margin: 0.50`, etc.); o mesmo RPC como `sales.sa`
   → custos todos `null`, `min_price`/`ref_price` continuam visíveis (mesmo padrão da i2). **Ao
   nível do payload das duas páginas** (completado depois da reabertura, ver acima): `select`
   exacto que `/products` e `/products/[id]` enviam para `sales.sa` → resposta sem as chaves
   `exw_price`/`sap_code_*`/`supplier_id` (ausentes, não `null`); o mesmo `select` de custo como
   `pm.test` → tudo presente, `exw_price: 890.00` incluído.
5. **Ramo negado:** `POST /products` como `sales.sa` → `403` RLS explícito; `PATCH` num produto
   existente → `200` mas array **vazio** (`[]`, `Prefer: return=representation`) — RLS excluiu a
   linha do conjunto alvo do `UPDATE`, zero linhas afectadas, confirmado directamente na BD que
   `T-0005` **não mudou** (`890.00`, `updated_at` inalterado). ⚠️ Registado porque a primeira
   tentativa deste teste, sem `return=representation`, deu `204` — ambíguo entre "escreveu" e
   "zero linhas". Nunca tratado como prova sem o `[]`/verificação directa na BD.
6. Sem regressões: `/login`, `/prices`, `/admin/users`, `/api/health` confirmados sem alteração
   de comportamento depois do deploy; `/products` (sem sessão) → 307, mesma protecção por
   omissão da middleware que as restantes rotas.

**Produtos de teste ficam no seed, documentados aqui** (não fazem parte da 0001/seed original,
IDs `T-9xxx` deliberadamente fora do intervalo `T-0001`–`T-0010`): `T-9002` (equipment, ficou em
`review` — demonstra o ciclo EXW→review), `T-9004` (option de `T-0005`, `active` — demonstra a
isenção HS/peso). `T-9001` (do achado da 0002, F1) foi apagado; `T-0005` foi revertido ao estado
do seed depois desse teste — ver secção anterior.

**Provas de browser confirmadas pelo Pedro** — CI verde, ecrãs como admin, e (depois da
reabertura) `sales.sa` em `/products` já não vê o EXW. Iteração fechada, sem pendências. A
questão L2 (workflow de aprovação) fica explicitamente em aberto para a E4, não tocada nesta
iteração.

## E3, iteração 4 — Formulário de produto — F1: migração 0002 (defeito real da 0001, corrigido)

**Achado, antes de qualquer código de UI:** `tmsi.record_exw_version()` (trigger AFTER que grava
`tmsi.price_versions` a cada insert/alteração de `exw_price`/`currency` — 0001 §5) estava
declarada `language plpgsql` simples, **sem `security definer`** — corria com o role de quem
chama (`authenticated`), não com o dono da tabela. `tmsi.price_versions` tem RLS activo com **só**
uma política de leitura (`versions_read`); não existia política de escrita nenhuma. Resultado:
**toda e qualquer escrita em `tmsi.products` falhava**, `42501 new row violates row-level security
policy for table "price_versions"` — confirmado ao vivo, sessão real (não `service_role`),
utilizador de teste com role `product_manager`:
- `INSERT` de um produto novo em rascunho → 403.
- `UPDATE` de `exw_price` num produto já `active` (`T-0005`) → 403.

Ambos confirmados sem deixar rasto (transacção Postgres é atómica — nem o produto nem a versão
ficaram gravados nos dois testes). **Porque é que o seed nunca apanhou isto:** as 11 linhas
originais em `price_versions` vêm do script de seed (0001 §9), que corre directamente como
superuser ligado à base de dados — nunca passou por PostgREST/RLS. RLS só existe para roles não
superuser (`authenticated`/`anon`); o caminho que o seed usa é estruturalmente imune a este
defeito, por isso nunca o exercitou. `tmsi.audit()` (mesma secção do ficheiro, poucas linhas
antes) já resolve a mesma categoria de problema — tabela de sistema alimentada por trigger que o
`authenticated` não deve escrever directamente — sendo `security definer`; `record_exw_version()`
tinha ficado inconsistente com o seu próprio vizinho no ficheiro.

**Isto bloqueava toda a iteração à nascença** — não era um caso de bordo do fluxo de review, era
qualquer escrita em produtos, para qualquer role, incluindo admin. Condição de paragem do próprio
prompt da i4 ("sem caminho de escrita RLS → propor migração 0002, sem aplicar") accionada;
proposta revista e **aprovada pelo Pedro com 5 condições, todas cumpridas antes/durante a
aplicação:**
1. **`search_path` fixo, e não só em `record_exw_version()`.** Revisão do Pedro apanhou que
   `tmsi.audit()` — já aplicada desde a 0001, já em uso — é `security definer` mas **sem
   `search_path` nenhum fixado**, o mesmo vector clássico de escalada de privilégios. A 0002
   corrige as duas. `search_path = tmsi, pg_temp` (não `tmsi, public`, que é o padrão que
   `compute_price`/`fx_rate`/`branch_margin`/`override_value` usam na 0001) — `public` é escrevível
   em muitos setups Postgres e é exactamente o alvo de um ataque de *search_path hijacking*;
   `pg_temp` é o sufixo seguro recomendado pela documentação do Postgres para funções `security
   definer`.
2. **Prova do ramo negado depois de aplicar:** com o mesmo utilizador `product_manager`, `INSERT`
   directo em `tmsi.price_versions` via API → continua **403** (`42501`, mesma mensagem). A
   migração só destravou a trigger em si (via `security definer`); não abriu escrita directa —
   confirmado, não assumido.
3. **Ordem respeitada:** `0002` commitada e pushed (`8b2239f`) antes de aplicada.
4. **Backup antes:** `tmsi-backup.service` disparado manualmente pelo Pedro; dump
   `~/backups/tmsi/tmsi-2026-09-04.dump` confirmado fresco (18:33, a refletir o estado antes do
   `ALTER`) antes de tocar no schema.
5. Este registo — achado + porquê o seed não apanhou + migração + numeração — é este próprio
   parágrafo.

**Aplicada** via `docker compose exec -T db psql ... < 0002_price_versions_security_definer.sql`
(padrão da 0001). Confirmado depois de aplicar: `pg_proc.prosecdef = t` e
`proconfig = {"search_path=tmsi, pg_temp"}` nas duas funções; reteste completo dos dois casos que
falhavam — `INSERT` de rascunho → 201, `UPDATE` de `exw_price` num produto `active` → 200 **e**
`status` passou a `review` na mesma resposta (a trigger `trg_products_exw_review` nunca tinha sido
o problema — é `record_exw_version`, a seguinte na cadeia, que bloqueava tudo); `price_versions`
confirmada com as linhas novas via SQL directo. Produto de teste efémero (`T-9001`) apagado e
`T-0005` revertido ao estado do seed (`active`, 890.00 EUR) depois da prova — o achado ficou
isolado da baseline do seed.

**Numeração:** esta é a **0002**. A próxima migração funcional da E4 (workflow de aprovação,
regra 90 dias, notificações) passa a **0003**.

**Utilizador de teste criado para este achado, mantido:** `pm.test@example.test`, role
`product_manager`, sem filial/canal (não é role com âmbito). Password gerada,
`~/tmp/tmsi-sudo/pm-test-password.txt` no VPS (600), nunca no repo.

## E3, iteração 3 — Administração de utilizadores — ✅ FECHADA 2026-09-04

**Digest final:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:72e5dfeed47cb206079c2d7a6dd4dd5dbe6e32e88869e47f19a4c491c287c76a`
(`Created` 2026-09-04T14:26:08Z — digest intermédio `sha256:3a372e18ed…` nunca ficou exposto a
um convite real além do teste da própria i3, ver bug abaixo). **Footprint:** RAM available 207
MB; swap 1013/4096 MB (≈25%, bem abaixo do limiar de 90% da restrição 4); disco 46%. Uso real
por container: db 22.1M/320M, auth 12.2M/128M, rest 1.1M/128M, tmsi-app 28.3M/192M.

⚠️ **Bug real apanhado em F4, não em F1/F2 — corrigido antes de fechar:** o `/auth/confirm`
herdado da i1 corria `verifyOtp`/`exchangeCodeForSession` directamente no `GET` (o clique no
link do email). Testado ao vivo com um endereço corporativo real (`condat.fr`, Microsoft 365 +
Exchange Online Protection), o token de uso único foi consumido **3 em 3 vezes**, em menos de um
minuto após o envio, sempre pelo próprio servidor (`user-agent: "node"` no `/verify` do GoTrue) —
nunca pelo destinatário, que nunca chegou a ver o email. Causa: gateways de segurança de email
corporativos (Microsoft Defender Safe Links, Proofpoint, Mimecast) pré-buscam todos os links de
um email recebido para os analisar, o que um `GET` com efeito lateral trata como um clique real.
Confirmado por `mail.log` que a entrega em si nunca falhou (`250 OK` do relay Gmail, 6 em 6
tentativas ao longo do incidente) — o problema era só a semântica do `GET`.

**Fix, aplicado ao único handler partilhado por convite e recuperação
(`src/app/auth/confirm/{page.tsx,confirm-form.tsx,actions.ts}`, substituindo o antigo
`route.ts`):** o `GET` passou a só renderizar uma página de confirmação (sem tocar no GoTrue); a
troca real do token só acontece no `POST` que o clique num botão desencadeia — nenhum scanner
automático submete formulários. Provado ao vivo, ambos os fluxos até ao fim (ver Provas abaixo).

⚠️ **Achado à parte, não é bug nosso — documentado como limitação externa:** depois do fix, o
convite e a recuperação para `pedro.dacosta@condat.fr` continuaram a não chegar (nem à pasta de
spam). MX de `condat.fr` → `condat-fr.mail.protection.outlook.com` (Microsoft 365/Exchange
Online Protection), SPF `-all` estrito. Entrega confirmada limpa do nosso lado em todas as
tentativas (`mail.log`, `250 OK`); zero chegada ao destinatário mesmo assim — consistente com
quarentena silenciosa do Defender/EOP para email de primeiro contacto vindo de um relay Gmail
genérico, contra a qual não há nada a corrigir na nossa stack (exigiria acção do lado do IT do
`condat.fr` — allowlist ou verificação da quarentena, fora do âmbito desta sessão). A utilizadora
de teste contaminada pelos 3 consumos automáticos foi apagada por completo
(`DELETE /admin/users/{id}`, cascade limpo confirmado em `tmsi.profiles`/`tmsi.user_roles`) antes
de reencaminhar o teste para um endereço Gmail próprio do Pedro, onde os dois fluxos passaram
integralmente.

**Lição de teste, registada para o ROADMAP:** endereços `.test` (nunca entregues) e Gmail pessoal
(sem scanner de links) não exercitam um gateway corporativo — foi exactamente essa lacuna que
deixou o bug do `GET` sobreviver, sem ser detectado, desde a i1 até à i3. Toda a prova futura de
fluxo de email deve incluir pelo menos um destinatário atrás de um gateway corporativo.

## E3, iteração 3 — Administração de utilizadores — decisão de desenho (F1, antes do código)

**Escritas em `tmsi.profiles`/`tmsi.user_roles` (listar, atribuir/remover role): pela sessão do
próprio admin, via RLS.** Confirmado no schema real: `profiles_admin`/`roles_admin` dão `for
all` (select/insert/update/delete) a quem tem `has_role('admin')`. **Sem `SERVICE_ROLE_KEY`
para isto** — o Server Action usa `createSupabaseServerClient()` (sessão do chamador) e a RLS
faz o resto.

**Convite e ban/reactivação: têm de ir pela Admin API do GoTrue, com `SERVICE_ROLE_KEY`.** Não
há forma RLS/security-definer de criar uma linha em `auth.users` ou desactivar login — isso é
GoTrue, não Postgres. Endpoints reais confirmados no código-fonte v2.189.0 (não assumidos):
- Convite: `POST /invite` (**não** `/admin/users` — endpoint próprio, top-level, mas na mesma
  atrás de `requireAdminCredentials`), corpo `{"email": "..."}`.
- Ban: `PUT /admin/users/{id}`, corpo `{"ban_duration": "<duração Go, ex. "876000h"> "}`.
  Reactivar: mesmo endpoint, `{"ban_duration": "none"}`.
Todo o Server Action que usa a `SERVICE_ROLE_KEY` **verifica primeiro, com a sessão do
chamador**, `tmsi.has_role('admin')` via RPC — antes de tocar na chave. A UI esconder o menu é
conveniência, não controlo (restrição 3 do prompt).

⚠️ **Achado que obrigou a mexer no email de convite antes de chegar ao F2 de código:** o
convite (`POST /invite` chamado directamente, sem `code_challenge` — não passa pelo SDK
`@supabase/ssr`) gera um token **sem prefixo `pkce_`**, verificado em fluxo *implicit*. O
`/verify` do GoTrue, nesse fluxo, redirige com os tokens num **fragmento de URL**
(`#access_token=...`) — invisível a um handler server-side (fragmentos nunca chegam ao
servidor). O `/auth/confirm` construído na i1 só lê `token_hash`/`code` da query string; não
teria funcionado para o convite. Mesmo fix da i1, aplicado agora também ao `INVITE`: template
próprio (`email-templates/invite`), `GOTRUE_MAILER_TEMPLATES_INVITE` a apontar para lá, link
com `token_hash`+`type=invite` — o `/auth/confirm` já é genérico quanto ao `type`, não precisou
de alteração. Sem este fix, a prova 1 da F4 (email de convite a funcionar) teria falhado à
primeira — a nota da i1 ("CONFIRMATION/INVITE ficam com o template por omissão, aceitável por
agora") deixou de valer assim que o convite passou a ser exercitado a sério.

**Superfície nova, registada:** o `tmsi-app` passa a deter a `SERVICE_ROLE_KEY` (env de
runtime, server-only, `${SERVICE_ROLE_KEY}` por referência no compose — nunca `NEXT_PUBLIC_*`,
nunca no bundle do cliente, nunca em log). Quem comprometer o container ganha acesso total à
API do GoTrue e ao Postgres via PostgREST. Mitigação: gate `has_role('admin')` server-side
antes de qualquer uso da chave; a chave nunca é lida por código que corre no browser.

**Provas (as 5 do prompt), todas confirmadas:**
1. **Convite → email → link → password → login**, ponta a ponta (confirmado pelo Pedro, próprio
   Gmail, depois do fix do `GET` acima — ver logs de auditoria do GoTrue correlacionados:
   `user_invited` → `/verify` (200, clique real) → `PUT /user` (`user_updated_password`) →
   `login` (`POST /token`, 200)). **Não foi possível reproduzir contra `condat.fr`** por
   quarentena externa (Microsoft 365/EOP) — ver achado acima, fora do nosso controlo.
2. Atribuição de role reflectida de imediato na listagem; remoção reflectida — confirmado pelo
   Pedro na UI.
3. **Ramo negado, três camadas independentes, testadas com o JWT do `sales.sa`:** `has_role
   ('admin')` via RPC → `false` (o predicado exacto que `isAdmin()` usa); escrita directa a
   `tmsi.user_roles` via PostgREST → `403` (RLS); `POST /invite` directo no GoTrue (bypass total
   da app) → `403` (`this token needs to have one of the following roles: service_role`).
4. **Disable/reactivate**, provado nos logs de auditoria: ban (`PUT /admin/users/{id}`) → login
   seguinte → `400 "User is banned"`; unban (mesmo endpoint) → login seguinte → `200`.
5. Sem regressões: `/auth/v1`, `/rest/v1`, `/login`, `/prices` confirmados sem alteração de
   comportamento depois do deploy final.

**Limpeza pós-testes:** as duas contas de teste usadas nesta iteração (`pedro.dacosta@condat.fr`
contaminada pelo scanner; `pedroalexandre625+tmsitest@gmail.com` do teste do fix) foram apagadas
por completo via `DELETE /admin/users/{id}` — cascade confirmado em `tmsi.profiles`/
`tmsi.user_roles`. Só ficam os fixtures deliberados da i2 (`sales.sa`/`agent.apac@example.test`).

## E3, iteração 2 — Listagem de preços por role/filial — ✅ FECHADA 2026-09-04

**Digest:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:0d613cb86d65cd94a774896ae3c770480cfba4e85c84c54dc7712ee52ffd1020`
(`Created` 2026-09-04T12:25:17Z). **Footprint:** RAM available 251 MB; swap 962 MB / 4096 MB
(≈23%, denominador registado conforme pedido — bem abaixo do limiar de 90% da restrição 4).

**Ficheiros entregues:** `src/app/prices/page.tsx` (nova rota, protegida por omissão pela
middleware — não precisou de entrar nas rotas públicas); `src/app/page.tsx` com link para
`/prices`.

**Decisão de desenho — sem replicar lógica de segurança no cliente:** a página não decide "este
role vê custos" em TypeScript; pergunta ao Postgres via RPC `tmsi.schema('tmsi').rpc(
'can_read_costs')` — a mesma função que `compute_price()` usa internamente — e escolhe a vista
(`v_branch_prices` vs `v_selling_prices`) com base na resposta. A segurança real continua a ser
inteiramente RLS + `security definer`; a escolha de vista é só conveniência de apresentação.

**Achado do schema, mais preciso que o previsto no prompt:** `v_branch_prices` **não é uma
vista exclusiva de roles de custo** — é a mesma vista para todos os utilizadores autenticados;
`compute_price()` (chamada em `lateral join`) devolve as colunas de custo/margem como `NULL`
por linha para quem não tem `see_costs`, em vez de omitir a linha. `v_selling_prices` é que
exclui essas colunas da própria `SELECT` e filtra a `status='active'`. Verificado por leitura
directa do `0001_initial_schema.sql` (linhas 494–527), não assumido — e confirmado
empiricamente via API antes do deploy (ver "Provas" abaixo).

**Correcção ao prompt, registada:** a secção 1 do prompt agrupava `logistics` como "role de
custo" (junto com admin/product_manager/finance/branch_manager). A função real
`tmsi.can_read_costs()` **não inclui `logistics`** — só admin/product_manager/finance/
branch_manager/viewer. `logistics` vê preços de venda (via `see_sell`) mas não custos, tal
como sales/agent. A app segue a função real, não a lista do prompt.

**Detalhe técnico apanhado a escrever o código:** `.returns<T>()` do `@supabase/postgrest-js`
está **deprecated** nesta versão pinada (2.115.0) — substituído por
`.overrideTypes<T, {merge: false}>()`. Verificado nos tipos reais do pacote antes de escrever,
não assumido de memória.

**Utilizadores de teste (dados fictícios):**

| Email | Role | Âmbito | Password |
|---|---|---|---|
| `sales.sa@example.test` | `sales` | filial `SA` | gerada, `~/tmp/tmsi-sudo/test-users-passwords.txt` no VPS (600), nunca no repo |
| `agent.apac@example.test` | `agent` | canal `APAC` | idem |

Domínio `.test` deliberado (reservado pela IANA para testes, nunca resolve) — impossível de
confundir com um endereço real. Sem dados reais da TMSI associados a nenhum dos dois.

**Provas (as 6 do prompt):**
1–3. Browser, confirmadas pelo Pedro: admin vê a listagem completa com custos/margens, filtro
de filial funciona; `sales.sa` vê só artigos activos da SA sem colunas de custo; `agent.apac`
vê só o canal APAC (filial TBM).
4. **Ramo negado, forma exacta apurada por teste directo (agente, antes do deploy):** com o JWT
   do `sales.sa`, `GET /rest/v1/v_branch_prices` devolve **linhas** com `total_cost_eur`/
   `margin` a `null` — não vazio, não 403. `can_read_costs()` via RPC → `false`, confirmando a
   causa. `GET /rest/v1/v_selling_prices` (a vista que a UI de facto usa para este role) não
   tem essas colunas de todo.
5. Com o mesmo JWT, `v_selling_prices?branch_id=eq.TBM` (filial fora do âmbito) → `[]`. Testado
   também o inverso com `agent.apac`: `v_selling_prices?branch_id=eq.SA` → `[]`.
6. `/auth/v1/`, `/rest/v1/`, `/login`, `/api/health` confirmados sem regressão após o deploy.

## E3, iteração 1 — Auth real (login/logout/reset) — ✅ FECHADA 2026-09-04

**Digest final:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:83d727741f3bfff756d51ef7a85ca39b38a282c37a286e5930bccd10393cb5c8`
(`Created` 2026-09-04T12:04:40Z — quatro digests intermédios ao longo da iteração, ver "Bugs
encontrados" abaixo; este é o único correcto, os anteriores nunca chegaram a ficar em produção
por mais do que o tempo de os apanhar e corrigir).

**Ficheiros entregues:** `src/middleware.ts` + `src/lib/supabase-middleware.ts` (refresh de
sessão + protecção de rotas); `login/`, `forgot-password/`, `reset-password/` (páginas +
Server Actions, `useActionState` do React 19); `auth/confirm/route.ts` (troca o `token_hash`/
`code` por sessão); `email-templates/recovery/route.ts` (template de email próprio); `page.tsx`
reescrita como home autenticada; `actions.ts` (logout). API real
(`signInWithPassword`/`resetPasswordForEmail`/`updateUser`/`verifyOtp`/`exchangeCodeForSession`)
verificada contra os tipos reais de `@supabase/auth-js@2.115.0`, não de memória.

**Correcção de infra que teve de acontecer antes do código fazer sentido:** o GoTrue tinha os
quatro `GOTRUE_MAILER_URLPATHS_*` por omissão (`/verify`, raiz do domínio) — o nosso vhost só
tem `/auth/v1/` para o GoTrue, nunca testado clicar num link antes desta sessão (a E0 só provou
a chegada do email). Confirmado por leitura do código-fonte do GoTrue e do `.env.example`
oficial do `supabase/supabase` (que define as quatro como `/auth/v1/verify`, exactamente por
este motivo) — a nossa stack magra tinha omitido essas vars e herdado o default errado. Fixadas
as quatro (`CONFIRMATION`, `INVITE`, `RECOVERY`, `EMAIL_CHANGE`), `auth` recriado.

**Pivot de arquitectura durante o teste real:** mesmo com o routing corrigido, o Pedro reportou
o link partido em teste real. Isolei com Python (par PKCE verifier/challenge real, GoTrue +
config testados directamente, sem passar pela app) — **o mecanismo GoTrue funciona
perfeitamente quando o `code_verifier` está disponível.** A causa real: o `flowType: "pkce"`
por omissão do `@supabase/ssr@0.12.5` (confirmado no código-fonte do pacote, não assumido) guarda
o verifier num cookie do browser que pediu o reset — e um link de email é rotineiramente aberto
noutro contexto (app de email do telemóvel, browser diferente), onde esse cookie não existe.
**Fix:** template de email próprio (`email-templates/recovery`), servido pela nossa app na rede
`tmsi_net` e obtido pelo GoTrue via `GOTRUE_MAILER_TEMPLATES_RECOVERY` — liga directamente a
`/auth/confirm?token_hash=...&type=recovery`, verificado com `verifyOtp`, que não precisa de
nenhum estado local do browser. Âmbito desta etapa: só `RECOVERY`; `CONFIRMATION`/`INVITE`/
`EMAIL_CHANGE` continuam com o template por omissão do GoTrue (aceitável — normalmente abertos
na mesma sessão que os pediu; `DISABLE_SIGNUP=true` significa que quase não são exercidos ainda
neste piloto).

**Três bugs reais apanhados a testar eu próprio, antes de pedir ao Pedro para repetir:**
1. `/email-templates/recovery` ficou, por lapso, atrás da própria protecção de rotas da
   middleware — o GoTrue recebia a página de `/login` (redirect de sessão) em vez do template.
   Corrigido: `/email-templates` acrescentado às rotas públicas.
2. `auth/confirm/route.ts` construía o redirect a partir de `request.url`, que atrás deste
   proxy reflecte o bind interno da app (`https://0.0.0.0:3000/...`), não o domínio público —
   sessão criada correctamente mas o browser era mandado para um URL interno inválido. Corrigido
   para derivar de `request.headers.get('host')`, como já se fazia em `forgot-password/actions.ts`.
   Nota: a `middleware.ts` usa o mesmo padrão `new URL(path, request.url)` e testou correcto —
   não mexida, sem evidência de bug aí (Edge Runtime parece resolver isto de forma diferente de
   um Route Handler comum).
3. `depends_on: rest: condition: service_healthy` no `tmsi-app` (F2) teria falhado a validação
   do compose — `rest` não tem healthcheck Docker (decisão da E0). Corrigido para
   `service_started`.

**Incidente de segredo, à parte do routing:** um `curl -D-` meu, a testar o fluxo manualmente,
ecoou um `Set-Cookie` com uma sessão completa (JWT access+refresh token do admin) no output.
Sinalizado de imediato; sessão revogada apagando as linhas correspondentes de
`auth.sessions`/`auth.refresh_tokens` directamente na DB (a Admin API do GoTrue nesta versão não
expõe um endpoint de revogação de sessão) — proporcional ao alcance real (transcript desta
sessão, nunca publicado), ao contrário de rodar o `JWT_SECRET` inteiro, que invalidaria também
o `ANON_KEY` embutido na imagem já em produção e obrigaria a novo build.

**CI:** um "re-run all jobs" acidental do Pedro no run antigo (`d7cbd6c`, código de auth ainda
sem existir) foi apanhado e cancelado (`gh`/API, `status: cancelled`) antes de poder empurrar
uma imagem desactualizada para `:latest`, em corrida com o run bom (`2678c87`).

**Footprint (fim da iteração):** RAM available 187 MB; swap 1001 MB (cruzou 1 GB pela primeira
vez nesta sessão — sem sinal de fuga, uso real dos containers continua na casa das dezenas de
MB; a vigiar, pendência já registada desde a E0); disco 46%.

**Provas comportamentais (as 6 do prompt), todas confirmadas pelo Pedro:** login com a
password nova → entra, header mostra o email; password antiga → falha (ramo negado); refresh →
sessão persiste; logout → `/login`, acesso directo à home → redirect; reset completo
(pedir → email → link → nova password → login antigo falha); `/auth/v1/`/`/rest/v1/`
inalterados, sem binds novos.

## E2 — Deploy do frontend + vhost — ✅ FECHADA 2026-09-04

**Ajuste de âmbito ao ROADMAP, registado:** a página de login da E1 é um *placeholder sem
lógica* — o critério de saída da E2 passou a ser «app servida + `/api/health` a responder por
HTTPS», não login real. Login real (e a prova de que o `ANON_KEY` embutido no bundle é o
correcto) fica explicitamente adiado para a primeira iteração da E3.

**Container `tmsi-app`:**
- Imagem: `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:d608eaaea804ced6fbf7bd9f06e0281a1646898a3513ee9f6662fff2286571a7`
  (`Created` 2026-09-04T09:42:40Z — confirma o attempt correcto: o Pedro esclareceu depois que
  "attempt #1"/"#2" eram na verdade dois *re-runs* do mesmo workflow run do GitHub, não runs
  distintos — por isso só há um run no histórico, com o segundo re-run a sobrescrever as mesmas
  tags com o digest bom).
- `172.20.40.1:3001` (a `:3000` desse gateway já é do `rest`), `mem_limit: 192m`, rede
  `tmsi_net`, `depends_on: auth (service_healthy), rest (service_started)` — **`rest` não tem
  healthcheck** (decisão da E0), por isso `service_healthy` nessa dependência falharia a
  validação do compose; corrigido para `service_started`.
- Uso real medido: ~49 MB / 192 MB.

**Dois problemas encontrados e corrigidos nesta sessão (nenhum estava previsto no prompt):**
1. **Healthcheck a apontar a `localhost` falhava** — `/etc/hosts` do container mapeia
   `localhost` a `127.0.0.1` **e** `::1`; o `wget` tentava `::1` primeiro e levava "connection
   refused" porque o servidor só liga o wildcard IPv4 (`HOSTNAME=0.0.0.0`, não escuta IPv6).
   Corrigido para `http://127.0.0.1:3000/api/health` explícito. Verificado dentro do container
   (`wget` a 127.0.0.1 funciona, a `[::1]` falha).
2. **O comando de backup do vhost que dei ao Pedro estava errado.** `sudo cp -a
   .../sites-enabled/tmsiequipment.conf .../sites-enabled/tmsiequipment.conf.<data>.bak` — como
   o ficheiro em `sites-enabled` é um **symlink**, `cp -a` preserva-o como symlink em vez de
   copiar o conteúdo: o "backup" era só mais um symlink para o **mesmo ficheiro vivo**, agora
   dentro de `sites-enabled`. E o `include` do `nginx.conf` é `sites-enabled/*` **sem** filtro
   `*.conf` (verificado, não assumido) — o nginx carregou o "backup" como um segundo vhost com o
   mesmo `server_name`, dando 4 avisos "conflicting server name ... ignored" no `nginx -t`
   (inofensivo neste caso porque o conteúdo era idêntico, mas era um defeito de higiene a
   corrigir). Corrigido: symlink removido de `sites-enabled`; backup real (conteúdo pré-E2,
   capturado antes da edição) colocado em `sites-available`, fora do `include`.

**Footprint (linha de base F0 → depois do `up` do `tmsi-app`):**
- RAM available: 231 MB → 179 MB (delta ≈ −52 MB, coerente com o uso real do container).
- Swap: 854 MB → 878 MB (+24 MB — não é crescimento contínuo, dentro do já esperado).
- Disco: 44% → 45%.

**Vhost:** `location /` acrescentada a `/etc/nginx/sites-available/tmsiequipment.conf`, antes de
`/auth/v1/` e `/rest/v1/` — `proxy_pass http://172.20.40.1:3001` (sem barra final: na raiz não há
prefixo a remover). `/auth/v1/` e `/rest/v1/` confirmados a continuar a responder depois do
reload (200/JSON válido nos dois).

**Verificado fim-a-fim:** `GET /api/health` → 200 `{"status":"ok","version":"0.1.0"}`; `GET /` →
200, página de login placeholder com o rodapé proprietário **confirmada pelo Pedro no browser**;
`/auth/v1/health` e `/rest/v1/` continuam a responder.

## E1 — Scaffold frontend + CI→GHCR — ✅ FECHADA 2026-09-04

Critério de saída (CI verde + imagem no GHCR) confirmado pelo Pedro. Todo o trabalho desta etapa
foi escrita de ficheiros + git — **nenhum comando `npm`/`npx`/`node` correu no VPS**, confirmado.

⚠️ **Dois attempts de CI, só um utilizável.** O attempt #1 correu automaticamente no push do
commit `d7cbd6c` (o workflow dispara em qualquer alteração a `app/**`, e esse commit tocou
`app/Dockerfile`) — **antes** de o segredo `NEXT_PUBLIC_SUPABASE_ANON_KEY` existir no repo. Build
verde na mesma (a ausência do segredo não falha o build, só embute uma string vazia), mas a
imagem desse attempt **tem a chave vazia e não deve ser usada**. Attempt #2, disparado depois de o
segredo ser criado, é o correcto — confirmado pelo Pedro. Como os dois attempts empurram para as
mesmas tags (`sha-<curta>` do mesmo commit + `latest`), o registo em GHCR **já só aponta para o
attempt #2** (push para a mesma tag substitui o manifesto anterior) — não há tag a apontar para o
attempt #1 para confundir um deploy futuro. Ainda assim, a **E2 deve confirmar explicitamente**
(ex.: inspeccionar a imagem puxada, não confiar cegamente na tag) antes do primeiro deploy real.

**Melhorias identificadas nesta etapa:**
1. ✅ **Implementada na E2** (`6359009`): guard no início do job do CI, falha alto se
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` vier vazio — o attempt #1 desta etapa não se pode repetir
   silenciosamente como "CI verde" com uma imagem inutilizável.
2. **Ainda por fazer (E5). Rotação futura do `JWT_SECRET` implica rebuild da imagem, não só redeploy.** O
   `ANON_KEY`/`SERVICE_ROLE_KEY` são JWT assinados com o `JWT_SECRET` actual; o `ANON_KEY` fica
   embutido no bundle do cliente **no build**. Rodar o `JWT_SECRET` no backend sem gerar um novo
   `ANON_KEY` e sem reconstruir a imagem deixa o frontend a enviar um `ANON_KEY` que já não valida
   contra o `JWT_SECRET` novo — REST/Auth passam a devolver 401 mesmo com o container "redeployado
   com sucesso". Registar este acoplamento explicitamente no procedimento de rotação (E5).

**Ficheiros entregues:**
- `docs/ROADMAP.md` — folha de rota (aplicada verbatim do prompt E1).
- `app/` — scaffold Next.js: `package.json`, `next.config.mjs` (`output: 'standalone'`),
  `tsconfig.json`, `postcss.config.mjs`, `tailwind.config.ts`, `.env.example` (só nomes),
  `src/app/{globals.css,layout.tsx,page.tsx}`, `src/app/api/health/route.ts`,
  `src/lib/{supabase-client.ts,supabase-server.ts}`, `Dockerfile`, `.dockerignore`.
- `.github/workflows/ci.yml` — build + push para GHCR em push a `main` (paths `app/**`) ou
  `workflow_dispatch`.

**Desvio do prompt, documentado:** o prompt pedia `src/lib/supabase.ts` (um único ficheiro,
browser + server). Ficou **dois ficheiros** (`supabase-client.ts` / `supabase-server.ts`) —
`supabase-server.ts` importa `next/headers`, que é server-only; se estivesse no mesmo módulo do
factory de browser, qualquer Client Component que importasse este último arrastaria
`next/headers` para o bundle do cliente, o que o Next.js rejeita no build. Confirmado contra a
documentação/tipos reais do pacote (`@supabase/ssr@0.12.5`), não assumido de memória.

**Versões pinadas (verificadas no registo, não de memória):**

| Pacote | Versão | Fonte |
|---|---|---|
| `next` | 16.3.4 | npm dist-tags.latest |
| `react` / `react-dom` | 19.2.8 | npm dist-tags.latest |
| `typescript` | 7.0.2 | npm dist-tags.latest |
| `tailwindcss` | 4.3.3 | npm dist-tags.latest |
| `@tailwindcss/postcss` | 4.3.3 | necessário para o plugin PostCSS do Tailwind v4 (não pedido explicitamente no prompt, mas exigido pela versão de `tailwindcss` escolhida) |
| `@types/node` | 24.13.3 | **não** é o dist-tag `latest` do pacote (que aponta para a série 26.x) — pinado à série 24.x porque é a linha LTS actual do Node ("Krypton"); a 26 ainda não é LTS |
| `@types/react` | 19.2.18 | npm dist-tags.latest |
| `@supabase/supabase-js` | 2.115.0 | npm dist-tags.latest |
| `@supabase/ssr` | 0.12.5 | npm dist-tags.latest |
| Imagem base Docker | `node:24.20.0-alpine` | Docker Hub, tag exacta mais recente da série 24 (LTS) |

**Pendência registada (ROADMAP E5):** sem lockfile — `npm install` no Dockerfile em vez de
`npm ci`, porque não há como gerar/commitar um `package-lock.json` sem correr `npm` no VPS
(proibido nesta etapa). Decisão de pinagem definitiva (gerar o lockfile numa sessão futura,
provavelmente ao lado do primeiro `npm install` real em CI) fica para a E5.

**Decisão de arquitectura documentada no `Dockerfile`:** `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_ANON_KEY` entram como `ARG` de build no CI, não como env de runtime no
deploy — o Next.js insere `NEXT_PUBLIC_*` no bundle do cliente **durante o build**, não à
arrancada do container, mesmo com `output: 'standalone'`. `NEXT_PUBLIC_SUPABASE_URL` vai como
literal no workflow (não é sensível — é o domínio público); `NEXT_PUBLIC_SUPABASE_ANON_KEY` vem
de um **novo segredo do repositório GitHub** que o Pedro ainda tem de criar (`Settings → Secrets
and variables → Actions → New repository secret`, nome `NEXT_PUBLIC_SUPABASE_ANON_KEY`, valor =
o `ANON_KEY` gerado na E0, `deploy/supabase/.env` no VPS) — sem ele o CI continua verde mas a
imagem fica com o valor vazio embutido no bundle do cliente.

**CI confirmado pelo Pedro:** attempt #2 verde, imagem `tmsi-app` no GHCR. Sem alteração de
estado do VPS nesta etapa (containers/nginx/postfix intocados) → **sem delta no dossier**.

## 1. Identidade

- **App:** TMSI Equipment Price Listing
- **Repo:** `github.com/pdr625/tmsiequipment` (privado, licença proprietária)
- **Domínio:** `https://tmsiequipment.duckdns.org`
- **VPS:** atelier24 (`185.200.244.100`, `vm7509`, Ubuntu 24.04)
- **Caminho de deploy:** `~/atelier-vps/tmsiequipment` (**não** `/opt/tmsiequipment`)

## 2. Decisões efectivas (prompt S1, 2026-09-03 — substituem o handover onde conflituam)

O `handover.md` **não se edita** — fica como histórico do projecto de origem. Esta tabela é o
presente; onde diverge do handover §2 / `deploy/DEPLOY.md`, prevalece esta.

| Tema | Decisão efectiva | Substitui |
|---|---|---|
| Caminho de deploy | `~/atelier-vps/tmsiequipment` | `/opt/tmsiequipment` (handover §4, DEPLOY.md §2) |
| Proxy | vhost nginx do host + `certbot --nginx`, padrão dos 8 vhosts existentes | Nginx Proxy Manager (handover §2, DEPLOY.md §1/§5) — NPM não existe neste VPS |
| Stack Supabase | magra: `db` (supabase/postgres) + `auth` (GoTrue) + `rest` (PostgREST). Sem Kong/Storage/Realtime/Studio/Functions/Analytics/Vector/Supavisor | compose oficial completo `supabase/supabase/docker` (~10+ serviços) (handover §2, DEPLOY.md §2) — RAM insuficiente |
| Rede | bridge própria `tmsi_net`, subnet a confirmar na B0 (candidata `172.20.40.0/24`) | rede `proxy` partilhada (deploy/docker-compose.yml da app, DEPLOY.md §1) |
| SMTP | **com SMTP**, relay postfix→Gmail do host via gateway da bridge (`172.20.40.1:25`) | decisão anterior "sem SMTP" (prompt §5, 2026-09-03, superseded) — revogada; reset de password tem de funcionar no piloto |
| DNS | `tmsiequipment.duckdns.org` já criado por Pedro na conta 1 (`atelier24rm@…`) | passo manual pendente (handover §4) |
| Postgres | versão a confirmar na B2 (preferência PG16 → PG15 → PG17; schema testado em PG16) | PG15 assumido no handover §2 |
| Âmbito | infra apenas — handover §5 passos 1–5 | passo 6 (scaffold Next.js) e passo 7 (migração 0002) ficam fora |

## 3. Checklist realizado / não realizado

Itens do handover §4:

| Item | Estado | Data |
|---|---|---|
| Repo clonado (caminho divergente: `~/atelier-vps/tmsiequipment`, não `/opt`) | ✅ | 2026-09-03 |
| `chmod 600 ~/.git-credentials` | ✅ | 2026-09-03 |
| Subdomínio DuckDNS `tmsiequipment` criado | ✅ criado e a resolver para `185.200.244.100` | 2026-09-03 |
| NPM na rede Docker `proxy`? | ❌ N/A — NPM não existe; substituído por vhost nginx do host | 2026-09-03 (R0) |
| Nenhum Supabase já instalado (colisão) | ✅ confirmado, zero vestígios | 2026-09-03 (R0) |
| Portas 5432/8000/3000 não publicadas ao público | ✅ `db` sem publish; `auth`/`rest` só em `172.20.40.1` | 2026-09-03 |
| Caixa SMTP disponível para e-mails de auth | ✅ relay postfix→Gmail do host, GoTrue configurado | 2026-09-03 |

Itens do handover §5 (sequência de trabalho):

| Passo | Estado |
|---|---|
| 1. Infra (DNS, Supabase, SMTP) | ✅ |
| 2. Schema (migration + seed) | ✅ (`select count(*) from tmsi.v_branch_prices` → 30) |
| 3. Primeiro utilizador | ✅ `pedroalexandre625@gmail.com`, role `admin` |
| 4. Proxy (vhost + certificado) | ✅ `nginx -t` OK, cert emitido, expira 2026-12-02 |
| 5. Backups | ✅ `tmsi-backup.timer` activo, NEXT 04/09 03:30 |
| 6. Frontend Next.js | fora do âmbito deste prompt |
| 7. Migração 0002 | fora do âmbito deste prompt |

## 4. Factos de runtime

- **Subnet:** `tmsi_net` (bridge), `172.20.40.0/24`, gateway `172.20.40.1` — livre como previsto na B0.
- **Containers:** `supabase-db` (`supabase/postgres:15.14.1.168`, sem porta publicada),
  `supabase-auth` (`supabase/gotrue:v2.189.0`, `172.20.40.1:9999`),
  `supabase-rest` (`postgrest/postgrest:v14.12`, `172.20.40.1:3000`).
  `mem_limit`: db 320m, auth 128m, rest 128m.
- **Versões escolhidas (B2) e porquê:**
  - Postgres: nenhuma tag PG16 existe em `supabase/postgres` no Docker Hub (confirmado via API,
    0 resultados) → caiu-se para PG15, última patch `15.14.1.168`.
  - GoTrue `v2.189.0` e PostgREST `v14.12`: não são "a última estável" isolada (existem
    `v2.196.0`/`v16.2`) — são exactamente o par que o `docker-compose.yml` oficial em `master` do
    repo `supabase/supabase` tem pinado agora, escolhido por ser a combinação testada em conjunto
    pelo próprio projecto, mais segura do que saltar para versões major mais recentes não
    validadas nesse par.
- **Init scripts da `db`:** `roles.sql`/`jwt.sql` oficiais montados em
  `/docker-entrypoint-initdb.d/init-scripts/99-{roles,jwt}.sql` (mecanismo real: o baked-in
  `migrate.sh` da imagem processa esse subdirectório — confirmado por leitura do script, não por
  suposição). `roles.sql` **editado**: removidas as linhas `ALTER USER supabase_functions_admin`
  e `supabase_storage_admin` — essas roles nunca existem numa stack magra sem Storage/Functions
  (`supabase_functions_admin` só é criada por um event trigger ligado a `CREATE EXTENSION pg_net`,
  que nenhum ficheiro do pipeline de init desta imagem executa). Sem esta edição a `db` entra em
  crash-loop e reinicia com PGDATA parcialmente inicializado (migrations nunca aplicadas) — visto
  e corrigido nesta sessão antes de aplicar o schema.
- **`rest` sem healthcheck Docker:** a imagem não tem shell (sem `wget`/`curl` para health HTTP
  custom) e `postgrest --ready` exige `PGRST_SERVER_HOST=localhost`, o que quebraria o acesso
  externo pela porta publicada. Verificado por prova funcional (`curl` ao endpoint) em vez de
  healthcheck de container.
- **Comando `db` efectivo:** replica o oficial (`-c config_file=/etc/postgresql/postgresql.conf
  -c log_min_messages=fatal`) + tuning próprio (`shared_buffers=64MB`, `max_connections=30`,
  `work_mem=4MB`).
- **Vhost:** `/etc/nginx/sites-available/tmsiequipment.conf` → `/auth/v1/` e `/rest/v1/`, sem
  `default_server`. Certificado Let's Encrypt (ECDSA, gerido por certbot) emitido para
  `tmsiequipment.duckdns.org`, válido 89 dias a partir de 2026-09-03 (expira 2026-12-02).
- **Backup:** `tmsi-backup.timer`, `OnCalendar=03:30`, `User=pedro`, activo (`NEXT` 04/09 03:30).
  Dumps em `~/backups/tmsi/tmsi-<data>.dump`, retenção 30 dias.
- **Postfix (B5.4):** `mynetworks` inclui `172.20.40.0/24`; regra ufw dedicada (`172.20.40.1
  25/tcp ALLOW IN 172.20.40.0/24`, ver abaixo) — faltava, política INPUT é DROP por omissão,
  causava timeout silencioso de 10s no GoTrue antes de ser identificada e corrigida (B7.5).
  **Correcção registada pelo Pedro:** alterar `inet_interfaces` exige `systemctl restart
  postfix@-.service`, não `reload` — o `reload` não reabre sockets de escuta. Adenda ao KI#26
  do dossier.
- **Postfix — listener TLS dedicado (B7.5, pós-prompt, não previsto no S1):** `master.cf` ganhou
  um stanza `172.20.40.1:smtp inet ... -o smtpd_tls_security_level=none`, e `172.20.40.1` foi
  removido do `inet_interfaces` genérico (evita duplo bind com o listener dedicado). **Porquê:**
  o cliente SMTP do GoTrue (`gomail.v2`) tenta sempre STARTTLS com verificação de certificado
  completa e não tem opção de configuração para relaxar isso; o certificado do postfix neste
  host é autoassinado (`CN=vm7509.lumadock.com`, sem SAN correspondente a IP nenhum) e falha
  sempre a verificação. As outras apps (itinera, vaultwarden) contornam isto do lado do cliente
  (`tls.rejectUnauthorized=false` / `SMTP_SECURITY`); o GoTrue não tem esse botão, por isso
  desligou-se STARTTLS só nesse listener dedicado — os outros 4 listeners (127.0.0.1,
  172.20.10.1, 172.20.20.1, 172.20.30.1) ficaram intocados, verificado com `openssl s_client
  -starttls smtp` nos dois ramos (172.20.40.1: STARTTLS ausente; 172.20.20.1: inalterado).
  Aprovado pelo Pedro antes de aplicar — recurso partilhado pelas 3 apps em produção.
  Backup do `master.cf` timestamped antes da alteração.
- **Footprint medido (final, pós-B7):** containers ≈ 22 MB de uso real (db 15.7M/320M, auth
  5.2M/128M, rest 0.9M/128M); RAM available do host 242 MB; swap estável ~800–820 MB ao longo da
  sessão, sem crescimento contínuo; disco 43%.

## 7. Verificação fim-a-fim (B7)

- `GET /auth/v1/health` → 200, corpo com versão do GoTrue.
- Login real (`grant_type=password`) → JWT devolvido, `role=authenticated`, `sub` = utilizador
  da B6; sessão real usada num `GET /rest/v1/v_branch_prices` → 30 linhas (utilizador tem role
  `admin`).
- `service_role` em `/rest/v1/v_branch_prices` → 30 linhas (`Content-Range: 0-29/30`).
- `anon` puro no mesmo endpoint → **401**, `permission denied for view v_branch_prices` — nega
  ao nível do GRANT, nem chega a aplicar RLS por linha.
- Recovery email (`POST /auth/v1/recover`) → 200; recepção **confirmada pelo Pedro**.
- Backup disparado manualmente (`systemctl start tmsi-backup.service`) → ficheiro
  `tmsi-2026-09-03.dump` (249 KB) em `~/backups/tmsi/`; `pg_restore --list` (via
  `docker exec -i supabase-db`, o host não tem `pg_restore`) → 619 TOC entries, schema `tmsi`
  presente.

## 8. Auditoria dos dois segredos ecoados (pergunta do Pedro, 2026-09-03)

Pergunta: quais variáveis exactamente ficaram visíveis nos dois incidentes de segredo ecoado da
sessão, e se `JWT_SECRET`/`ANON_KEY`/`SERVICE_ROLE_KEY` apareceram (nesse caso, rodar).

**Resposta, por reconstrução linha-a-linha de ambos os incidentes:**
- **Incidente 1** (`docker compose config`, filtro `grep -v` incompleto): a única variável cuja
  *valor* ficou visível foi `POSTGRES_PASSWORD`, através do seu alias interno `PGPASSWORD` no
  bloco `environment` do serviço `db` — esse nome não estava na lista do filtro (que cobria
  `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `PGRST_JWT_SECRET`,
  `GOTRUE_JWT_SECRET`, `GOTRUE_DB_DATABASE_URL`, `PGRST_DB_URI`, e esses **funcionaram** — nenhum
  deles apareceu no output impresso).
- **Incidente 2** (log de crash do GoTrue, erro de parsing de URI): a string exposta foi
  `postgres://supabase_auth_admin:<POSTGRES_PASSWORD>@db:5432/postgres` — a
  `GOTRUE_DB_DATABASE_URL` resolvida, que só contém `POSTGRES_PASSWORD`. `GOTRUE_JWT_SECRET` não
  faz parte desta connection string e não apareceu.
- **Conclusão:** `JWT_SECRET` (nem `GOTRUE_JWT_SECRET`/`PGRST_JWT_SECRET`), `ANON_KEY` e
  `SERVICE_ROLE_KEY` **nunca apareceram** em nenhum dos dois incidentes. Só `POSTGRES_PASSWORD`
  ficou exposta — e já tinha sido rodada duas vezes (uma por incidente) antes de qualquer serviço
  a usar em produção. **Não foi feita rotação de `JWT_SECRET`/`ANON_KEY`/`SERVICE_ROLE_KEY`** —
  não havia motivo, e por isso os JWT emitidos antes desta nota continuam válidos.

## 5. Recuperação

- **Segredos:** vivem em `deploy/supabase/.env`, `chmod 600`, **só no VPS, nunca no git**
  (bloqueado por `.gitignore`). Perder o VPS = regenerar todos os segredos e emitir novos JWT
  (`ANON_KEY`/`SERVICE_ROLE_KEY` ficam inválidos).
- **Init scripts (`deploy/supabase/init/roles.sql`):** já vêm editados no repo local (sem as
  linhas `supabase_functions_admin`/`supabase_storage_admin` — ver secção 4). Uma reinstalação
  a partir de zero neste caminho já herda a correcção; não é preciso repetir manualmente.
- **Backups:** `~/backups/tmsi/`, timer `tmsi-backup.timer` (`OnCalendar=03:30`).
- **Restauro:** `docker exec -i supabase-db pg_restore -U postgres -d postgres` a partir do dump
  mais recente em `~/backups/tmsi/` (o host não tem `pg_restore` instalado — usar o do container).
- **Postfix:** se `master.cf`/`main.cf` forem recriados do zero, o listener dedicado
  `172.20.40.1:smtp` (sem STARTTLS) e a regra ufw `172.20.40.1 25/tcp ALLOW IN 172.20.40.0/24`
  têm de ser reaplicados — ver secção 4 para o porquê e o conteúdo exacto.
- **Ponteiros:** dossier `~/atelier-vps/dossier/VPS.md`, relatório `~/tmp/tmsi-r0-report.md`.

## 6. Regra de manutenção

Toda a sessão que altere o estado do TMSI actualiza este ficheiro no mesmo passe
(commit + push), incluindo a Fase B deste prompt (secção 8 do prompt S1).
