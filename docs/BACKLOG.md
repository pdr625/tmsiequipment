# TMSI — Backlog completo (tudo o que precisa de atenção)
**Data:** 2026-09-05 · Incorpora as decisões do Pedro de hoje: gestão de passwords sem email
(i9), export Excel/PDF promovido a essencial (i10), testes e revisão mantidos com fundamento.
Substitui a lista da análise de 05/09 como referência de trabalho; o ROADMAP do repo deve
absorver isto na próxima sessão.

## Decisões do Pedro incorporadas
- Admin pode forçar reset de password: manual OU temporária gerada única (nunca uma
  "default" fixa igual para todos), mostrada uma vez, com troca obrigatória no próximo login.
- Utilizador autenticado pode mudar a própria password sem link de email.
- Consequência: **EOP despromovido de bloqueio a melhoria** — o onboarding do piloto passa a
  password temporária comunicada verbalmente; o email fica útil, não indispensável.
- Export Excel/PDF: essencial, não opcional.

---

## 🔴 Críticas — a fila de execução imediata

**1. i9 — Gestão de passwords sem email** *(sessão VPS; desbloqueia o piloto)*
(a) Em `/admin/users`: acção "Reset password" — admin escolhe manual ou gerada
(única, forte, mostrada uma só vez, nunca guardada em claro fora do GoTrue); via Admin API
(`updateUserById`), atrás do gate `has_role('admin')` como na i3.
(b) Flag "must_change_password" em `tmsi.profiles` (migração pequena — toma a numeração
seguinte livre); middleware bloqueia tudo excepto a página de troca até a troca acontecer.
(c) Página "Change password" para o próprio utilizador autenticado — **com verificação da
password actual no servidor** (re-login server-side antes do update; o updateUser sozinho
não a exige).
(d) Tudo vai ao audit_log (reset pelo admin regista admin como actor; troca própria regista
o próprio). Ramos negados: não-admin a chamar o reset → recusado; utilizador com flag activa
a tentar navegar → bloqueado.
(e) **O VERIFICATION-PROTOCOL ganha os testes destes fluxos no mesmo passe** (a matriz e a
secção 4 mudam) + re-execução parcial dos blocos afectados.

~~**2. i10 — Export Excel + PDF das listagens** *(sessão VPS)*~~ ✅ **fechada 2026-09-05**
(dados/RLS confirmados pelo agente na BD; provas de ecrã confirmadas pelo Pedro, incluindo o
`unzip`/`grep` ao `.xlsx` do `sales.sa` — zero ocorrências de custos. Detalhe: `docs/STATE.md`.)
Por papel: cada utilizador exporta exactamente o que vê (as fronteiras 0003/0004 aplicam-se
ao ficheiro — um export de sales não contém custos, provado ao nível do conteúdo do
ficheiro, não do ecrã). Excel (.xlsx) das listagens de preços e produtos; PDF orientado a
impressão da lista de preços por filial/canal. Cabeçalho com data, filial/canal, moeda;
rodapé proprietário. Geração server-side (a chave e os dados nunca passam por serviços
externos). Prova: abrir o .xlsx real e conferir colunas por papel + cálculo à mão de uma
linha.

~~**3. Sessão técnica — smoke tests + lockfile** *(sessão VPS)*~~ ✅ **fechada 2026-09-05**
(`scripts/smoke.py`, 27/27 asserções, blocos G–J/O–R automatizados; `generate-lockfile.yml`
+ Dockerfile a `npm ci` — ciclo completo já corrido uma vez: push → CI → deploy por digest
→ smoke ✅. Detalhe: `docs/STATE.md`.)

~~**4. Revisão da configuração de auth + headers** *(sessão VPS, meio-dia)*~~ ✅ **fechada
2026-09-05** (a lacuna do `PUT /auth/v1/user` fechada na raiz via
`GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`; política de password mínimo
12/4 classes; rate limit novo em `/auth/v1/token` — GoTrue não tinha nenhum; os quatro
headers do vhost. Provas ao vivo: brute-force controlado, password fraca recusada,
`current_password` em falta/errada recusada. Detalhe: `docs/STATE.md`.)

