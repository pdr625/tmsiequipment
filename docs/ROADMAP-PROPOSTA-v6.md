# ROADMAP-PROPOSTA-v6.md — proposta, para validação

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Data:** 2026-09-19, **emendada no mesmo dia** depois da sessão «verificar, registar, provar» —
quatro afirmações da auditoria não sobreviveram à verificação (off-site, rate limit, `sap_code_cn`,
`sap_code_us`) e dois passos passaram de futuros a feitos (registo da carga, gate reposto).
**Estado:** proposta. **Não substitui `docs/ROADMAP.md`** — o Pedro valida primeiro. Parte do estado real apurado em `docs/STATUS-REPORT-2026-09.md`, não do plano antigo.
Sem estimativas de datas, por desenho.

**Mudança de eixo face ao ROADMAP actual:** o eixo deixa de ser «que etapa falta construir» e passa
a ser «o que falta para os dados reais que já estão carregados poderem ser usados». A construção
está essencialmente feita; o que falta é activação, prova e registo.

---

## 1. Feito e provado

Entregue **e** com prova re-executável (smoke, protocolo executado, ou medição ao vivo registada).

| Bloco | Prova |
|---|---|
| Infra backend, Supabase self-hosted reduzido (3 serviços) | E0; medido ao vivo |
| CI → GHCR, deploy por digest, fail-fast de runtime | `.github/workflows/ci.yml`, `app/Dockerfile:57`; revisão `cf98518` em execução |
| Autenticação: login, logout, troca obrigatória de password | 0006 + `middleware.ts:52-54`; smoke |
| Fronteira de custo ao nível da BD (linha **e** coluna) | 0003/0004; smoke blocos G·H·I, incl. oráculo booleano |
| Âmbito por filial e por canal | 0009; smoke J·T·W |
| Motor de preços: FX, fee interco, transporte, direitos, margem, overrides | 0001→0012; smoke A·B (API ≡ BD), X |
| Arredondamento por moeda | 0010; smoke U; ramo discriminante verificado ao vivo |
| Workflow propor→aprovar (config, filial, canal) | 0007/0009; smoke R·S·T |
| Decisão em lote, atómica | 0015; smoke AA (15 asserções, inclui ramo de falha) |
| Importação em massa com pré-visualização e desfazer | 0013; smoke Z |
| Guardas de integridade (activação, motivo de override, EXW→review) | smoke O·Q·P |
| Auditoria global + fronteira de conteúdo | 0001 + 0014; `/audit`, `v_audit_log` |
| Backups, restauro provado, escrow, kit de desastre | `docs/DISASTER-DRILL.md`; restauro re-provado |
| Off-site do backup | Verificado a 19/09 pelo padrão de `atime`: o pull nocturno corre e já levou dumps com a carga real (A1) |
| Security headers | `deploy/nginx/tmsiequipment.conf:14-17`; confirmados ao vivo |
| Rate limit no `/auth/v1/token` | `limit_req` no vhost versionado; provado ao vivo a 19/09 (`503` do 7.º ao 9.º pedido) |
| Fronteira de conteúdo do `audit_log` (0014) | Smoke bloco BB desde 19/09 — incluindo o ângulo do no-op que a 1.ª versão teve |
| `sales`, `agent`, `viewer` | Smoke bloco CC desde 19/09 |
| Matriz dos 8 papéis sobre 0001–0015 | Execução n.º 3 do protocolo, 19/09 |
| **Fronteira de execução das funções (0016)** | Item 59 fechado; as três internas recusam a todos; impressão digital intacta |
| **Guardas do `compute_price` fecham (0017)** | Item 64 fechado; prova §4.15 — a guarda aguenta **sozinha**, sem a 0016 por baixo |
| **`anon` como 9.ª identidade** | Smoke bloco DD + coluna na matriz; execução n.º 4, migrações 0001–0017 |
| **Nenhuma função de `tmsi` com `EXECUTE` a `PUBLIC`** | Item 65; guarda na migração **e** asserção de smoke |

---

## 2. Feito, por re-provar

Existe e funcionou uma vez; **não tem prova que sobreviva a uma regressão**.

