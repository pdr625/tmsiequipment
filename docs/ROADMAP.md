# TMSI Equipment Price Listing — ROADMAP
Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

Folha de rota do projecto. **Regras de manutenção:** este ficheiro é enviado ao Claude Code
no início de cada etapa; a sessão que fechar (ou alterar o âmbito de) uma etapa actualiza-o
no mesmo passe (estado + data + desvios), commit + push — tal como o `STATE.md`.
Divisão de papéis dos documentos: `ROADMAP.md` = ordem e critérios das etapas ·
`STATE.md` = estado corrente de runtime · `handover.md` = histórico (não seguir) ·
`BACKLOG.md` = fila de trabalho priorizada do Pedro (ordem de sessões), este ficheiro
absorve-a por etapa conforme cada item é iniciado/fechado.

## Backlog e ordem de sessões (2026-09-05)

`docs/BACKLOG.md` (colado pelo Pedro, verbatim) é a referência de trabalho corrente,
substitui a lista da análise de 05/09. Ordem: **i9 (passwords sem email) → i10 (export
Excel/PDF) → sessão técnica (smoke tests + lockfile) → auth/headers → code review → piloto
→ L2/E4 informada pelo uso → restantes por procura.** Duas mudanças de prioridade face ao
que este ficheiro assumia antes: **EOP despromovido de bloqueio a melhoria** (decisão do
Pedro, i9 — o onboarding do piloto passa a depender de password temporária comunicada
verbalmente pelo admin, não de email; o desvio EOP/quarentena da E5-VPS, linha abaixo,
continua por cobrir mas já não bloqueia nada) e **export Excel/PDF promovido a crítico**
(i10, antes nem listado aqui).

**Tarefa 3 (smoke tests + lockfile) — ✅ fechada 2026-09-05.** O ciclo de release ganha um
passo obrigatório novo: **push → CI → deploy por digest → `python3 scripts/smoke.py` ✅** —
já corrido uma vez de ponta a ponta contra o primeiro deploy `npm ci`. Detalhe:
`docs/STATE.md`.

## Estado das etapas

| Etapa | Título | Estado |
|---|---|---|
| E0 | Infra backend (Supabase magro + schema + proxy + SMTP + backup) | ✅ 03/09/2026 |
| E1 | Scaffold frontend Next.js + CI→GHCR | ✅ 04/09/2026 |
| E2 | Deploy do frontend no VPS + vhost | ✅ 04/09/2026 |
| E3 | Ecrãs da aplicação, por iterações — i1 auth ✅, i2 preços ✅, i3 admin utilizadores ✅, i4 formulário de produto ✅, i5 configuração do pricing ✅, i6 overrides + auditoria ✅, i7 protocolo de verificação ✅, i8 dashboard ✅ | ✅ 05/09/2026 — **COMPLETA**; estendida pelo backlog: i9 (passwords sem email, migração 0006) ✅ 05/09/2026 (mecanismo; browser pendente), i10 (export Excel/PDF) ✅ 05/09/2026 |
| — | Migração 0003/0004 — protecção de custos ao nível da BD | ✅ 04/09/2026 |
| — | Migração 0005 — correcção de câmbio no mesmo dia | ✅ 04/09/2026 |
| — | Migração 0006 — gestão de passwords sem email (i9) | ✅ 05/09/2026 (mecanismo; provas de ecrã real pendentes do Pedro) |
| E4 | Migração 0007 (workflow de aprovação, regra 90 dias, notificações) — número avançado por 0006/i9 | por iniciar |
| E5 | Operações e endurecimento — VPS ✅, homelab por iniciar | em curso |
| E6 | Validação do piloto + preparação da migração para a empresa (gate: `VERIFICATION-PROTOCOL.md`) | por iniciar |

## E0 — Infra backend — ✅ FECHADA 03/09/2026
Entregue: stack magra db+auth+rest (rede `tmsi_net` 172.20.40.0/24), schema `tmsi` aplicado
(seed fictício, `count(v_branch_prices)=30`), vhost nginx + HTTPS, SMTP via relay do host
(listener dedicado sem STARTTLS), backup nocturno com restauro provado, primeiro admin criado,
RLS provado nos dois ramos. Detalhe: `STATE.md` + dossier `VPS.md`.