## 🟠 Altas — logo a seguir

~~**5. Code review read-only da app**~~ ✅ **fechada 2026-09-05** (9 achados triados, sem
reescrita nenhuma — 2 relevantes para segurança, o resto correção/manutenibilidade; segredos
em logs voltou limpo. Detalhe: `docs/STATE.md`.)
~~**6. Limpeza da sinalização órfã no `VPS.md`**~~ ✅ **fechada 2026-09-05, na i9** (F0
dessa sessão — o espelho 1.14 já estava feito pela E5-HOMELAB, sinalização removida).
**7. EOP / entregabilidade de email** *(decisão tua, sem pressa desde a i9)* — continua
útil para recovery self-service; via TI a ponderar junto com o CPI.
**8. Piloto com 2–3 colegas** *(ADIADO pelo Pedro, 2026-09-05 — decisão dele, não bloqueio
técnico)* — onboarding por password temporária; recolha de feedback que informa a L2 e a
i11+. Lado técnico pronto e testado ao vivo 2026-09-05 (achado real corrigido antes do guião
— reset de admin não confirmava email de convite fresco, `docs/STATE.md`); guião
passo-a-passo em `docs/PILOT-ONBOARDING.md`, pronto a usar quando o Pedro decidir avançar.
**Decisão registada:** manter só utilizadores fictícios (`.test`) até ao deployment final —
não convidar colegas reais antes disso.
~~**21. Tarefa 6 — Correcção dos 9 achados do code review**~~ ✅ **fechada 2026-09-05** (2
achados de segurança + 3 de correcção funcional + 4 de manutenibilidade, todos fechados só em
`app/src`, zero migração/infra/GoTrue/compose além do digest do deploy; `smoke.py` 27/27 duas
vezes. Detalhe, mapa achado→commit→prova: `docs/STATE.md`.)
~~**22. `forgot-password/actions.ts` — mesmo padrão de `Host` não validado do achado #1 da
tarefa 6**~~ ✅ **fechada 2026-09-05, tarefa 7** (medido ao vivo antes de corrigir: a
exposição real já estava mitigada pela allowlist do próprio GoTrue — `SITE_URL`/
`URI_ALLOW_LIST`, confirmado contra a fonte v2.189.0; corrigido na mesma, por
defesa-em-profundidade. Detalhe: `docs/STATE.md`.)
~~**23. `compute_price()`'s `errors[]` nunca chega ao ecrã**~~ ✅ **fechada 2026-09-05,
tarefa 7** (inventário das 5 condições soft, array já vinha em todas as respostas do RPC —
gap era só de tipo/apresentação; célula "Alert" mostra agora a lista de erros. Provado com
fixture descartável, resíduo zero. Detalhe: `docs/STATE.md`.)

## 🟡 Médias — decisões tuas e melhorias com contexto

