# ROADMAP-PROPOSTA-v6.md — proposta, para validação

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Data:** 2026-09-19. **Estado:** proposta. **Não substitui `docs/ROADMAP.md`** — o Pedro valida
primeiro. Parte do estado real apurado em `docs/STATUS-REPORT-2026-09.md`, não do plano antigo.
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
| Security headers | `deploy/nginx/tmsiequipment.conf:14-17`; confirmados ao vivo |
| Paridade do motor contra o Excel | `docs/ENGINE-PARITY.md` (amostra) + 245 linhas do catálogo real |

---

## 2. Feito, por re-provar

Existe e funcionou uma vez; **não tem prova que sobreviva a uma regressão**.

| Item | Porque está aqui | Critério de «feito» |
|---|---|---|
| Fronteira de privacidade do `audit_log` (0014) | **Zero asserções de smoke**; a 1.ª versão da migração foi um no-op silencioso e só se soube por teste manual | Bloco de smoke que prove `old_row`/`new_row` de `profiles` mascarados para não-admin e visíveis para admin |
| Gestão de passwords (0006) | Zero asserções; passos W/X do protocolo NÃO EXECUTADOS | Asserção ou execução registada dos passos W/X |
| Branding / white-label (0008) | Zero asserções; passo KK NÃO EXECUTADO | Ficheiro `.xlsx` real com o branding aplicado, verificado |
| Correcção de FX no mesmo dia (0005) | Teste directo foi **substituído** pelo bloco R, não reforçado | Asserção própria, ou nota explícita de que o bloco R a cobre |
| Exportações `.xlsx` | Nunca geradas por via automatizada (a rota exige cookies) | Um ficheiro real gerado por sessão autenticada e o seu conteúdo verificado |
| Dashboard | Metade browser NÃO EXECUTADA (passo V) | Passo V executado e registado |
| Convites, ban/unban | Sem asserções | Asserção ou passo de protocolo executado |
| Papéis `sales`, `agent`, `viewer`, `admin` | Sem sessão própria no smoke (4 dos 8 papéis) | Contas de teste para os que faltam, ou decisão registada de que ficam manuais |

---

## 3. Caminho até os dados reais serem utilizáveis

Os dados **já estão carregados** (49 artigos). O que falta é torná-los visíveis e fidedignos.
Ordem proposta — cada passo desbloqueia o seguinte.

| # | O quê | Depende de | Critério de «feito» | Porquê nesta ordem |
|---|---|---|---|---|
| 1 | **Registar a carga** em `STATE.md`, `BACKLOG.md`, `ENGINE-PARITY.md` e `deploy/DEPLOY.md`, e comitar | — | `git log` mostra a carga; `DEPLOY.md` deixa de dizer «not yet loaded» | Enquanto não existir registo, qualquer decisão seguinte assenta em memória. É o único passo que não depende de ninguém |
| 2 | **Decidir a `unit`** dos 49 artigos | Pedro | Os 49 têm `unit` não-nula | Bloqueia a activação de **todos** — nenhum outro trabalho a contorna |
| 3 | **Obter os `sap_code_cn`** dos 39 artigos de origem TBM | Pedro / gestor de filial | Os 39 têm `sap_code_cn` único | Segunda metade do mesmo bloqueio; o trigger exige o código SAP da filial de origem |
| 4 | **Completar o `hs_code` do `T-1020`** e corrigir o `sap_code_us` duplicado (`NC01728-998`, 3 artigos) | Pedro | `compute_price` sem `errors[]` no catálogo; zero duplicados em `sap_code_us` | Barato, e evita que a 2.ª importação rebente contra a constraint UNIQUE |
| 5 | **Activar** os artigos completos | 2, 3, 4 | ≥1 artigo `active`; `sales`/`agent` vêem preço | É o primeiro momento em que a app serve para o que foi feita |
| 6 | **Exercer a fronteira de custo no export** com `logistics`/`sales`/`agent` | 5 | Ficheiro real de um papel sem custos, sem coluna de custo e sem número de custo | Só é exercível depois de existir algo `active`; fecha o item A da F4 |
| 7 | **Carregar as 3 refs diferidas** (47/48/49) | Pedro (artigo-pai + filial primária) | 52 artigos carregados | Fica por último por serem 3 e por precisarem de decisão, não de trabalho |
| 8 | **Resposta do despachante** sobre a base do direito por zona (item 32) | Externa | Item 32 fechado | **Até lá os preços são operacionais, não definitivos** — não anunciar à equipa como finais |

---

## 4. Caminho até ao deployment final (E6)

| # | O quê | Depende de | Critério de «feito» |
|---|---|---|---|
| 1 | **Execução n.º 3 do protocolo**, cobrindo 0014 e 0015 | §3 passo 5 (para exercer com dados activos) | Registo assinado na secção 7 do protocolo, digest citado, 8 papéis |
| 2 | Fechar as lacunas da §2 que o Pedro considerar bloqueantes | — | Cada item da §2 com prova ou decisão registada |
| 3 | `ORDER BY` no export + rótulo `Scope` coerente com canais | — | Linhas de canal ao lado do artigo; rótulo descreve o conteúdo |
| 4 | Decidir o `Alert` dos serviços de margem plana | Pedro | Regra isenta `service`/`option`, ou a coluna sai do ficheiro que circula |
| 5 | Desactivar as contas `.test` | Pedro | Contas desactivadas, `TEST-ACCOUNTS.md` actualizado |
| 6 | Retenção de 5 anos do `audit_log` (item 49) | — | Mecanismo implementado, não só decidido |
| 7 | E5-HOMELAB: off-site do backup | — | Cópia off-site verificada por restauro |
| 8 | Renome de repo/imagem/domínio | Pedro | Decisão de 09-06 executada |
| 9 | CPI L113-9 / formalidades da migração para a empresa | Pedro | Conforme `ROADMAP.md` E6 |

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
| Terceira perna do backup | Suspensa — ficam 2 cópias em 2 máquinas | 2026-09-06 |
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

- **Gate de produção:** o ROADMAP declara-o satisfeito (`ROADMAP.md:275-287`). Proponho reabri-lo
  como §4 passo 1 — pela regra do próprio gate, que manda repetir a cada migração que toque
  RLS/vistas/privilégios; a 0014 faz `REVOKE`/`GRANT` e cria uma vista, e entrou depois da última
  execução.
- **E6** deixa de depender só do gate técnico e passa a depender também da §3 (dados activos) — não
  se valida um piloto sobre um catálogo que os papéis comerciais não vêem.

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
