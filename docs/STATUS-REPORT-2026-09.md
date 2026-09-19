# STATUS-REPORT-2026-09.md — auditoria do estado real

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Data:** 2026-09-19. **Âmbito:** inventário e diagnóstico, sem correcção.
**Método:** código e schema primeiro, git a seguir, documentação por último; produção lida ao vivo
(só leitura). Onde a documentação contradiz o código, o código ganha e a contradição entra na §8.

**Estados usados:** ✅ Verificado · 🟡 Presente, não provado · 🟠 Parcial · 📄 Só documentado ·
❌ Ausente · ⚠️ Divergente.

**Acesso a produção nesta sessão:** sim, leitura (`docker exec supabase-db psql`, `docker inspect`,
HTTP autenticado por JWT cunhado). Tudo o que abaixo diz "medido" foi medido hoje, não recordado.

---

## 0. Errata — quatro afirmações que não sobreviveram à verificação (2026-09-19, mesmo dia)

A sessão seguinte foi mandada desempatar os pontos deste relatório de que o Pedro desconfiava. Fez
bem: **quatro estavam errados**, e ficam corrigidos aqui em vez de reescritos abaixo, para se
perceber o que o relatório afirmou e porquê falhou.

| O que este relatório diz | O que se mediu | Onde falhei |
|---|---|---|
| **Rate limit ⚠️** «nenhuma variável `GOTRUE_RATE_LIMIT*`» (§3.1) | **Existe e funciona.** `limit_req zone=tmsi_auth burst=5 nodelay` em `location = /auth/v1/token` (`deploy/nginx/tmsiequipment.conf:34`), zona `rate=10r/m`. Provado ao vivo: do 7.º ao 9.º pedido `503`. | Procurei a funcionalidade **onde a imaginei** (variáveis do GoTrue) em vez de onde ela podia estar (nginx). Ausência de prova tratada como prova de ausência. Achado real por baixo: a zona vive fora do repo — item 54 |
| **Off-site 🟠** «E5-HOMELAB por iniciar» (§3.8) | **Corre, e já levou a carga real.** `atime` dos dumps: 16/09 lido a 17/09 03:08, 17/09 a 18/09 03:05, 18/09 a 19/09 03:02. | Acreditei no `ROADMAP.md`, que nunca foi actualizado, em vez de procurar sinal no sistema de ficheiros |
| **`sap_code_cn`** «quem fornece os 39?» (§7.2) | **37 dos 39 derivam-se** de uma regra já escrita (`MODEL-GAP-ANALYSIS.md:27`), com valores distintos e zero colisões; só 2 são excepção. | Li a coluna vazia e não fui ver se havia regra de derivação registada — havia, e a auditoria até a cita noutro ponto |
| **⚠️13** «caminho errado `docs/DEPLOY.md`» | **Zero referências no repo.** O caminho errado só aparecia em prompts. | Registei como incoerência do repo algo que nunca verifiquei estar no repo |

Duas afirmações **confirmaram-se e agravaram-se**: o defeito do Excel (§6 D6) é real e não entrou
em produção (`ENGINE-PARITY.md` §9.4); e a lacuna de prova da §5.2 era tão séria quanto descrita —
fechada no mesmo dia (smoke 78→91, execução n.º 3 do protocolo).

O resto do relatório manteve-se de pé à verificação.

---

## 1. Resumo executivo

A app faz hoje, em produção: autenticação completa com troca obrigatória de password, 8 papéis com
fronteira de custo imposta na base de dados (não na UI), catálogo com ciclo de vida, motor de preços
por filial **e por canal** (câmbio, fee interco, transporte, direitos HS, margem, overrides,
arredondamento por moeda), workflow de propor→aprovar com decisão em lote, importação em massa com
pré-visualização e desfazer, auditoria, dashboard, exportação Excel e white-label.

Não faz: alerta de revisão a 90 dias, notificações por email de negócio, filtros por família/moeda/
estado, moeda de visualização, API interna para integrações, exportação PDF por servidor.

**Os cinco maiores riscos antes de dados reais e antes do deployment final:**

1. **Nenhum produto está `active`** — os 49 artigos reais estão em `draft`, invisíveis a `sales` e
   `agent`; a activação está bloqueada por dois dados que não existem (`unit` para os 49,
   `sap_code_cn` para os 39 de origem TBM).
2. **A carga do catálogo real não existe em registo nenhum** — nem commit, nem `STATE.md`, nem
   `BACKLOG`. Produção está três dias à frente do git.
3. **As migrações 0014 e 0015 vivem em produção sem execução formal do protocolo**, contra a regra
   do próprio gate; a 0014 não tem sequer uma asserção de smoke que a proteja de regressão.
4. **Metade da matriz de papéis só tem prova com uma pessoa presente** — o smoke abre sessão para 4
   dos 8 papéis; `sales`, `agent`, `viewer` e `admin` nunca são exercidos automaticamente.
5. **A fronteira de custo no caminho do export nunca foi exercida com dados** — e enquanto nada
   estiver `active` não pode ser.

---

## 2. Linha do tempo real (reconstruída de 194 commits, `1da9c12`…`2052b04`)

Todos em `main`, zero merges. 74 % dos commits em três dias (09-04: 51 · 09-05: 58 · 09-06: 35).