~~**18. Alerta idade-FX**~~ ✅ **fechada 2026-09-06** — métrica publicada em `status.json`
(`tmsi_fx_ages_days` por moeda + `tmsi_fx_max_age_days` agregado), via novo endpoint interno
`/api/fx-age` atrás de um bearer token próprio (nenhuma credencial de BD nova no
`vps-stats`, hardening intocado). Limiar/alerta/tile ficam no homelab — pendência registada
no canal D-PEND (`VPS.md`, «Pendência TMSI item 18»), com um limiar proposto (7/14 dias)
para o Pedro validar lá. Detalhe completo: `docs/STATE.md`.
~~**9. L2 — quem aprova**~~ ✅ **decidida E implementada 2026-09-06** — Branch Manager da
filial afectada ou um admin, um aprovador basta; «quem edita não aprova» **não se aplica**
(admin pode aprovar as próprias modificações — decisão consciente da fase piloto, limitação
conhecida a revisitar com mais utilizadores reais). Implementação: **E4** (migração 0007),
fechada nesta sessão — `tmsi.price_proposals`/`tmsi.decide_price_proposal()`, ecrã
`/proposals`, `docs/ROADMAP.md`/`docs/VERIFICATION-PROTOCOL.md` (passos EE-JJ) actualizados.
Detalhe completo: `docs/STATE.md`.
**10. Âmbitos de override canal/agente** — 2 perguntas de desenho registadas.
**11. CPI L113-9 por escrito** — pré-condição E6; condiciona a via TI (7).
**12. Questões do handover §7**: moeda escalões TBM (T2) · taxas SAP (C2, manual no piloto).
**13. Terceira perna do backup** — **SUSPENSO, decisão do Pedro 2026-09-06** (hoje 2
cópias/2 máquinas; liga a D-C/D-D do parque — sem prazo, sem próxima acção definida).
~~**14. Paginação/pesquisa nas listagens**~~ ✅ **fechado 2026-09-06.** A medição de 06/09
do item 26 (3,50–7,25 s a 70 artigos) era mesmo INVÁLIDA (confundida pela própria sessão de
agente a medir, ~48% da RAM do VPS). Uma medição destacada (sem sessão de agente pesada,
`systemd-run --user --on-active` + `loginctl enable-linger`, depois revertido) confirmou:
**H1 (regressão da 0007) refutada, H2 (pressão de memória do host) confirmada — e resolvida**
ao nível da BD. Números finais, `v_products`: 13→19,0ms, 70→**99,5ms**, 163→254,9ms — escala
linear, melhor até que a referência pré-0007 de 05/09 (148/717ms). As propostas 3-5
(afinar Postgres, redesenhar `v_products`, paginação real) não se reabrem — foram desenhadas
para um sintoma que deixou de existir. Achado novo, não coberto por essas propostas: o custo
HTTP/PostgREST de `v_products` (não a BD) continua a escalar mal (0,845s→2,945s→6,984s) —
registado em separado como item **28**. Detalhe completo das quatro medições: `docs/STATE.md`.
~~**26. White-label + branding dos documentos**~~ ✅ **fechada 2026-09-06 (opção B).**
Migração 0008 (`tmsi.branding`/`tmsi.branding_logos`, append-only, admin-only, fora do
workflow de aprovação da 0007 — é apresentação, não preço); nova página `/config/branding`
(nome, tagline, logo PNG/JPEG, cor, tipografia, rodapé, texto legal — placeholders neutros
por omissão, sem nenhum nome de cliente); aplicado ao título da app, aos dois exports
`.xlsx` (incl. logo embutido) e à vista de impressão. Corrigido um vazamento real de
licença: o rodapé de ambos os documentos embutia `NOTICE_TEXT` (cópia do `/NOTICE` do
repositório — "Copyright... PROPRIETARY AND CONFIDENTIAL"), exactamente o que a regra da
licença proíbe — removido dos dois, `PROPRIETARY_NOTICE` (o rodapé do login) fica a única
menção, sempre dentro da app. Grep de varrimento confirma zero literais "TMSI"/"Condat" em
`app/src` fora do bloco de copyright (mantido deliberadamente, mesma categoria do
repo/imagem/domínio que a opção B já mantém). Renome de repo/imagem/domínio fica
explicitamente para a E6 (decisão do Pedro, 06/09), registado aqui para não ser esquecido.
Prova de ficheiro real (`.xlsx`/impressão) fica para o Pedro — mesma limitação já conhecida
desde a i10 (sessão por cookie, não replicável por `curl`). Detalhe completo:
`docs/STATE.md`.
**~~15. Ensaio de restauro completo~~** — ✅ **FEITO 2026-09-06**, execução n.º 1 no homelab.
**RTO medido 13 min 21 s** (camada de dados + API); RPO observado em horas. Os dados sobrevivem
e voltam a servir com segredos novos — 38 POLICY, RLS e a fronteira de custos 0003/0004 todas
intactas. O que **não** sobreviveu foi o procedimento: o restauro documentado produz uma BD
meio-restaurada em silêncio, e a imagem não se consegue reapontar. Relatório completo, com o
procedimento correcto provado: `docs/DISASTER-DRILL.md`. Sequelas → itens 21, 22 e 23.