| Item | Porque está aqui | Critério de «feito» |
|---|---|---|
| **Paridade do catálogo completo** | Está **escrita** (`ENGINE-PARITY.md` §9) mas **não é re-executável**: o comparador foi um script de sessão e o ficheiro-fonte vive fora do git. Uma regressão do motor não seria apanhada por nada | Um comparador versionado (em `scripts/`) que leia um ficheiro de paridade e produza a mesma classificação — e que corra na próxima carga sem se reinventar |
| Gestão de passwords (0006) | Zero asserções; passos W/X do protocolo NÃO EXECUTADOS | Asserção ou execução registada dos passos W/X |
| Branding / white-label (0008) | Zero asserções; passo KK NÃO EXECUTADO | Ficheiro `.xlsx` real com o branding aplicado, verificado |
| Correcção de FX no mesmo dia (0005) | Teste directo foi **substituído** pelo bloco R, não reforçado | Asserção própria, ou nota explícita de que o bloco R a cobre |
| Exportações `.xlsx` | Nunca geradas por via automatizada (a rota exige cookies) | Um ficheiro real gerado por sessão autenticada e o seu conteúdo verificado |
| Dashboard | Metade browser NÃO EXECUTADA (passo V) | Passo V executado e registado |
| Convites, ban/unban | Sem asserções | Asserção ou passo de protocolo executado |
| ~~Papéis `sales`, `agent`, `viewer`, `admin`~~ | **Resolvido 19/09** — blocos CC e BB, sem criar conta nenhuma (claims injection e concessões em transacção revertida) | ✅ |
| Fronteira de custo no **export**, papel sem custos | **Agora é exercível** — há 46 artigos `active`. Continua por fazer, e é o primeiro da lista de browser | Um `.xlsx` real como `sales.test` e como `logistics.test`, sem coluna nem valor de custo |

---

## 3. Caminho até os dados reais serem utilizáveis — ✅ **FECHADA POR INTEIRO, 2026-09-23**

**Os dados reais são utilizáveis.** 46 artigos `active`, visíveis aos papéis comerciais, com a
fronteira de custo provada no export por um ficheiro real gerado pelo Pedro como `sales.sa`. Os 3
que ficam em `draft` (`T-1002`, `T-1020`, `T-1025`) faltam-lhes dados de origem — código SAP,
`hs_code`, peso — e nenhum foi inventado para os fazer passar.

O que resta desta secção são **decisões e dados do Pedro**, não construção: os três `draft`, o
`sap_code_us` duplicado (item 53), a regra do `Alert` (item 67) e a base do direito aduaneiro por
zona (item 32, externo — **até lá os preços são operacionais, não definitivos**).

*Tabela original, com o estado de cada passo:*

Os dados **já estão carregados** (49 artigos). O que falta é torná-los visíveis e fidedignos.
Ordem proposta — cada passo desbloqueia o seguinte.

| # | O quê | Depende de | Critério de «feito» | Porquê nesta ordem |
|---|---|---|---|---|
| 1 | ~~**Registar a carga**~~ | — | ✅ **feito 2026-09-19** — `STATE.md` item 51, `BACKLOG` 51–57, `ENGINE-PARITY` §9, `DEPLOY.md` corrigido, quatro commits | Enquanto não existia registo, qualquer decisão seguinte assentava em memória |
| 2 | ~~**Repor o gate de produção**~~ | 1 | ✅ **feito 2026-09-19** — execução n.º 3 (0001–0015), smoke 78→**91** verde nos três modos, matriz dos 8 papéis medida, sem fuga | A activação é o momento em que `sales`/`agent` vêem dados reais pela primeira vez. A prova tem de vir **antes**, não depois |
| 3 | ~~**`unit` dos 49**~~ | — | ✅ **feito 2026-09-20** — 0018 + ficheiro v6; 49/49 com `unit` (PCS 47 · SET 1 · MONTH 1). **Fonte: a coluna `Unit` do `PRICE_LIST`**, lida pelo importador, nunca derivada |
| 4 | ~~**`sap_code_cn`**~~ | — | ✅ **feito 2026-09-19** — 37 por derivação, transacção única, desfazer provado, impressão digital intacta. Excepções `T-1002` e `T-1020` | Medido a 19/09: a regra já escrita (`MODEL-GAP-ANALYSIS.md:27`) resolve **37 dos 39** por derivação (`S` + `sap_code_sa`), com 37 valores distintos e zero colisões. Só `T-1002` e `T-1020` são excepção, por não terem `sap_code_sa` de origem. Deixou de ser «obter 39 códigos» e passou a ser «derivar 37 e decidir 2» |
| 5 | **Completar o `hs_code` do `T-1020`** (e o SAP de origem dele e do `T-1002`; o peso do `T-1025`) | Pedro | `compute_price` sem `errors[]` em todo o catálogo | Hoje 3 dos 5 âmbitos deste artigo devolvem `missing customs rate for HS/zone` |
| 6 | **Decidir o `sap_code_us` duplicado** (`NC01728-998`) | Pedro | Ou o ficheiro corrigido, ou a constraint revista com fundamento escrito | Deixou de ser «correcção barata». Os três artigos (`T-1021`, `T-1023`, `T-1042`) são todos `equipment`, nenhum é acessório de outro, e o terceiro difere em categoria **e** em filial de origem — não é o padrão de um código de kit. São duas leituras opostas: **dado errado**, ou **constraint errada** porque a CORP usa mesmo um código para três artigos. Não chegou à base (o importador não escreve `sap_code_us`), logo não há pressa — mas a 2.ª importação vai exercê-la |
| 7 | ~~**Activar**~~ | — | ✅ **feito 2026-09-20** — **46 `active`**, 3 `draft` (`T-1002`, `T-1020`, `T-1025`). `sales` vê 46, `agent` 46, ambos sem custo. Obrigou a 0019 (a origem também vende) |
| 8 | ~~**Exercer a fronteira de custo no export**~~ | — | ✅ **feito 2026-09-23** — ficheiro real gerado pelo Pedro como `sales.sa`: 46 linhas, só SA, sem colunas de custo. Obrigou à correcção do item 68 pelo caminho |
| 9 | **Carregar as 3 refs diferidas** (47/48/49) | Pedro (artigo-pai + filial primária) | 52 artigos carregados | Fica por último por serem 3 e por precisarem de decisão, não de trabalho. Quem lá mexer trata **duas** barreiras: o importador recusa `exw_price < 0` para todos os tipos, e não escreve `parent_id` |
| 10 | **Resposta do despachante** sobre a base do direito por zona (item 32) | Externa | Item 32 fechado | **Até lá os preços são operacionais, não definitivos** — não anunciar à equipa como finais |

