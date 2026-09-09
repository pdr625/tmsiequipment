# MODEL-GAP-ANALYSIS.md — modelo da app vs Excel real (`TMSI_PriceList Final.xlsx`)

Sessão de medição, não de correcção — nenhuma migração, nenhuma linha de `app/src` mudou
aqui (ver `docs/STATE.md`). Os 12 pontos abaixo foram medidos contra o **código e o schema
reais** (migrações 0001-0008, `app/src`), citando sempre a linha exacta — nunca contra
`docs/STATE.md` nem contra memória de sessões anteriores.

**Nota de âmbito:** esta sessão não teve acesso ao próprio ficheiro Excel (não existe
cópia neste VPS) — as regras do Excel usadas abaixo são as que o prompt desta sessão já
trazia, de uma análise feita antes, na camada de desenho. Tudo o que é sobre o **schema/
código da app** foi verificado directamente aqui; tudo o que é sobre **o Excel em si**
(números, folhas, células) é reportado como dado de entrada, não reverificado.

## F0 — inventário, item a item

| # | Item | Estado | Prova |
|---|------|--------|-------|
| 1 | Margem por artigo×filial a sobrepor-se à grelha | **suportado** | `price_overrides.kind='margin'` (0001:21,210-222) lido em `compute_price()` (0001:474-475 / 0007:249-250); `price_overrides.value` sem `check` de intervalo — 0,40/0,55/0,63 passam sem problema |
| 2 | Transporte por artigo×filial a sobrepor-se ao escalão | **suportado** | `kind='transport'` lido em 0001:445-446 / 0007:214-215 |
| 3 | Fee interco por artigo×filial a sobrepor-se aos 20% | **suportado** | `kind='fee'` lido em 0001:434-435 / 0007:200-201 |
| 4 | Preço de referência, calculado pelo motor | **suportado no cálculo, sem interface** | `tmsi.branches.ref_factor` (0001:41, default 1.100) × `min_price` → `v_ref` (0001:489 / 0007:263). **Sem UI**: `grep -rn ref_factor app/src` só aparece em comentário; `app/src/app/config/page.tsx` nunca lê `branches`. Só editável por escrita directa à tabela (RLS `ref_write`, admin-only, 0001:598) — **fora do workflow de aprovação da 0007** (`branches` não é um dos 6 `target_table` de `price_proposals`, 0007:299-301) |
| 5 | Canal/agente no motor — `compute_price()` aceita-o? | **inexistente** | Assinatura é `(p_product, p_branch, p_date)` (0001:384 / 0007:152) — sem parâmetro de canal. `channel_id`/`my_channels()` só aparecem dentro de predicados de **visibilidade** (quem vê a linha): 0001:414,553; 0003:100; 0007:181 — nunca dentro do cálculo. `tmsi.channels.margin_delta` (0001:50, valor `-0.10` inserido em 0001:627) **tem zero leituras** em todo o schema/app (confirmado por grep) |
| 6 | Regra alternativa por canal (APAC sem fee/direitos) | **inexistente** | Consequência directa do #5 — sem parâmetro de canal, o motor corre sempre a cadeia completa (fee+transporte+direitos+margem de grelha) para qualquer venda, canal ou não. **Já documentado no próprio código**: `app/src/app/overrides/page.tsx:158-160` — *"Only branch scope has any effect on calculations today — channel/agent scope exists in the schema but the pricing engine does not read it yet"*; `app/src/app/overrides/actions.ts:63-65` idem |
| 7 | Base do direito aduaneiro (interco, sem transporte) | **suportado, mas não configurável por zona** | `v_duty := v_interco * v_duty_rate` (0001:468 / 0007:244) — confirma exactamente a regra do Excel (base = interco, transporte fica de fora). A **taxa** é por zona (`customs_rates(hs_code,zone,rate)`, 0001:93-98); a **fórmula/base** é uma única linha de código para todas as zonas — não há nenhum ramo condicional por zona no cálculo da base |
| 8 | Direitos por HS × zona | **suportado, com uma pergunta em aberto** | `tmsi.customs_zone` (0001:20) = `('EU','CN','US','UK')` — **4 zonas**. O prompt desta sessão refere `EU/CH/US/UK` para o Excel — `CH` não existe no enum. Não resolvido aqui (seria inferir); ver achado A5 abaixo |
| 9 | Campos de catálogo | **suportado, com uma divergência de fronteira** | `category_id` (0001:131), `item_type` (132), `unit` (147), `lead_time_days` (148), `dimensions` (143) — todos existem. `supplier_id` está correctamente atrás de `can_read_costs()` (0003:29,153). **`origin_country` NÃO está** — ficou na camada "operational" (0003:29,140: `case when tmsi.can_read_operational() then origin_country end`), visível também a `logistics`, que não é `can_read_costs()`. Contradiz a decisão do Pedro citada no prompt desta sessão ("Supplier e Origin Country ficam atrás da fronteira de custos") |
| 10 | Códigos SAP por filial (4 campos) | **suportado** | `sap_code_sa/cn/us/uk` (0001:149-152), cada um `unique`. As regras de derivação (TBM=SA+prefixo S, LTD=SA tal e qual, CORP=`NC`+código próprio) são de negócio — o schema guarda os 4 valores, não deriva nenhum automaticamente (nem foi pedido que o fizesse) |
| 11 | Linhas não-equipamento (opções, CONDATLINK, aluguer, não devolvido): margem zero, preço=EXW | **inexistente** | Nenhuma das quatro parcelas do motor implementa "margem zero, preço=EXW" como regra própria de `item_type`: transporte e direitos **são** zerados para `option`/`service` (0001:447,458 / 0007:216,232), mas a **taxa intercompany não** — só zera se `primary_branch = filial` (venda em casa), sem nenhuma condição de `item_type` (0001:436 / 0007:202) — logo uma opção vendida fora da filial de origem continua a pagar 20% de fee. A **margem de uma opção não é zero — é herdada da margem do produto-pai** (0001:476-478 / 0007:251-253); um `service` cai na grelha normal da filial, tal como um `equipment` (0001:480 / 0007:255, o ramo `else`). **"Artigo não devolvido"**: não existe campo nenhum no schema para este conceito — não há `returnable`/`non_returned` em `tmsi.products` |
| 12 | Moeda do transporte na moeda da filial | **suportado** | `transport_tiers.currency` (0001:84); seed confirma SA→EUR, TBM→CNY, CORP→USD, LTD→GBP (0001:638-642) — já confirmado pelo Pedro |