~~**21. Kit de desastre**~~ ✅ **fechada 2026-09-06** — as 6 frentes (`docs/DISASTER-DRILL.md`
achados 5–8 + GHCR + escrow), todas provadas: `DEPLOY.md` reescrito contra a produção real,
incl. o procedimento de restauro provado no ensaio e o passo de rebuild do achado 3;
`deploy/supabase/.env.example` completo (25 nomes reais, raiz `.env.example` corrigido para
apontar lá); `deploy/nginx/tmsiequipment.conf` versionado, diff zero contra o real; GHCR
autenticado com ordem rígida provada (→ item 23, já fechado); `smoke.py` portável
(`TMSI_BASE_URL`/`TMSI_CREDENTIALS_DIR`), 27/27 provado nos dois modos; escrow cifrado
(`gpg -c`, `age` não instalado) com prova de decifração do Pedro. Detalhe completo, todos os
desvios/incidentes registados honestamente: `docs/STATE.md`.

~~**25. `smoke.py`'s bloco R é sensível à fronteira UTC/hora local**~~ ✅ **fechada
2026-09-06** — `db_today()` novo pergunta ao próprio Postgres (`select current_date`) em vez
de usar `date.today()` do Python; as duas comparações reais (blocos I e R) passam a usar essa
autoridade única. Provado: mecanismo de dependência do fuso confirmado ao vivo (`TZ=UTC` vs
`TZ=Etc/GMT+12` dão datas diferentes agora), `smoke.py` corrigido dá 27/27 sob os dois
extremos. Detalhe: `docs/STATE.md`.

~~**22. Desprender a imagem do hostname**~~ ✅ **fechada 2026-09-06** (achado 3 do ensaio).
`SUPABASE_URL`/`SUPABASE_ANON_KEY` passam a env de runtime, reaproveitando `SITE_URL`/
`ANON_KEY` já existentes — zero chave nova no `.env`. Confirmado por grep contra a imagem
nova: zero ocorrências do hostname e de qualquer JWT nos chunks. **Achado lateral real
durante a prova:** o fail-fast desenhado com `instrumentation.ts`/`register()` do Next.js não
funcionava — provado ao vivo três vezes que nem `process.kill(process.pid, 'SIGKILL')`
chamado de dentro da app derruba o processo real (fica um zombie a recusar ligações para
sempre); substituído por um guard `sh -c` no `CMD` do `Dockerfile`, que funciona (exit 1
imediato, confirmado ao vivo). Fecha a classe toda: a mesma imagem serve qualquer hostname, e
rodar `JWT_SECRET`/`ANON_KEY` (item 24) deixa de exigir rebuild. Detalhe: `docs/STATE.md`.