| Etapa / item | Datas | Commits-chave | Entregou |
|---|---|---|---|
| E0 — esqueleto + infra | 09-03 | `1da9c12` `9fefac5` | Licença proprietária, schema+motor (0001), seed fictício, auth+rest vivos |
| E1 — scaffold + CI | 09-04 | `f6b06e3` `6359009` | Next.js, imagem para GHCR, CI falha se `ANON_KEY` vazia |
| E2 — app em compose | 09-04 | `cd26f2f` `68817b5` | `tmsi-app` no compose; URLs do mailer GoTrue |
| E3-i1 — auth real | 09-04 | `2678c87` `ad584b4` | Login/logout/reset, protecção de rotas, recovery por `token_hash` |
| E3-i2 — listagem de preços | 09-04 | `03cb496` `f14ebdb` | Lista por papel/filial |
| E3-i3 — admin de utilizadores | 09-04 | `0b99133` `6f07ba2` | Gestão de contas; `SERVICE_ROLE_KEY` só para ops GoTrue |
| E3-i4 + 0002 | 09-04 | `64df817` `e7d52d9` | Ciclo de vida + breakdown; fuga de `exw_price`/SAP **reaberta e re-corrigida** |
| E3-0003/0004 | 09-04 | `cdc495f` `83785b4` | Privilégios de coluna; leituras por `v_products` |
| E3-i5 — configuração | 09-04 | `bee755f` `cacd60d` | FX/fees/transporte/direitos/margens |
| E3-0005 | 09-04 | `5dd29d4` | Correcção de FX no mesmo dia |
| E3-i6 — overrides + audit | 09-04 | `44e6542` `cdf5f7e` | UI de overrides e log global |
| E3-i7 — protocolo | 09-04 | `500421a` | Protocolo de verificação, matriz contra schema real |
| E3-i8 — dashboard | 09-04→05 | `3e71bb1` `5f8b4c8` | KPIs, margem por filial, frescura do câmbio |
| **Protocolo, execução n.º 1** | 09-05 | `e9b1ab8` `8ce9f5e` | Gate de produção satisfeito para 0001–0005 |
| i9 + 0006 | 09-05 | `4a93800` `e1928f6` | Gestão de passwords sem email |
| i10 — export Excel + impressão | 09-05 | `928cc9b` `acf71c0` | `.xlsx` e vista de impressão (3 fixes de CI em cadeia) |
| tarefas 3–4 | 09-05 | `bd4e10b` `5753196` | `smoke.py`, `npm ci`, política de passwords, headers do vhost |
| tarefas 5–7 | 09-05 | `ae04b52` `4922fb9` | Revisão read-only (9 achados) e respectiva correcção |
| Piloto | 09-05 | `b2a0746` `8ec11f9` | Guião de onboarding; **piloto adiado por decisão do Pedro** |
| itens 14/28 | 09-05→06 | `47ff96a` `13ec415` | Medição destacada; artefacto de medição PostgREST |
| item 15 | 09-06 | `785b7a1` | Ensaio de restauro: dados sobrevivem, **procedimento não** |
| item 21/24 | 09-06 | `950bbb4` `a685250` | Kit de desastre, escrow cifrado, GHCR privado, rotação de segredos |
| item 22/25 | 09-06 | `107816b` `b6d7b61` | Env de runtime (3 tentativas até o fail-fast derrubar o container) |
| **E4 + 0007** | 09-06 | `6c280cc` `0133ee6` | Workflow de aprovação |
| item 26 + 0008 | 09-06 | `47415d1` `673e0d4` | White-label (opção B) |
| item 18 | 09-06 | `43468cf` | `/api/fx-age` |
| Paridade — ferramentas | 09-07→09 | `59876ea` `ac58832` | Template CSV, validador, gap analysis |
| **0009 — canais** | 09-09 | `66b6e37` `8895324` | Canais/agentes no motor |
| **0010/0011** | 09-10 | `11a1904` `63114d9` | Arredondamento por moeda, margem de não-equipamento; 0011 corrige grants da 0010 |
| **0012** + `/branches` | 09-10 (deploy 09-14) | `c35bdca` `36a9f61` | Margem interco passa a propriedade do artigo (4 dias entre código e deploy) |
| Reconciliação do BACKLOG | 09-15 | `aac56b5` `7eeb9ab` | Varrimento contra schema real; 6 itens em falta; 21/22/23 renumerados |
| item 38 — paridade | 09-15 | `7eff951` | Fórmula bate 100 % na amostra de 13 artigos |
| item 39 + 0013 | 09-15 | `d04e459` `368cea2` | Importação em massa |
| item 40 | 09-15 | `176a2d4` | Higiene de seed; smoke desacoplado do login `.test` |
| **Protocolo, execução n.º 2** | 09-16 | `5701607` `1b1b376` | Completa, 8 papéis, **cobre 0001–0013** |
| item 42 | 09-16 | `877e2eb` `bff668f` | `/privacy` + nota de tratamento de dados |
| itens 47+48 + 0014 | 09-16 | `3b3f614` → `1cf2217` | Fronteira do `audit_log`; **0014 corrigida no próprio dia (REVOKE era no-op)** |
| item 43 | 09-16 | `b3b0a5a` | Cadência de backup: semanal permanente + modo janela |
| item 44 + 0015 | 09-16 | `5914836` `2052b04` | Decisão em lote (último commit do repo) |
| **Carga do catálogo real** | 09-16→19 | **nenhum commit** | 49 artigos, 485 overrides, 4 HS, 11 categorias — ver §8 ⚠️1 |