---

## 4. Caminho até ao deployment final (E6)

| # | O quê | Depende de | Critério de «feito» |
|---|---|---|---|
| 1 | ~~Execução n.º 3 do protocolo (0014/0015)~~ | — | ✅ **feito 2026-09-19** — deixou de depender da activação: fez-se sobre os artigos fictícios, que é o que o gate sempre pediu (provas fictícias validam o mecanismo) |
| 2 | ~~Execução n.º 5, com dados reais activos~~ | — | ✅ **feita 2026-09-20**, 0001–0019, 9 identidades. Falta só o que exige browser |
| 2b | **Item 67 — regra do `Alert` nos serviços** | Pedro | Matriz dos 8 papéis refeita com ≥1 artigo real `active`; em particular as linhas de `sales` e `agent`, hoje a zero por falta de artigos activos, e a fronteira de custo no export (§3 passo 8) |
| 3 | ~~⚠️9, ⚠️10, ⚠️11~~ | — | ✅ **feitos 2026-09-20**, revisão `482bb4f`: `/audit` lê a vista, `/products/export` pergunta `can_read_costs()`, export ordenado e rótulo `Scope` honesto |
| 4 | **Instalar o vhost** (`nosniff` + zona do rate limit) | Pedro (sudo) | Cabeçalho vivo; `nginx -t` passa só com o que está no repo |
| 6 | Fechar as lacunas da §2 que o Pedro considerar bloqueantes | — | Cada item da §2 com prova ou decisão registada |
| 7 | Decidir o `Alert` dos serviços de margem plana | Pedro | Regra isenta `service`/`option`, ou a coluna sai do ficheiro que circula |
| 8 | Desactivar as contas `.test` | Pedro | Contas desactivadas, `TEST-ACCOUNTS.md` actualizado |
| 9 | Retenção de 5 anos do `audit_log` (item 49) | — | Mecanismo implementado, não só decidido |
| 10 | **E5-HOMELAB: confirmar o destino e medir a cópia** | — | O off-site **já corre** (verificado a 19/09 pelo padrão de `atime`; ver §7). Falta: confirmar no homelab que o ficheiro está íntegro (`pg_restore -l`), e uma métrica de idade da cópia off-site — hoje o `status.json` só publica a idade do dump **no VPS**, logo se o pull parar ninguém dá por isso (item 55) |
| 11 | Versionar a `limit_req_zone` do rate limit (item 54) | — | Um restauro só a partir do repo põe o nginx de pé; hoje não põe |
| 12 | Renome de repo/imagem/domínio | Pedro | Decisão de 09-06 executada |
| 13 | CPI L113-9 / formalidades da migração para a empresa | Pedro | Conforme `ROADMAP.md` E6 |

---

## 5. Depois