~~**23. Tornar o pacote GHCR privado**~~ ✅ **fechada 2026-09-06** (achado 4; item 21 F1).
Ordem rígida provada: login autenticado com o pacote ainda público (`tmsi-app` **e**
`itinera`, mesma entrada partilhada `~/.docker/config.json`) → pacote tornado privado pelo
Pedro → re-prova dos dois → ramo de falha (`unauthorized` sem credencial) → credencial
restaurada, re-provado. Novo PAT `read:packages` (classic), criado pelo Pedro, introduzido
só por ficheiro 600 descartado logo a seguir ao login — avança a rotação pendente do
`CREDENTIALS-INVENTORY.md` (KI #9) do lado do pull. Detalhe: `docs/STATE.md`.

~~**24. 4 segredos de produção ecoados no output do agente — rotação**~~ ✅ **fechada
2026-09-06** (incidente de 2026-09-06, item 21). `POSTGRES_PASSWORD`, `JWT_SECRET`,
`ANON_KEY`, `SERVICE_ROLE_KEY` rodados, todos os quatro. Ordem provada: `ALTER ROLE` (3
roles: `postgres`, `supabase_auth_admin`, `authenticator`) → `.env` → restart
`auth`→`rest`→`tmsi-app` (`supabase-db` nunca reiniciou). **Prova pelo ramo que interessa:**
os quatro valores antigos confirmados mortos (`ANON_KEY`/`SERVICE_ROLE_KEY` → 401/403; um JWT
de sessão genérico assinado com o `JWT_SECRET` antigo → `PGRST301`); `smoke.py` 27/27 com os
valores novos, confirmando que as passwords `.test` sobreviveram (hashes bcrypt
independentes do `JWT_SECRET`, como o ensaio de desastre já tinha provado). Escrow re-cifrado
com os valores novos, decifração provada pelo Pedro, escrow antigo destruído (`shred`).
Nenhum segredo em output nesta sessão. Detalhe completo: `docs/STATE.md`.
`CREDENTIALS-INVENTORY.md` 5.8 do dossier precisa de passar de ⚠️ EXPOSTOS a ✅ rodado — fora
do que esta sessão VPS escreve directamente, nota já deixada em `VPS.md` §Pendências a
migrar.

**28. Custo HTTP/PostgREST de `v_products` a volume** — achado da medição destacada do item
14 (2026-09-06), separado por ter um mecanismo diferente: com a BD já rápida e linear
(99,5ms a 70 produtos), o mesmo pedido via PostgREST (`/rest/v1/v_products`, bearer token)
continua a escalar mal — 0,845s→2,945s→6,984s (13→70→163), 27-44× acima do tempo de SQL
puro no mesmo ponto. `v_branch_prices`, pela mesma via, acompanha bem (0,159s→0,305s→0,881s,
8-3×). Única diferença estrutural: `v_products` devolve ~32 colunas, `v_branch_prices`
~8-10; o contentor `supabase-rest` tem `mem_limit: 128m` (mais apertado que a app, 192MB) —
hipótese não verificada: serialização JSON de um resultado largo dentro desse limite.
**Nada medido ainda ao nível de causa** (falta `docker stats supabase-rest` durante a
série, ou uma vista mais estreita para comparar). Detalhe completo: `docs/STATE.md`, secção
"Item 14 — Medição destacada".

## ⚪ Baixas — registadas, sem urgência

**16.** Dark mode global (paleta dark já validada).
**17.** `rrsync` na chave homelab→VPS (endurecimento).
**19.** Varredura ~/.ssh dos dois hosts (item 13 do dossier — parque, não só TMSI).
**20.** Swap do VPS — vigilância contínua (T8/tiles já o fazem; só agir se a tendência
mudar de regime).
**27. Regra de validade de 90 dias + notificações** — parte do texto original da E4 no
`docs/ROADMAP.md` ("workflow de aprovação, regra 90 dias, notificações"), nunca parte do
âmbito real desta sessão (o prompt do Pedro para a E4 pediu só o workflow de aprovação,
migração 0007 — fechado). Registada aqui para não se perder, sem desenho nenhum feito ainda:
o que expira aos 90 dias (uma proposta pendente? um override sem `valid_to`? uma taxa de
câmbio antiga?) e o mecanismo de notificação (email? um ecrã de alertas?) são ambos decisões
do Pedro, por tomar numa sessão própria.

---

## Ordem de sessões proposta
i9 (passwords) → i10 (export) → técnica (smoke+lockfile) → auth/headers → code review →
piloto (8) → L2/E4 informada pelo uso → restantes por procura.
Cada sessão fecha com STATE/ROADMAP/dossier como habitual; a i9 arrasta a actualização do
protocolo e a re-execução parcial.
