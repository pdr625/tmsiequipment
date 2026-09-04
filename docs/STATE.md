# STATE.md — TMSI Equipment Price Listing (infra)

Documento vivo do estado real da infra deste projecto. Sem segredos — só *onde* eles vivem.
Actualizado por toda a sessão que altere o estado do TMSI (ver secção 6).

**Etapa actual: E3, iteração 4 (formulário de produto), a começar.** Ordem e critérios de saída
de cada etapa: `docs/ROADMAP.md`. E0, E1, E2, E3-i1, E3-i2 e E3-i3 estão fechadas.

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