| Item | Origem | Nota |
|---|---|---|
| Alerta de revisão a 90 dias | Plano inicial, Fase 3 | Nunca iniciado; não existe sequer item de BACKLOG com esse nome |
| Notificações por email de negócio | Plano inicial, Fase 3 | Só existe email transaccional do GoTrue |
| Filtros por família, moeda de visualização e estado | Plano inicial | Com 49 artigos e 17 categorias passa a doer; hoje só há filtro por filial |
| API interna para integrações | Plano inicial, Fase 3 | As 3 rotas `/api/*` são de infraestrutura, não expõem catálogo nem preços |
| Exportação PDF por servidor | Plano inicial | Hoje só `window.print()` + CSS |
| Máquina de estados do artigo no frontend | Achado desta auditoria | A UI passa `status` livre e deixa os triggers recusarem |
| Ledger de migrações para `tmsi` | Achado desta auditoria | Hoje o estado infere-se por sondagem |
| Validação no importador: exactamente uma filial com fee 0, e ser a de origem | Regra de negócio escrita a 09-16 | Derivável dos dados, sem literais |
| Segundo modo de importação (proposta agrupada) | `docs/IMPORT.md` | Contrato escrito, não implementado |
| `product_hs_overrides` no workflow de aprovação | Item 10, parcial | `(b)` resolvido para `price_overrides`, por resolver aqui |

---

## 6. Suspenso / fora de âmbito

| Item | Decisão | Data |
|---|---|---|
| Piloto com utilizadores reais | Adiado; só contas `.test` até ao deployment final | 2026-09-05 |
| Terceira perna do backup | Suspensa — e as **duas** primeiras existem mesmo: o off-site corre e já levou dumps com a carga real (verificado 19/09, §7) | 2026-09-06 |
| Dark mode | Removido, não só desligado; app light-only | 2026-09-05 |
| `channels.margin_delta` | Largada na 0009 por não corresponder ao modelo real | 2026-09-09 |
| `interco_fees` | Viva no schema como histórico; o motor deixou de a ler na 0012 | 2026-09-10 |
| `branch_manager` aprovar config global | Em aberto, sem prazo (item 50) | 2026-09-16 |

---

## 7. Alterações face ao `docs/ROADMAP.md` actual

**Acrescentado**

- **Uma etapa que não existia: «tornar utilizáveis os dados já carregados» (§3).** O ROADMAP actual
  trata o carregamento do catálogo como um evento futuro (`ROADMAP.md:287`, "falta o carregamento do
  catálogo real"); ele já ocorreu. O trabalho real agora é activação, não carga.
- **§2 «Feito, por re-provar»**, categoria que o ROADMAP não tem. Hoje um item ou está fechado ou
  está por iniciar; não há lugar para «existe, funcionou uma vez, não tem rede».
- As migrações **0008–0015** entram explicitamente na folha de rota. O ROADMAP actual só as cobre
  até à 0007 — deixou de ser o índice do schema a partir da 0008.
- Os itens do plano inicial que **nunca foram iniciados** (alerta 90 dias, notificações, filtros,
  API, PDF) passam a estar escritos em §5. Hoje não estão em lado nenhum: nem no ROADMAP, nem no
  BACKLOG com esse nome.

**Movido**

- **Gate de produção:** o ROADMAP declarava-o satisfeito (`ROADMAP.md:275-287`) para um estado que
  já não era o actual. Foi reaberto **e fechado na sessão de 19/09** — execução n.º 3, migrações
  0001–0015, matriz dos 8 papéis, smoke 78→91. O que dele fica para depois não é o gate: é a sua
  repetição com **dados reais activos** (§4 passo 2), que é outra coisa e só é possível depois da
  activação.
- **E6** deixa de depender só do gate técnico e passa a depender também da §3 (dados activos) — não
  se valida um piloto sobre um catálogo que os papéis comerciais não vêem.
- **Off-site:** sai de «por iniciar» e entra em §1 como feito e verificado, com o que falta
  (confirmação no destino e métrica de idade) em §4 passo 10. O `ROADMAP.md` dizia «o dump só
  existe no VPS»; é falso desde antes desta auditoria — o repo é que nunca foi actualizado.

**Fundido**

- O que o ROADMAP trata como E3/E4/E5 separados aparece em §1 como um único bloco «feito e provado»,
  porque a distinção entre etapas deixou de ter valor operacional: o que interessa agora é o que tem
  prova e o que não tem.

**Proposto retirar**

- Nada se retira. Proponho **marcar** como histórico (não apagar): `docs/MODEL-GAP-ANALYSIS.md`
  (5 das 6 lacunas fechadas pelas 0009/0010), `handover.md` (já declarado histórico) e a checklist
  de estado do `README.md` (descreve um projecto que não é este — ver `STATUS-REPORT` ⚠️5).

**Não proponho** alterar a numeração de etapas nem dos itens do BACKLOG: a correspondência 21/22/23
já foi renumerada uma vez e está documentada; mexer outra vez custa mais do que resolve.