**33 deploys** por digest, do `d608eaaea804` (09-04) ao `def7ea31bbd4` (09-16, em execução).
Ritmo: 14 num só dia (09-04), depois um por sessão. Dois commits admitem deploy esquecido
(`cdf5f7e`, `e1928f6`). Único intervalo >2 dias sem commits: 09-11 a 09-13.

**Re-trabalho medido:** 41 dos 194 commits (21 %) trazem `fix|corrig|reopen|regress|missed|no-op|leak`
no assunto. Duas migrações existem só para corrigir outra (0004←0003, 0011←0010); duas foram
corrigidas no próprio ficheiro (0002 em `8b2239f`, 0014 em `1cf2217`).

---

## 3. Inventário funcional

### 3.1 Autenticação e contas

| Funcionalidade | Estado | Prova |
|---|---|---|
| Login | ✅ | `app/src/app/login/actions.ts:20`; smoke usa-o nos 3 modos |
| Logout | ✅ | `app/src/app/logout/route.ts:32` (POST, nomeável pelo middleware `middleware.ts:16-19`) |
| Reset por email | 🟡 | `forgot-password/actions.ts:33` + `auth/confirm/actions.ts:35` + `reset-password/actions.ts:22`; **fluxo de email nunca executado** (protocolo S/T NÃO EXECUTADOS em ambas as execuções) |
| Troca obrigatória de password | ✅ | `profiles.must_change_password` (0006); gate em `middleware.ts:52-54` |
| Convites | 🟡 | `admin/users/actions.ts:38,46` (GoTrue admin API); sem asserção de smoke |
| Desactivar / reactivar | 🟡 | `admin/users/actions.ts:107-142` (ban `876000h`/`none`); documentado em `docs/TEST-ACCOUNTS.md` |
| Política de password | ✅ | `deploy/supabase/docker-compose.yml:111,112,120` — `min_length 12`, 4 classes, exige password actual |
| Security headers | ✅ | `deploy/nginx/tmsiequipment.conf:14-17`; **confirmado ao vivo** (HSTS, X-Frame-Options DENY, Referrer-Policy, CSP). Falta `X-Content-Type-Options: nosniff` |
| Rate limit | ⚠️ | **Nenhuma variável `GOTRUE_RATE_LIMIT*` declarada** no compose nem no `.env.example` — vale o que o GoTrue traz por omissão, e isso nunca foi verificado |

### 3.2 Papéis e fronteiras (tal como existem no schema)

`role_code` tem **8 valores** — medido: `admin, product_manager, finance, branch_manager, logistics,
sales, agent, viewer`. Funções-fronteira, lidas ao vivo:

- `can_read_costs()` = `admin ∨ product_manager ∨ finance ∨ branch_manager ∨ viewer`
- `can_read_operational()` = `can_read_costs() ∨ logistics`
- `products_visible(primary_branch, sold_in, status)` — `admin`/`product_manager`/`finance`/
  `logistics`/`viewer` vêem tudo; `branch_manager` a sua filial; **`sales` e `agent` só `status='active'`**

Matriz papel × capacidade (derivada das funções, não de documentação):

| Capacidade | admin | prod_mgr | finance | branch_mgr | logistics | sales | agent | viewer |
|---|---|---|---|---|---|---|---|---|
| Ler custos (`v_products.exw_price`, breakdown) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Ler operacional (`origin_country`, supplier) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Ver artigos não-`active` | ✅ | ✅ | ✅ | ✅ (sua filial) | ✅ | ❌ | ❌ | ✅ |
| Preço de canal | ✅ | ✅ | ✅ | ❌ | ❌ (bloco W) | ❌ | ✅ (seu canal) | ✅ |
| Escrever artigos | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Propor config | ✅ | ✅ | ✅ | ✅ | ◐ | ❌ | ❌ | ❌ |
| Aprovar config global | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Aprovar override da sua filial | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Importação em massa | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ler `audit_log` | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Conteúdo de auditoria de `profiles` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (0014) |
| Gerir utilizadores / branding / filiais | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Utilizadores reais por papel (medido):** 10 perfis, todos activos; 7 papéis com **1** utilizador
cada; `viewer` com **0**; **3 perfis sem papel nenhum**. Todas as contas são fictícias `.test`
excepto a conta pessoal do Pedro (única `admin`) — `docs/TEST-ACCOUNTS.md`.

### 3.3 Modelo de entidades

| Entidade | Estado | Prova |
|---|---|---|
| Filiais (4) | ✅ | `tmsi.branches` — medido: SA, TBM, CORP, LTD |
| Canais (1) | ✅ | `tmsi.channels` — medido: APAC; enum `pricing_scope` (`0009:56`) |
| Âmbito por utilizador | ✅ | `my_branches()` / `my_channels()`; `user_roles.branch_id`/`channel_id` com CHECK (`0001`) |

### 3.4 Catálogo

