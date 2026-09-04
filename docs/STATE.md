# STATE.md — TMSI Equipment Price Listing (infra)

Documento vivo do estado real da infra deste projecto. Sem segredos — só *onde* eles vivem.
Actualizado por toda a sessão que altere o estado do TMSI (ver secção 6).

**Etapa actual: E1 — scaffold frontend + CI→GHCR, em curso (2026-09-04).** Ordem e critérios
de saída de cada etapa: `docs/ROADMAP.md`. E0 (infra backend, este ficheiro na íntegra abaixo)
está fechada.

## E1 — Scaffold frontend + CI→GHCR (2026-09-04)

**Não fechada.** Critério de saída = CI verde + imagem no GHCR, confirmado pelo Pedro (passo
manual, secção 6 do prompt). Todo o trabalho desta etapa foi escrita de ficheiros + git — **nenhum
comando `npm`/`npx`/`node` correu no VPS**, confirmado.

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

**CI por confirmar pelo Pedro:** GitHub → Actions (workflow verde?) e Packages (imagem
`tmsi-app` visível?). Sem alteração de estado do VPS nesta etapa (containers/nginx/postfix
intocados) → **sem delta no dossier**.

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
