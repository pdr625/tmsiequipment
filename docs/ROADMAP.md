# TMSI Equipment Price Listing — ROADMAP
Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

Folha de rota do projecto. **Regras de manutenção:** este ficheiro é enviado ao Claude Code
no início de cada etapa; a sessão que fechar (ou alterar o âmbito de) uma etapa actualiza-o
no mesmo passe (estado + data + desvios), commit + push — tal como o `STATE.md`.
Divisão de papéis dos documentos: `ROADMAP.md` = ordem e critérios das etapas ·
`STATE.md` = estado corrente de runtime · `handover.md` = histórico (não seguir).

## Estado das etapas

| Etapa | Título | Estado |
|---|---|---|
| E0 | Infra backend (Supabase magro + schema + proxy + SMTP + backup) | ✅ 03/09/2026 |
| E1 | Scaffold frontend Next.js + CI→GHCR | ✅ 04/09/2026 |
| E2 | Deploy do frontend no VPS + vhost | ✅ 04/09/2026 |
| E3 | Ecrãs da aplicação, por iterações — i1 auth real ✅, i2 preços ⏳ | em curso |
| E4 | Migração 0002 (workflow de aprovação, regra 90 dias, notificações) | por iniciar |
| E5 | Operações e endurecimento | por iniciar |
| E6 | Validação do piloto + preparação da migração para a empresa | por iniciar |

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

### i2 — Listagem de preços por role/filial — ⏳ PRÓXIMA
`v_selling_prices` (sales/agent) vs `v_branch_prices` (roles de custo); filtros por filial,
categoria, estado, moeda (`app/README.md` ecrã 2). Critério de saída: ecrã exercido com
utilizadores de roles diferentes, incluindo o ramo negado (RLS a bloquear o que não devia ver).

### i3+ — Administração de utilizadores, formulário de produto, configuração, overrides,
dashboard — por iniciar, pela ordem do `app/README.md`.

## E4 — Migração 0002 — por iniciar
Políticas de escrita por estado (quem aprova — questão L2 do handover, decisão do Pedro
pendente), regra dos 90 dias, notificações. Nunca editar a 0001 aplicada. Backup + restauro
provado antes de aplicar.

## E5 — Operações e endurecimento — por iniciar
Pendências herdadas da E0, por ordem: off-site do backup (o dump só existe no VPS) ·
deploy key read-only a substituir o PAT de `~/.git-credentials` · tile no dashboard/
status.json + métrica T8 · decisão sobre lockfile/pinagem definitiva das imagens da app.
Pode correr em paralelo com a E3; não bloqueia nem é bloqueada por ela.

## E6 — Validação do piloto + migração para a empresa — por iniciar
Validação com utilizadores-piloto (dados sempre fictícios). Preparar: procedimento de
migração (`git clone` + novo `.env` + `pg_restore` — destino: servidor da empresa),
autorização escrita ao abrigo da licença, e o esclarecimento CPI art. L113-9 (questão do
handover §7 — do Pedro, antes de qualquer transferência).

## Questões abertas do Pedro (do handover §7 — não bloqueiam E1–E2)
Moeda dos escalões de transporte TBM (T2) · periodicidade/mecanismo das taxas SAP (C2 —
manual no piloto) · quem aprova (L2 — bloqueia E4) · titularidade CPI (bloqueia E6).