| Item | Estado | Prova |
|---|---|---|
| Lista / detalhe / criar / editar | ✅ | `products/page.tsx`, `[id]/page.tsx`, `new/page.tsx` |
| Ciclo de vida | 🟠 | Enum tem 6 estados (`draft, pending, active, review, inactive, discontinued`, `0001:19`) mas a UI passa `status` livre e deixa os triggers recusarem — **não há máquina de estados no frontend** (`products/[id]/actions.ts:32,65`) |
| Guarda de activação | ✅ | `check_activation_requirements()` exige HS, peso, `unit` e o código SAP da filial de origem; smoke bloco O |
| Códigos SAP | 🟠 | 4 colunas (`sap_code_sa/cn/us/uk`), todas com UNIQUE — medido. Só `sap_code_sa` é escrita pelo importador |
| Relação pai/opção | ❌ | `products_check` exige `parent_id` para `item_type='option'`, mas o importador não escreve `parent_id` (`docs/IMPORT.md`, "Limites conhecidos") |

### 3.5 Motor de preços

| Elemento | Estado | Prova |
|---|---|---|
| `compute_price()` por filial e por canal | ✅ | `0001:384` → `0007` → `0009` → `0010` → `0012`; smoke A/B provam API ≡ BD |
| FX | ✅ | `fx_rate()` (`0005:53`, desempate por `created_at`); medido ao vivo: EUR base, CNY 8.26, USD 1.1587, GBP 0.88 |
| Fee interco | ✅ | Propriedade do artigo desde 0012; smoke bloco X prova fee 0 na filial de origem |
| Transporte | ✅ | Override por artigo×âmbito; sem override e na filial de origem → **0 por regra do motor** (verificado ao vivo em 5 linhas) |
| Direitos HS | ✅ | `customs_rates` por zona; sem taxa → `errors[]`, nunca um default silencioso |
| Margens | ✅ | `branch_margin()` por grelha + override; `margin_grids` versionada |
| Overrides | ✅ | `price_overrides` (6 `kind`), substituem um **input**, nunca um resultado (`0001:208`) |
| Arredondamento | ✅ | Mínimo **para cima**, referência **ao mais próximo** a partir do mínimo já arredondado (`0010:8-10,104-109`); smoke bloco U; ramo discriminante verificado ao vivo |

### 3.6 Ecrãs

| Ecrã | Estado | Prova |
|---|---|---|
| `/config` (câmbios, transporte, direitos, margens, params, settings) | ✅ | `config/page.tsx:95-157` |
| `/branches` (filiais + canais) | ✅ | `branches/page.tsx:46-74` |
| `/overrides` | ✅ | `overrides/page.tsx:70-90` |
| `/proposals` (individual + lote) | ✅ | `proposals/actions.ts:35,78`; smoke blocos R/S/T/AA |
| `/import` (pré-visualizar, gravar, desfazer) | ✅ | `import/actions.ts:47,81,98`; smoke bloco Z |
| `/audit` | ✅ | `audit/page.tsx:53-65` — filtros e paginação; 6 colunas seguras |
| `/dashboard` | 🟠 | 5 blocos (`dashboard/page.tsx:139-302`); metade browser **não executada** no protocolo (passo V) |
| `/privacy` | ✅ | `privacy/page.tsx`; smoke verifica o redirect sem sessão |
| `/prices` filtros | 🟠 | **Só filtro por filial** — e o mesmo parâmetro `branch` transporta ids de canal. Sem família, moeda ou estado (`prices/page.tsx:46-48,124-145`) |

### 3.7 Exportações e branding

| Item | Estado | Prova |
|---|---|---|
| Export Excel (preços) | 🟡 | `prices/export/route.ts`; ramifica por `can_read_costs`. **Nunca gerado por via automatizada** — a rota exige cookies (medido: `307 → /login` mesmo com Bearer) |
| Export Excel (catálogo) | ⚠️ | `products/export/route.ts:40` — **única rota de export sem gate de papel próprio**; depende só da RLS de `v_products` |
| Export PDF | ❌ | Não existe caminho servidor; só `window.print()` + CSS `print:` (`prices/print-button.tsx:10`) |
| Branding / white-label | 🟡 | 0008 + `/config/branding`; **zero asserções de smoke**; passo KK do protocolo NÃO EXECUTADO |

### 3.8 Operações

| Item | Estado | Prova |
|---|---|---|
| CI → GHCR | ✅ | `.github/workflows/ci.yml` — build+push por digest. **Não corre testes nem lint**; a verificação de tipos vem do `npm run build` do Dockerfile (`app/Dockerfile:38`) |
| Deploy por digest | ✅ | Em execução: revisão `cf98518`, digest `def7ea31bbd4` — bate com o último commit de deploy `73fe24f` |
| Fail-fast de runtime | ✅ | `app/Dockerfile:57` — falta de `SUPABASE_URL`/`ANON_KEY` derruba o container |
| Backups | ✅ | Modo janela activo (diário 03:30), semanal inactivo; 28 dumps; último `tmsi-2026-09-19-window.dump`, corrido hoje |
| Off-site | 🟠 | E5-HOMELAB por iniciar (`docs/ROADMAP.md`); terceira perna suspensa por decisão de 09-06 |
| Escrow de segredos | ✅ | Item 21 F5; `docs/DISASTER-DRILL.md` |
| Kit de desastre | ✅ | `docs/DISASTER-DRILL.md` — ensaio real, RTO 13m21s |
| Restauro | ✅ | Procedimento corrigido (`-U supabase_admin`, nunca `--no-owner`); re-provado a 09-16 e outra vez nesta cadeia |
| Monitorização | 🟠 | `/api/fx-age` + `status.json` do VPS; sem alertas de negócio |
| Smoke | ✅ | 78/78 nos 3 modos (`login` omisso, `login` explícito, `jwt`) |