## E1 — Scaffold frontend + CI→GHCR — ✅ FECHADA 04/09/2026
Entregue: `app/` (Next.js app router, TypeScript, Tailwind v4; página de login placeholder com o
aviso proprietário no rodapé; `app/api/health`; cliente Supabase via `@supabase/ssr`, dividido em
`supabase-client.ts`/`supabase-server.ts` — `next/headers` é server-only, não cabia no mesmo
módulo do factory de browser sem quebrar o build); `Dockerfile` multi-stage (`node:24.20.0-alpine`,
output standalone, non-root, `HOSTNAME=0.0.0.0`); `.dockerignore`; workflow GitHub Actions (push
em `app/**` → build → push GHCR, `docker/metadata-action` para as tags). Dependências pinadas por
versão verificada no registo npm, não de memória. Detalhe completo: `STATE.md`.

⚠️ **CI teve dois attempts — só o #2 é válido** (o #1 correu antes do segredo
`NEXT_PUBLIC_SUPABASE_ANON_KEY` existir, imagem com a chave vazia). Confirmado pelo Pedro; na E2
apurou-se que "#1"/"#2" eram dois *re-runs* do mesmo workflow run (terminologia do GitHub), não
dois runs distintos — daí só haver um run no histórico. `STATE.md` tem o digest e a data
(`Created`) usados para confirmar que o attempt #2 (o re-run bom) é o que ficou nas tags.