## Achados adicionais, fora da grelha dos 12 (mas encontrados a verificar F0)

- **A5 — zona "CH" sem correspondência**: se o Excel tem mesmo uma zona/coluna `CH`
  (Suíça?) distinta de `EU`, isso não tem hoje nenhum lugar no schema — nem no enum
  `customs_zone`, nem em `tmsi.branches.zone` (as 4 filiais mapeiam para `EU/CN/US/UK`,
  1:1). **Por confirmar com o Pedro** antes de decidir se é um enum a alargar ou um erro de
  leitura do Excel.

## F1 — relatório de lacunas, por ordem de bloqueio

**Bloqueiam a paridade directamente** (qualquer linha do CSV nesse caso vai divergir do
motor por uma razão que não é bug de preço, é ausência de regra):

1. **#5/#6 — sem regra de canal.** Qualquer linha do CSV com `branch_id=APAC` (ou qualquer
   canal futuro) vai ser computada pelo motor com a cadeia completa (fee+direitos+margem de
   filial), nunca com a regra do Excel (`(EXW + transporte) / (1−margem)`, sem fee nem
   direitos). **Maior lacuna desta análise** — bloqueia também o próprio negócio: o Pedro já
   avisou que vêm mais territórios de agente, e hoje o motor não tem ONDE pendurar essa
   distinção (nem um parâmetro de canal em `compute_price()`, nem uma leitura de
   `margin_delta`).
2. **#11 — sem regra própria para linhas não-equipamento.** Opções, CONDATLINK, aluguer e
   "artigo não devolvido" vão todos ser calculados com fee proporcional + margem herdada/de
   grelha, nunca "margem zero, preço=EXW". Toda a amostra do Excel fora de `equipment`/
   `spare_part` (que parece ser uma fracção substancial dos 52 artigos, a confirmar) vai
   mostrar divergência sistemática, não aleatória.

**Podem bloquear linhas específicas da paridade** (dependendo do que o Excel tiver, ainda
por confirmar):

3. **A5 — zona `CH`.** Se existirem artigos/filiais associados a essa zona no Excel, essas
   linhas não têm hoje correspondência no motor.
4. **#7 — base do direito fixa, não por zona.** Hoje coincide com o Excel para todas as
   zonas testadas; só bloqueia se/quando uma zona precisar de uma base diferente — decisão
   do Pedro, pendente de confirmação com quem trata de alfândega.

**Não bloqueiam a paridade nem a importação — divergência de acesso/gestão:**

5. **#9 — `origin_country` não está atrás da fronteira de custos.** Não afecta nenhum
   cálculo de preço (é um campo informativo); afecta quem pode LER o campo. Diverge da
   decisão do Pedro registada nesta sessão — vale corrigir por higiene de acesso, não por
   urgência de paridade.
6. **#4 — `ref_factor`/`list_coef` sem interface.** O valor já está correcto (1,100/1,000,
   por omissão, iguais em todas as filiais, batendo certo com "REFERENCE PRICE = MINIMUM ×
   1,10" do Excel) — só falta forma de o editar pela app quando algum dia precisar de
   deixar de ser uniforme.

## Fila de sessões proposta (ordem sugerida, decisão do Pedro)

1. **Confirmar com o Pedro**: zona `CH` (A5) e a base do direito por zona (#7) — perguntas,
   não código, antes de desenhar a migração de canais (evita desenhar duas vezes).
2. **Migração — canais com regra de cálculo própria** (#5/#6): dar a `compute_price()`
   forma de saber que está a calcular para um canal (não só uma filial) e aplicar uma cadeia
   diferente (sem fee, sem direitos, `margin_delta` a entrar na margem) — a maior mudança
   desta lista, mas a que a paridade e o negócio mais precisam.
3. **Migração — regra própria para linhas não-equipamento** (#11): `option`/`service` (e o
   que for "artigo não devolvido") a resultarem em margem zero e preço=EXW, sem fee.
4. **Migração pequena — fronteira de custos do `origin_country`** (#9): mover para
   `can_read_costs()`, mesmo padrão do `supplier_id` já existente (0003) — baixo risco,
   rápida.
5. **UI — editar `ref_factor`/`list_coef`** (#4): só quando/de necessário deixarem de ser
   uniformes; nenhuma urgência hoje.
6. **Preenchimento do CSV corrigido** (este documento, F2 abaixo) e a sessão de paridade —
   depois de pelo menos as sessões 2 e 3, para a paridade não acusar as mesmas duas lacunas
   estruturais em cada artigo não-equipamento/canal testado.