---

## 4. Inventário do schema

**Medido ao vivo:** 28 tabelas · 5 vistas · 23 funções (19 `SECURITY DEFINER`) · 43 políticas RLS ·
20 triggers · 6 enums.

⚠️ **Não existe ledger de migrações para `tmsi`** — o único `schema_migrations` é o do GoTrue
(`auth.schema_migrations`). A aplicação de cada migração teve de ser inferida por sondagem dos
objectos que cria. **Todas as 15 sondas deram positivo** → 0001–0015 estão aplicadas.

| # | Introduziu | Porquê |
|---|---|---|
| 0001 | Schema completo: 6 enums, 20 tabelas, 8 funções, 2 vistas, ~30 políticas, seed de referência | Funcionalidade nova |
| 0002 | `record_exw_version()` passa a definer; `search_path` pinado em `audit()` | **Correcção da 0001** — RLS de `price_versions` sem política INSERT travava *toda* a escrita em `products` (`0002:8-28`); e `audit()` era definer sem `search_path` (vector de escalada, `0002:37-49`) |
| 0003 | `can_read_operational()`, `products_visible()`, privilégios por coluna, vista `v_products` | **Correcção** — a RLS da 0001 filtrava linhas, nunca colunas (`0003:11-16`) |
| 0004 | `grant select (primary_branch, sold_in)`; `v_products` recriada | **Correcção da 0003**, na mesma sessão — gatear essas 2 colunas partiu a secção de preços para `sales`/`agent` |
| 0005 | Larga `unique(currency, effective_date)`; `clock_timestamp()`; `fx_rate()` desempata | **Correcção de usabilidade da 0001** — taxa errada não podia ser corrigida no mesmo dia |
| 0006 | `must_change_password`, `mark_password_changed()`, `admin_revoke_sessions()` | Funcionalidade nova — passwords sem email |
| 0007 | Versiona 4 tabelas de config por `effective_date`; `price_proposals`; `decide_price_proposal()`; **remove as políticas de escrita directa** | Funcionalidade nova (E4) |
| 0008 | `branding`, `branding_logos`, `v_current_branding` | Funcionalidade nova — white-label; fora do workflow por ser apresentação |
| 0009 | `pricing_scope`; `price_overrides.scope_type/scope_id`; `compute_price()` por âmbito; `v_branch_prices` passa a `UNION ALL` filial+canal | Funcionalidade nova — canais/agentes |
| 0010 | `currency_rounding_params`, `branch_pricing_params` (versionadas), `round_up_to()`, `origin_country` no escalão de custo | Funcionalidade nova + fronteira |
| 0011 | `owner to postgres` + grants explícitos em 2 tabelas e `v_products` | **Correcção da 0010**, minutos depois — tabelas criadas por `supabase_admin` não apanharam o `alter default privileges` da 0001 |
| 0012 | `products.interco_margin`; motor lê a margem do artigo | Mudança de modelo — `interco_fees` fica como histórico, o motor deixa de a ler |
| 0013 | `import_batches`, `import_batch_items`, `run_import_hs_duty()`, `run_import_products()`, `undo_import_batch()` | Funcionalidade nova — importação em massa |
| 0014 | `revoke`/`grant` por coluna em `audit_log`; vista `v_audit_log` | **Correcção de privacidade** — `old_row`/`new_row` de `profiles` expunham nome/email a 4 papéis |
| 0015 | `decision_batches`; 5.º parâmetro em `decide_price_proposal()`; `decide_price_proposal_batch()` | Funcionalidade nova — decisão em lote |

**Lições registadas nos próprios cabeçalhos** (valem mais do que o inventário):

- `REVOKE` ao nível da coluna é **no-op silencioso** contra um `grant` de tabela — documentado em
  `0003:44-51` e **repetido em `0014:41-49`** porque a lição não pegou à primeira.
- `CREATE OR REPLACE FUNCTION` não pode alterar a lista de parâmetros (`0007:127`, `0009:76`, `0015:103`).
- Vista com dono `BYPASSRLS` não herda RLS — a visibilidade tem de ser reimplementada no `WHERE`
  (`0003:58-70`, `0014:32-37`).
- `now()` está congelado na transacção → `clock_timestamp()` (`0005:34-43`).
- `alter default privileges` não é retroactivo (`0011:20-24`).

**Tabela funcionalmente órfã:** `interco_fees` — viva no schema, já não lida pelo motor desde 0012.

---

## 5. Cobertura de prova

### 5.1 Smoke — 78 asserções