**Duas melhorias identificadas nesta etapa:**
1. ✅ **Implementada na E2:** guard no início do job do CI que falha alto se
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` vier vazio.
2. **Por fazer (E5):** registar explicitamente no procedimento de rotação de segredos que rodar
   o `JWT_SECRET` invalida o `ANON_KEY` já embutido na imagem — exige **rebuild**, não só
   redeploy do container.

## E2 — Deploy do frontend + vhost — ✅ FECHADA 04/09/2026
Entregue: container `tmsi-app` (imagem pinada por digest, `172.20.40.1:3001`, `mem_limit
192m`) no compose da E0; `location /` acrescentada ao vhost, `/auth/v1/`/`/rest/v1/` confirmados
intocados; `/api/health` e `/` a responder por HTTPS; página placeholder confirmada no browser
pelo Pedro. Footprint medido antes/depois (`STATE.md`): RAM −52 MB, swap +24 MB, sem
crescimento contínuo.

⚠️ **Ajuste de âmbito ao ROADMAP, registado:** a página de login da E1 é placeholder sem lógica
— o critério de saída passou de "login real" para "app servida + `/api/health` por HTTPS". Login
real (e a prova de que o `ANON_KEY` embutido é o correcto) move-se para a E3, 1.ª iteração.

Dois problemas fora do prompt, encontrados e corrigidos nesta etapa (detalhe em `STATE.md`):
healthcheck a `localhost` falhava por resolução IPv6 antes de IPv4; o comando de backup do vhost
que o agente deu ao Pedro copiava o symlink (não o conteúdo) para dentro de `sites-enabled`,
onde o `include` do nginx (sem filtro `*.conf`) o carregava como vhost duplicado.

## E3 — Ecrãs da aplicação — EM CURSO
Iterações pela ordem do `app/README.md` (referência de ecrãs). Cada iteração: editar → push →
CI → nova imagem → deploy por digest. UI em inglês.
**Critério de saída por iteração:** o ecrã exercido com utilizadores de roles diferentes,
incluindo o ramo negado.

### i1 — Autenticação real — ✅ FECHADA 04/09/2026
Login, logout, reset de password por email, protecção de rotas via middleware. As 6 provas
comportamentais confirmadas pelo Pedro (login, ramo negado, refresh, logout+redirect, reset
completo ponta-a-ponta, `/auth/v1/`/`/rest/v1/` inalterados). Detalhe completo, incluindo três
bugs reais encontrados e corrigidos e um incidente de segredo (sessão revogada): `STATE.md`.

⚠️ **O reset de password precisou de mais do que routing correcto.** GoTrue's `flowType: pkce`
por omissão do `@supabase/ssr` guarda o `code_verifier` num cookie do browser que pediu o
reset — um link de email aberto noutro contexto (telemóvel, browser diferente) não o tem. Fix:
template de recovery próprio (servido pela nossa app, obtido pelo GoTrue via
`GOTRUE_MAILER_TEMPLATES_RECOVERY`) a usar `token_hash` + `verifyOtp`, sem estado local. Só
`RECOVERY` — `CONFIRMATION`/`INVITE`/`EMAIL_CHANGE` ficam com o template por omissão do GoTrue,
por agora aceitável (`DISABLE_SIGNUP=true`, quase não exercidos neste piloto).

### i2 — Listagem de preços por role/filial — ✅ FECHADA 04/09/2026
Rota `/prices`: escolha de vista (`v_branch_prices` vs `v_selling_prices`) decidida por RPC a
`tmsi.can_read_costs()`, não replicada em TypeScript — a segurança real continua a ser RLS +
`security definer`. Filtro por filial via query param. Dois utilizadores de teste fictícios
(`sales.sa@example.test`, `agent.apac@example.test`, domínio `.test` IANA-reservado). As 6
provas comportamentais confirmadas (3 no browser pelo Pedro, 3 via API pelo agente antes do
deploy). Detalhe completo, incluindo o achado sobre como `v_branch_prices` realmente trata
roles sem acesso a custos (linhas com `NULL`, não filas ausentes) e a correcção à lista de
"roles de custo" deste prompt (`logistics` não está em `can_read_costs()`): `STATE.md`.

### i3 — Administração de utilizadores — ✅ FECHADA 04/09/2026
Rota `/admin/users`: listar, convidar (Admin API do GoTrue), atribuir/remover role (RLS directa,
sessão do próprio admin), disable/reactivate (ban via Admin API). As 5 provas do prompt
confirmadas. Detalhe completo, incluindo o bug real encontrado e corrigido em F4 (`/auth/confirm`
consumia o token no `GET`, explorável por scanners de email corporativos) e o achado externo
(quarentena Microsoft 365/EOP para `condat.fr`, fora do nosso controlo): `STATE.md`.

⚠️ **Lição de teste, para toda a iteração futura com fluxo de email:** endereços `.test` (nunca
entregues) e Gmail pessoal (sem scanner de links) não exercitam um gateway corporativo — foi
essa lacuna que deixou o bug do `GET` acima sobreviver, sem detecção, da i1 até à i3. Sempre que
uma prova envolver um link de email a ser clicado, incluir pelo menos um destinatário real atrás
de um gateway corporativo (M365/EOP, Proofpoint, Mimecast) antes de considerar a prova fechada.

### i4 — Formulário de produto — ✅ FECHADA 04/09/2026
Ciclo de vida e o motor `compute_price` na UI: `/products`, `/products/new` (rascunho mínimo),
`/products/[id]` (detalhe, breakdown por filial, histórico de `price_versions`, `audit_log`,
edição gated por `canManageProducts()`). Status é um `<select>` livre — a 0001 não impõe grafo de
transições além do trigger de activação e do de reabertura por EXW; nenhuma máquina de estados
inventada no cliente. As 6 provas confirmadas via API (detalhe: `STATE.md`).

⚠️ **Defeito real da 0001, encontrado em F1 antes de qualquer código de UI, corrigido pela
migração `0002` (aprovada pelo Pedro, aplicada 04/09/2026):** `tmsi.record_exw_version()` não era
`security definer` — toda e qualquer escrita em `tmsi.products` falhava por RLS em
`tmsi.price_versions`, para qualquer role. `tmsi.audit()` tinha o mesmo tipo de falha por omissão
de `search_path` (apanhado na revisão do Pedro antes de aplicar). Detalhe completo: `STATE.md`,
`supabase/migrations/0002_price_versions_security_definer.sql`.

⚠️ **Reaberta no mesmo dia — achado real de teste (Pedro, browser):** `exw_price` (e
`sap_code_*`/`supplier_id`) visíveis a `sales.sa` em `/products`/`/products/[id]`. `tmsi.products`
não tem protecção nenhuma ao nível da coluna, só da linha — `compute_price()` esconde os valores
derivados do EXW, mas as páginas liam a tabela crua. Corrigido ao nível do `.select()`
(`can_read_costs()` escolhe a lista de colunas antes do pedido sair, nunca ao nível da
renderização) — provado ao nível do payload, não só do ecrã. ✅ **A candidata registada aqui foi
implementada — ver secção "Migração 0003/0004" abaixo. Fechada.**

Depois: configuração (câmbios, fees, transporte, direitos, margens), overrides + histórico/
auditoria, dashboard.

### i5 — Configuração do pricing — ✅ FECHADA 04/09/2026
`/config`: câmbios (`exchange_rates`, append-only — `fx_rate()` escolhe sempre a data efectiva
mais recente ≤ hoje, editar significa acrescentar, nunca reescrever histórico; fonte
obrigatória, já `not null` na 0001), fees interco, escalões de transporte, direitos por HS,
grelhas de margem e settings (edição no próprio sítio — a seed já cobre todas as combinações
das cinco, sem UI de criar/apagar). Acesso de leitura e escrita são as políticas RLS reais de
cada tabela (matriz extraída na F0 antes de qualquer código), espelhadas como helpers nomeados
em `auth-guard.ts` — nenhuma das seis mistura colunas seguras/sensíveis na mesma linha como
`tmsi.products` (i4), por isso RLS ao nível da linha chega, sem precisar de uma vista como a
`tmsi.v_products` da 0003. As 5 provas confirmadas via API, incluindo cálculo à mão do preço
esperado antes de cada edição, exacto em todos os casos (detalhe: `STATE.md`).

### i6 — Overrides + auditoria — ✅ FECHADA 04/09/2026
`/overrides`: criar e listar (activo/expirado/futuro) `price_overrides` (fx/fee/transport/duty/
margin/coef — cada um substitui um input do motor, nunca o resultado, sempre com motivo, autor
de sessão e validade) e `product_hs_overrides`. `/products/[id]` ganhou uma coluna "Overridden"
por filial e uma secção com os overrides do próprio produto. `/audit`: leitura global,
filtrável, só-leitura, complementando o audit por-produto já existente desde a i4. As 6 provas
confirmadas via `psql`/RLS directa, com cálculo à mão do preço/direito esperado antes de cada
teste, exacto em todos os casos (detalhe: `STATE.md`).

⚠️ **Achado real de F0, não hipotético, resolvido sem migração:** `product_hs_overrides.scope_type`
aceita `branch`/`channel`/`agent` na BD, mas `compute_price()` só lê `scope_type='branch'` — um
override de canal/agente seria aceite e pareceria válido, mas nunca teria efeito no preço.
Decisão do Pedro: a UI só oferece `branch` por agora; linhas `channel`/`agent` já existentes
nunca ficam invisíveis, aparecem marcadas "no effect". Duas perguntas de desenho ficam
registadas para quando canal/agente forem implementados — ver "Questões abertas" no fim deste
ficheiro.

⚠️ **Achado menor, também sem migração:** `price_overrides.created_by` é `uuid` nullable — a
app define-o sempre a partir da sessão, mas um pedido directo à API a contornar a app podia
criar um override sem autor. `product_hs_overrides` não tem `created_at`/`created_by`/validade
nenhuma (só o `admin` escreve, e o `audit_log` cobre a tabela). Ambos sinalizados, nenhum
corrigido nesta iteração — candidatos a migração futura, não bloqueiam nada hoje.

### i7 — Protocolo de verificação de segurança — ✅ FECHADA 04/09/2026
Iteração documental, sem deploy. `docs/VERIFICATION-PROTOCOL.md` (protocolo re-executável de
teste/auditoria/formação/demonstração à direcção): quatro camadas de segurança em uma página,
matriz de visibilidade por papel, 20 passos de teste por papel (browser + API), regras de
execução em produção, tabela de registo re-utilizável. A matriz-base do prompt foi verificada
célula a célula contra o schema real (`can_read_costs()`/`can_read_operational()`/
`products_visible()`, `see_costs`/`see_sell` do `compute_price()`, políticas RLS reais) —
**16 correcções** encontradas e feitas, nenhuma célula ficou por confirmar. Duas classes de
erro dominaram: (a) o papel `viewer` estava marcado ❌ em 7 células onde a BD real lhe dá
acesso total e sem âmbito (`can_read_costs()`/`can_read_operational()`/`see_costs`/`audit_read`
incluem `viewer` sem condição nenhuma — é um papel de supervisão total, não "só leitura
limitada"); (b) a capacidade de criar overrides tinha `product_manager` marcado ✅ (não está em
`overrides_write` nenhures) e `branch_manager`/`logistics` marcados ❌ (podem escrever, cada um
restrito a um subconjunto diferente de `kind`/filial). Detalhe completo, célula a célula:
`STATE.md`.

### i8 — Dashboard (KPIs e margens por filial) — ✅ FECHADA 05/09/2026 (reaberta e corrigida no dia seguinte) — **E3 completa**
`/dashboard`, gate `can_read_costs()` (já inclui `admin`). Cinco secções, todas lidas pelas
mesmas vistas/funções que os ecrãs já existentes usam, nenhuma query nova a contornar as
fronteiras 0003/0004: tiles de estado (`review` destacado), margem média por filial em barras
(só produtos activos), frescura dos câmbios por moeda (mesmo desempate do `fx_rate()`, 0005),
overrides activos, actividade recente do `audit_log`. Paleta categórica CVD-safe (hexes exactos
do prompt) como CSS custom properties, rótulos directos + tabela acessível por gráfico (séries
3/4 falham 3:1 no `surface` claro), paleta de estado própria (nunca reutilizada das séries) para
`review`/câmbio velho. As 5 provas confirmadas — cálculo à mão de cada tile via `psql`, ramo de
aviso traçado com o limiar temporariamente baixado (nunca dados falsos), ramo negado
(`sales.sa`/`logistics.test`) sem qualquer agregado de custo alcançável.

⚠️ **Reaberta no dia seguinte — achado do Pedro no browser:** o cartão de gráfico do dashboard
tinha `prefers-color-scheme`/`[data-theme]` ligados (implementados correctamente e confirmados
em produção — ver F3 original, `STATE.md`), mas era o **único** elemento theme-aware de toda a
app; numa máquina com o SO em modo escuro, só esse cartão mudava, o resto ficava claro —
inconsistência, não tema. **Decisão do Pedro: app light-only por agora.** Blocos dark
removidos de `.dashboard-charts` (não só desligados), com os hexes dark validados guardados em
comentário no CSS para arranque futuro. Redeploy confirmado sem nenhum `prefers-color-scheme`/
`data-theme` no bundle servido. Detalhe completo: `STATE.md`.

📌 **«Dark mode global» — melhoria futura de baixa prioridade, sem etapa atribuída.** A app é
light-only hoje, de propósito. A paleta dark dos gráficos do dashboard já está validada (esteve
em produção, confirmada correcta) — um trabalho futuro de tema escuro a sério parte dela, não
do zero.

Com a i8 fechada, **o E3 está completo**. Próximo passo é decisão do Pedro entre a E5
(operações, antes de utilizadores reais) e a E4/0006 (quando a decisão L2 fechar) — nenhuma das
duas arranca sem a primeira execução formal do `VERIFICATION-PROTOCOL.md` (ver "Gate de
produção" abaixo).

## Gate de produção
**Princípio do Pedro, registado 2026-09-04:** provas com dados fictícios validam o
**mecanismo** (a lógica de acesso está correcta), não o **ambiente** (que ninguém com acesso
legítimo consegue, na prática, ver o que não devia). Antes de qualquer utilizador real ou dado
real, e antes de qualquer apresentação à direcção: **re-execução completa do
`docs/VERIFICATION-PROTOCOL.md`, com registo assinado** (secção 7 desse documento). Repete-se a
cada migração que toque em RLS/vistas/privilégios e a cada release major. A E6 (validação do
piloto + preparação da migração para a empresa) só avança depois da primeira execução formal
deste protocolo — é o critério de entrada dessa etapa, não só uma recomendação.

✅ **Gate satisfeito para o estado actual — execução n.º 1, 2026-09-05.** Migrações 0001–0005,
digest `sha256:3775da62...`, resultado OK, os 8 papéis testados. Dois defeitos reais do
próprio protocolo corrigidos durante a execução (`/dashboard` em falta; a nota sobre
`logistics` não conseguir ler overrides de `duty` estava errada, não só desactualizada — vê
essas linhas via `overrides_write`, uma política `for all`). Desvio documentado: os testes de
email (S/T) só cobriram Gmail e Hotmail pessoais — a variante com gateway corporativo
M365/EOP, a mesma quarentena identificada na i3, continua por cobrir. Detalhe completo:
`STATE.md` e `docs/VERIFICATION-PROTOCOL.md` (secções 6/7).

## Migração 0003/0004 — protecção de custos ao nível da BD — ✅ FECHADA 04/09/2026
Fecha a pendência da i4: RLS só protegia linhas, nunca colunas — um pedido manual à API,
contornando a app, ainda lia `exw_price`/`sap_code_*`/`supplier_id`. O candidato simples do
prompt original (`REVOKE SELECT (col)`) revelou-se um no-op silencioso (privilégios de coluna
Postgres são aditivos sobre os de tabela — 0001 já concede tudo à tabela); e uma vista ingénua
para os roles de custo lerem as colunas revogadas **ignorava a RLS por completo** (dono com
`BYPASSRLS`). O desenho final: `REVOKE`/`GRANT` ao nível certo na tabela + `tmsi.v_products`
(vista com semântica de dono para o acesso a colunas, mas visibilidade de linha replicada
explicitamente via `tmsi.products_visible()`, a mesma função que a policy `products_read` passou
a chamar). Duas fronteiras nomeadas — `can_read_operational()` (custos ou `logistics`, que já lê
dados físicos noutro lado) e `can_read_costs()` (só financeiro) — não uma genérica. 0004 corrigiu
uma regressão da própria 0003 (primary_branch/sold_in tinham ficado gated, partindo o
price-by-branch para sales/agent) antes de qualquer prova ser reportada feita. As 4 provas do
prompt confirmadas, incluindo a suite completa da i4 sem regressão. Detalhe completo, incluindo
o percurso empírico de F1 (`BEGIN`/`ROLLBACK`) que descartou o candidato simples: `STATE.md`.

## Migração 0005 — correcção de câmbio no mesmo dia — ✅ FECHADA 04/09/2026
Achado real do Pedro ao usar o `/config` da i5, não hipotético: `unique(currency,
effective_date)` em `tmsi.exchange_rates` só permitia uma entrada por moeda por dia — um engano
ficava sem correcção possível até ao dia seguinte. Verificado antes de desenhar que
`tmsi.fx_rate()` é o único leitor de cálculo desta tabela. Corrigido: `unique` relaxado,
`fx_rate()` a desempatar por `created_at` entre entradas do mesmo dia. Achado de F1: o valor por
omissão de `created_at` (`now()`) fica congelado durante toda a transacção — mudado para
`clock_timestamp()`, que reflecte sempre o momento real da inserção. `/config` actualizado a
marcar entradas do mesmo dia superadas como tal, em vez de as mostrar como duplicatas
inexplicadas. Cenário exacto do Pedro reproduzido e o ramo temporal (consulta histórica
insensível a correcções de hoje) confirmados antes de fechar. Detalhe completo: `STATE.md`.

## E4 — Migração 0007 — por iniciar
A numeração avança quatro vezes: `0002` foi consumida pelo defeito real de RLS da i4,
`0003`/`0004` pela protecção de custos ao nível da BD, `0005` pela correcção de câmbio no
mesmo dia, `0006` pela gestão de passwords sem email (i9, `must_change_password` +
`tmsi.mark_password_changed()`/`tmsi.admin_revoke_sessions()` — ver `STATE.md`) — nenhuma é
a migração funcional da E4. Políticas de escrita por estado (quem aprova — questão L2 do
handover, decisão do Pedro pendente), regra dos 90 dias, notificações. Nunca editar a
0001/0002/0003/0004/0005/0006 aplicadas. Backup + restauro provado antes de aplicar.

**Inclinação registada (i5, 2026-09-04), não uma decisão:** Branch Manager como aprovador
provável — já tem RLS de leitura de custos con âmbito de filial (0001, `can_read_costs()`
inclui `branch_manager`), o candidato mais natural para aprovar mudanças de preço na sua
própria filial. Variante a considerar: «quem edita não aprova» (separação de funções — o
`finance`/`admin` que propõe uma mudança de câmbio/margem não seria quem a aprova). Continua
em aberto, decisão do Pedro antes de desenhar a 0005.

## E5 — Operações e endurecimento — EM CURSO (E5-VPS ✅ fechada 05/09/2026)

### E5-VPS — ✅ FECHADA 05/09/2026
Três frentes do lado do VPS (prompt E5-VPS), detalhe: `STATE.md`.
1. **Quarentena EOP (desvio S/T) — tentado, não fechado.** Bloqueado por falta de acesso do
   Pedro ao portal `security.microsoft.com` do tenant `@condat.fr`, não por quarentena
   persistente. Continua por cobrir; caminho seguinte (acesso ou pedido à TI) é decisão do
   Pedro, fora do âmbito de uma sessão VPS.
2. **PAT → deploy key — ✅ fechado.** `~/.git-credentials` removido; `origin` do
   `tmsiequipment` passou a SSH dedicado (`github-tmsiequipment`, deploy key **com** escrita —
   corrigido de "read-only" para "write", a sessão precisa de escrever `STATE.md`/`ROADMAP.md`
   a cada fecho, read-only não teria chegado). Provado com `git pull` + push real.
3. **Métricas TMSI no `status.json` — ✅ fechado (parcial, por desenho).** `tmsi_containers_up`/
   `tmsi_containers_total` e `tmsi_backup_age_h` expostos, prova ao vivo via túnel. Idade da
   taxa de câmbio mais recente **dispensada** — exigiria o `vps-stats.service` (hoje sem
   dependência de Postgres) ligar-se à BD, não "barato"; fica para quando fizer falta a sério.

### E5-HOMELAB — por iniciar (depende da F3 da E5-VPS, já fechada)
Off-site do backup (o dump só existe no VPS) · tile no dashboard do homelab a consumir as
chaves `tmsi_*` novas do `status.json` · métrica T8.
Pode correr em paralelo com a E3; não bloqueia nem é bloqueada por ela.

✅ **Lockfile/pinagem definitiva das imagens da app — resolvida na tarefa 3 (2026-09-05,
sessão VPS), não precisou de esperar pela E5-HOMELAB:** `generate-lockfile.yml` gera e
commita `app/package-lock.json`, Dockerfile passa a `npm ci`. Detalhe: `docs/STATE.md`.

## E6 — Validação do piloto + migração para a empresa — por iniciar
⚠️ **Gate de entrada (ver "Gate de produção" acima):** não arranca sem uma primeira execução
formal do `docs/VERIFICATION-PROTOCOL.md`, com registo assinado — as provas por dados
fictícios de cada iteração validam o mecanismo, não substituem esta execução com dados e
utilizadores reais.

Validação com utilizadores-piloto (dados sempre fictícios). Preparar: procedimento de
migração (`git clone` + novo `.env` + `pg_restore` — destino: servidor da empresa),
autorização escrita ao abrigo da licença, e o esclarecimento CPI art. L113-9 (questão do
handover §7 — do Pedro, antes de qualquer transferência).

## Questões abertas do Pedro (do handover §7 — não bloqueiam E1–E2)
Moeda dos escalões de transporte TBM (T2) · periodicidade/mecanismo das taxas SAP (C2 —
manual no piloto) · quem aprova (L2 — bloqueia E4) · titularidade CPI (bloqueia E6).

**Duas questões novas da i6 (mesma família que L2 — desenho do motor, não de infra), sem
bloquear nada hoje porque `product_hs_overrides` de canal/agente ainda não é oferecido pela UI:**
(a) ordem de precedência entre âmbitos coexistentes, se um produto tiver override de filial E de
canal/agente ao mesmo tempo, qual vence; (b) como é que o contexto de canal/agente chega ao
`compute_price()` — a assinatura actual só tem `p_product, p_branch, p_date`, sem identificador
de canal/agente nenhum.
