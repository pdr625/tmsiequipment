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
| E2 | Deploy do frontend no VPS + prova fim-a-fim no browser | ⏳ próxima |
| E3 | Ecrãs da aplicação, por iterações | por iniciar |
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
`NEXT_PUBLIC_SUPABASE_ANON_KEY` existir, imagem com a chave vazia). Confirmado pelo Pedro. Ver
`STATE.md` para o porquê de as tags em GHCR já apontarem só para o #2, e a recomendação de a E2
confirmar explicitamente antes do primeiro deploy.

**Duas melhorias identificadas nesta etapa, para aplicar na E2** (não implementadas em E1):
1. Guard no início do job do CI que falha alto se `NEXT_PUBLIC_SUPABASE_ANON_KEY` vier vazio —
   evita repetir silenciosamente o erro do attempt #1 como "CI verde".
2. Registar explicitamente no procedimento de rotação de segredos (E5): rodar o `JWT_SECRET`
   invalida o `ANON_KEY` já embutido na imagem — exige **rebuild**, não só redeploy do container.

## E2 — Deploy do frontend + prova fim-a-fim — ⏳ PRÓXIMA
**Onde:** VPS. **Pré-condição:** E1 fechada (imagem no GHCR, pinada por digest) — ✅, mas
confirmar que o digest usado é o do attempt #2 antes de deployar (ver nota acima).
Serviço `tmsi-app` no compose (rede `tmsi_net`, `mem_limit` a definir após medição);
**bind `172.20.40.1:3001`** — a porta 3000 desse gateway já é do `rest`; `location /` no
vhost → `http://172.20.40.1:3001`. Medir RAM/swap antes e depois (pendência registada:
swap ~800 MB com a stack E0).
**Critério de saída:** login real no browser com o admin criado na E0, sessão persistente,
dados do seed visíveis conforme o role — prova comportamental, nunca só HTTP 200.

## E3 — Ecrãs da aplicação — por iniciar
Iterações pela ordem do `app/README.md` (referência de ecrãs). Cada iteração: editar → push →
CI → nova imagem → deploy por digest. Primeiras: autenticação completa (logout, reset por
email — SMTP já provado), listagem de preços por role/filial (`v_selling_prices` vs
`v_branch_prices`), administração de utilizadores (admin API). UI em inglês.
**Critério de saída por iteração:** o ecrã exercido com utilizadores de roles diferentes,
incluindo o ramo negado.

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