| Bloco | Prova | Asserções |
|---|---|---|
| health · privacy | `/api/health`, `/auth/v1/health`, `/privacy` sem sessão | 3 |
| G·H·I | Fronteira de custo 0003/0004, incluindo o **oráculo booleano** sobre coluna revogada | 5 |
| J | Âmbito de filial: subconjunto estrito | 2 |
| A·B (×2 papéis) | Listagem com custos + **API ≡ `compute_price()` directo** | 8 |
| O · Q · P | Guarda de activação · motivo de override · EXW→`review` + `price_versions` | 5 |
| R · S · T | Workflow: `exchange_rates`, overrides de filial, overrides de canal | 23 |
| U · V · W | Arredondamento (0010) · `origin_country` · âmbito de canal do logistics | 6 |
| X · Y | `interco_margin` do artigo (0012) · `branches`/`channels` admin-only | 5 |
| AA | Decisão em lote (0015), incl. atomicidade pelo ramo de falha | 15 |
| Z + fecho | Importação em massa (0013) + resíduo zero | 6 |
| **Total** | | **78** |

### 5.2 O que não tem prova automatizada

**Migrações sem uma única asserção:** **0005** (teste directo *substituído* pelo bloco R, não
reforçado), **0006** (passwords), **0008** (branding), **0014** (`v_audit_log`). A 0011 está
indirectamente protegida (o bloco U lê as tabelas cujos grants ela corrigiu).

**Rotas sem asserção:** `/prices/export`, `/products/export`, `/dashboard`, `/admin/users`,
`/config/branding`, `/api/branding/logo`, `/api/fx-age`, `/email-templates/*`, `/login`, `/logout`,
`/forgot-password`, `/reset-password`, `/auth/confirm`, `/account/password`, `/audit`, `/import` (o ecrã).

**Papéis sem sessão no smoke:** `TEST_USERS` tem 4 (`finance`, `product_manager`, `logistics`,
`branch_manager`); a matriz tem 8. `sales`, `agent`, `viewer` e `admin` nunca são exercidos
automaticamente — e **não existe conta `.test` de admin**.

### 5.3 Protocolo — 61 passos, 2 execuções

| Execução | Data | Migrações | Digest | Resultado |
|---|---|---|---|---|
| n.º 1 | 2026-09-05 | 0001–0005 | `3775da62…` | Gate satisfeito para esse estado |
| n.º 2 | 2026-09-16 | **0001–0013** | `b47070df…` | Completa, com 9 blocos NÃO EXECUTADOS |

⚠️ **A última execução formal é válida até à 0013.** Depois dela entraram **0014** (só uma nota
datada, sem execução, sem smoke) e **0015** (texto novo §4.14 + cobertura completa pelo bloco AA,
mas nunca uma execução formal). A regra do próprio gate (`ROADMAP.md:262-264`) manda repetir o
protocolo a cada migração que toque RLS/vistas/privilégios — a 0014 faz exactamente isso.

**Blocos NÃO EXECUTADOS na n.º 2** (todos por exigirem browser ou caixa de correio): `S`,`T` (email,
por cobrir desde 09-05), `V` (dashboard), `W`,`X` (exibição única de password), `CC`,`DD`
(impressão, `docker stats`), `KK` (branding no `.xlsx`).

**Quatro correcções reais foram apanhadas pela própria execução do protocolo** (nota ⁸ da matriz,
passo K duas vezes, passo RR superseded pela 0010, grants em falta corrigidos pela 0011) — é o
argumento mais forte a favor de o voltar a correr.

---

## 6. Desvios face ao plano inicial (Anexo A)

| # | O plano dizia | O que existe | Quando/porquê | Classificação | Impacto |
|---|---|---|---|---|---|
| D1 | Hosting **Vercel + Supabase cloud** | **VPS próprio** (`185.200.244.100`) com Supabase self-hosted **reduzido a 3 serviços** — medido: `supabase-db`, `supabase-auth`, `supabase-rest` (sem storage, realtime, studio, kong) | Desde E0/E1 (09-03/04): imagem para GHCR, compose próprio, vhost nginx | **Decisão deliberada** | Ganha controlo e custo; perde o que o plano dava de graça (escala, backups geridos). Obrigou a construir de raiz backups, escrow, kit de desastre e CI/CD — trabalho real que o plano não previa |
| D2 | **4 perfis** (Admin, Gestor de Filial, Comercial, Financeiro) | **8 papéis** — `role_code` medido: `admin, product_manager, finance, branch_manager, logistics, sales, agent, viewer` | 0001 (09-03), já com 8 | **Decisão deliberada** | A matriz de prova duplicou de tamanho; metade dos papéis não tem cobertura automatizada (§5.2) |
| D3 | `products` / `branch_prices` / `exchange_rates` + **1 view** | **28 tabelas, 5 vistas**. `branch_prices` **nunca existiu como tabela** — é `v_branch_prices`, calculada por `compute_price()` linha a linha | 0001 e seguintes | **Decisão deliberada** | Preço deixa de ser dado armazenado e passa a função — elimina divergência entre tabela e fórmula, mas torna toda a leitura dependente do motor |
| D4 | Fase 3: audit log, histórico, exportações **depois** da importação | Todos entregues **antes**: `audit_log` e `price_versions` na 0001 (09-03), exportações a 09-05 — a importação real só a 09-16 | — | **Deriva não registada** (ordem), mas benigna | A auditoria estava viva quando os dados reais entraram — melhor do que o plano. 2880 linhas de `audit_log` medidas |
| D5 | Importar **50 produtos** como 2.º passo da Fase 2 | **49 artigos** carregados a 09-16, no fim de tudo; 3 diferidos (refs 47-49). **Todos em `draft`** | Ferramenta (0013) só existiu a 09-15 | **Imposto por restrição externa** (o Excel real só ficou disponível tarde; 3 artigos sem dados) | O passo "testes com utilizadores reais por perfil" da Fase 2 **nunca aconteceu** — piloto adiado a 09-05 |
| D6 | Paridade com o Excel — não prevista explicitamente | Feita: item 38 (amostra de 13 artigos, `ENGINE-PARITY.md`) e catálogo completo (245 linhas) nesta cadeia de sessões | 09-15/16 e 09-19 | **Acrescento deliberado** | Revelou um defeito **no Excel**, não no motor: 7 refs × 3 filiais sem fee interco aplicado. A paridade do catálogo completo **não está escrita no repo** (⚠️1) |
| D7 | — | **Fora do plano:** workflow propor→aprovar (0007), decisão em lote (0015), canais/agentes (0009), white-label (0008), overrides, importação em massa (0013), licença proprietária, kit de desastre, escrow, nota de dados pessoais + `/privacy` | 09-05→09-16 | **Decisão deliberada** (cada uma com item de BACKLOG datado) | É a maior parte do trabalho feito. O plano descrevia uma app de leitura; o que existe é um sistema de governo de preços |
| D8 | Alerta de revisão **90 dias** | ❌ **Ausente** — zero ocorrências em `app/src`, migrações e `scripts` | Nunca iniciado | **Deriva não registada** | Uma das três funcionalidades nominais da Fase 3 do plano não existe nem está no BACKLOG com esse nome |
| D9 | **Notificações por email** | ❌ **Ausente** — só email transaccional do GoTrue (convite, recuperação). Zero ocorrências de notificação de negócio | — | **Decisão implícita** (EOP despromovido a melhoria, 09-05) | Idem |
| D10 | Filtros: filial · **família · moeda de visualização · estado** | 🟠 **Só filial** (e o parâmetro `branch` transporta também canais) | — | **Deriva não registada** | Com 49 artigos e 17 categorias, a falta de filtro por família passa a doer |
| D11 | **API interna para integrações** | ❌ As 3 rotas `/api/*` são de infraestrutura (`health` público, `fx-age` por token partilhado, `branding/logo`); nenhuma expõe catálogo ou preços | — | **Deriva não registada** | Fase 3 do plano por cumprir |
| D12 | "price list TMSI", âmbito 50 produtos/4 filiais | "**Equipment Price Listing**", UI em **inglês**, docs em português, âmbito inclui canal APAC e agentes | Renome em E0 (`9b77e6e`) | **Decisão deliberada** | Renome de repo/imagem/domínio ficou adiado para a E6 (decisão de 09-06) |

---

## 7. Pendências e decisões em aberto

### 7.1 Trabalho executável já (não depende de ninguém)

| O quê | Bloqueia | Item |
|---|---|---|
| Escrever a carga do catálogo em `STATE.md`/`BACKLOG`/`ENGINE-PARITY.md` e comitar | A documentação estar a mentir sobre produção | ⚠️1 |
| Execução n.º 3 do protocolo (cobrir 0014 e 0015) | O gate de produção | ⚠️3 |
| Asserções de smoke para a 0014 (`v_audit_log`) | Regressão silenciosa da fronteira de privacidade | §5.2 |
| `ORDER BY` no export de preços | Linhas de canal aparecem num bloco no fim, longe do artigo | F4/C |
| Completar `hs_code` do `T-1020` | 3 escopos em `error` num catálogo recém-carregado | F4/B |
| Corrigir `sap_code_us` duplicado (`NC01728-998` em 3 artigos) | A 2.ª importação vai bater na constraint UNIQUE | F4 |
| `X-Content-Type-Options: nosniff` no vhost | Cabeçalho em falta | §3.1 |

### 7.2 Decisão do Pedro

| Pergunta | Bloqueia | Onde |
|---|---|---|
| Que `unit` levam os 49 artigos? | **A activação de todos eles** | §1 risco 1 |
| Quem fornece os `sap_code_cn` dos 39 artigos de origem TBM? | Activação desses 39 | §1 risco 1 |
| Artigo-pai e filial primária das refs 47/48/49 | Carregar os 3 artigos `option` em falta | BACKLOG (carga) |
| `branch_manager` pode aprovar configuração global? | Item 50, sem prazo | `BACKLOG.md:104-114` |
| `Alert` marca `critical` nos 3 serviços de margem plana — isenta-se ou tira-se a coluna? | Ficheiro que circula fora da empresa | F4 |
| Contas `.test`: quando desactivar? | Higiene antes do deployment final | `TEST-ACCOUNTS.md` |
| Retenção de 5 anos do `audit_log`: decidida, **não implementada** | Item 49 | `DATA-PROCESSING-NOTICE.md` |

### 7.3 Dependência externa

| O quê | Bloqueia |
|---|---|
| Base do direito aduaneiro por zona (despachante) — item 32, aberto desde 09-09 | **Os preços carregados são operacionais mas não definitivos.** Não anunciar à equipa como finais |
| Nomenclatura oficial dos 4 códigos HS novos | Descrições marcadas `PROVISORIA` em produção |
| Gateway de email corporativo | Passos S/T do protocolo, por cobrir desde 09-05 |

---

## 8. Incoerências (⚠️)

**⚠️1 — A carga do catálogo real não existe em registo nenhum.** Produção tem 49 produtos
`T-1001`–`T-1052`, 491 `price_overrides`, 3 `import_batches`, 17 `categories`, 21 `hs_codes`, 84
`customs_rates` (medido). Contra isto: `deploy/DEPLOY.md:141-142` diz *"real catalog **not yet
loaded**"*; `STATE.md` termina no item 44; `BACKLOG.md` não tem item para a carga; o git não tem
commit nenhum depois de `2052b04` (09-16). **É o maior evento de dados do projecto e está por escrever.**

**⚠️2 — Item 47 diz que nada foi implementado; a 0014 implementou-o.** `BACKLOG.md:159-161` afirma
*"não implementada por decisão explícita"* e o item continua sem tachado. Contra:
`0014_audit_log_content_boundary.sql:50-62` faz exactamente essa correcção, está em produção
(sondagem positiva) e o protocolo já a documenta (`VERIFICATION-PROTOCOL.md:1252`).

**⚠️3 — A regra do gate não foi aplicada às duas últimas migrações.** `ROADMAP.md:262-264` manda
repetir o protocolo a cada migração que toque RLS/vistas/privilégios; a 0014 faz `REVOKE`/`GRANT` e
cria uma vista. A última execução cobre 0001–0013.

**⚠️4 — `PILOT-ONBOARDING.md:4` fixa o digest `8b466fa3…` "(migrações 0001–0006)"**; em produção
corre `def7ea31…`, revisão `cf98518`. O guião aponta para um estado nove migrações atrás.

**⚠️5 — `README.md:67-78` descreve outro projecto.** Marca por fazer o seed fictício, "Auth + role
assignment + RLS", o frontend inteiro e os exports — tudo entregue e provado entre 09-04 e 09-05.

**⚠️6 — `docs/README.md` indexa três ficheiros que não existem** (`TMSI_PriceManager_Estrutura_v2.md`
e outros dois). O próprio texto diz que seriam copiados antes do primeiro push; nunca foram.

**⚠️7 — Item 40 afirma um facto hoje falso:** *"todo o `tmsi.products` de hoje é fictício, zero
linhas reais"* (`BACKLOG.md:193-194`). Medido: 49 das 62 linhas são catálogo real. Era verdade
quando foi escrito, no mesmo dia em que deixou de ser.

**⚠️8 — `ROADMAP.md` deixou de ser o índice do schema a partir da 0008.** A tabela de etapas cobre
0003–0007; as migrações 0008–0015 só estão narradas no BACKLOG.

**⚠️9 — Dois caminhos de leitura para o mesmo registo de auditoria.** `/audit` lê a tabela crua
`audit_log` (`audit/page.tsx:63`); `/products/[id]` lê `v_audit_log` (`products/[id]/page.tsx:168`).
Funciona porque `/audit` só selecciona as 6 colunas re-concedidas pela 0014 — mas é assimetria, não
desenho: qualquer coluna nova acrescentada ao `select` de `/audit` fura a fronteira sem aviso.

**⚠️10 — `/products/export` não tem gate de papel próprio** (`products/export/route.ts:40`), ao
contrário de `/prices/export`, que ramifica por `can_read_costs`. Depende inteiramente da RLS de
`v_products`.

**⚠️11 — `Scope: All branches` num ficheiro que inclui canais.** O rótulo reflecte o filtro
(`prices/export/route.ts:99`) mas descreve mal o conteúdo — o ficheiro traz 54 linhas de canal.

**⚠️12 — Sem ledger de migrações.** Não há tabela que registe o que foi aplicado a `tmsi`; o estado
teve de ser inferido por sondagem. Funciona enquanto houver quem saiba sondar.

**⚠️13 — Caminho errado em referências:** `docs/DEPLOY.md` não existe; o ficheiro é `deploy/DEPLOY.md`.

**Nota:** `docs/STATE.md` tem 38 linhas **por comitar** — a nota do incidente da F0 da carga. É o
único registo dessa sessão que existe em ficheiro.

**Higiene:** zero `TODO`/`FIXME`/`XXX`/`HACK` em todo o `app/src`; zero ficheiros órfãos.

---

## 9. O que não foi verificável nesta sessão

- **Conteúdo de um `.xlsx` real gerado por sessão autenticada** — a rota exige cookies do browser
  (medido: `307 → /login` mesmo com `Authorization: Bearer`), e a regra do `CLAUDE.md` do VPS proíbe
  fabricar cookies do `@supabase/ssr`. Fica para o browser do Pedro.
- **Fronteira de custo no export para papéis sem custos** — estruturalmente defendida em duas
  camadas, mas **não exercível** enquanto nenhum produto estiver `active`.
- **Fluxos de email** — gateway corporativo, por cobrir desde 09-05.
- **Desempenho** — proibido medir com sessão de agente aberta (regra do `CLAUDE.md` do VPS).
