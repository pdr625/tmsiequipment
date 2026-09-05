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

**9. L2 — quem aprova** (inclinação: BM + «quem edita não aprova») → destrava E4/0006.
**10. Âmbitos de override canal/agente** — 2 perguntas de desenho registadas.
**11. CPI L113-9 por escrito** — pré-condição E6; condiciona a via TI (7).
**12. Questões do handover §7**: moeda escalões TBM (T2) · taxas SAP (C2, manual no piloto).
**13. Terceira perna do backup** (hoje 2 cópias/2 máquinas; liga a D-C/D-D do parque).
**14. Paginação/pesquisa nas listagens** — **medido 2026-09-05** (fixture descartável de 150
produtos, resíduo zero): `/products` 148ms→717ms (13→163 artigos), `/prices` 159ms→909ms (33→333
linhas), crescimento real e substancial, não uma suposição. Causa raiz não é só "falta
`LIMIT`" — `v_products`/`v_branch_prices` avaliam `products_visible()`/`compute_price()` por
linha antes de poder limitar, dado a forma actual da vista; um `LIMIT` simples reduz o que o
Next.js renderiza mas não o custo do lado da BD. Decisão de desenho pendente (prioridade/
timing/âmbito da correcção — mais do que UI, pode pedir repensar a vista), tua. Detalhe
completo: `docs/STATE.md`.
**~~15. Ensaio de restauro completo~~** — ✅ **FEITO 2026-09-06**, execução n.º 1 no homelab.
**RTO medido 13 min 21 s** (camada de dados + API); RPO observado em horas. Os dados sobrevivem
e voltam a servir com segredos novos — 38 POLICY, RLS e a fronteira de custos 0003/0004 todas
intactas. O que **não** sobreviveu foi o procedimento: o restauro documentado produz uma BD
meio-restaurada em silêncio, e a imagem não se consegue reapontar. Relatório completo, com o
procedimento correcto provado: `docs/DISASTER-DRILL.md`. Sequelas → itens 21, 22 e 23.

**21. Kit de desastre** — as lacunas de *documentação e portabilidade* achadas no ensaio
(`docs/DISASTER-DRILL.md`, achados 5–8), agrupadas por serem todas a mesma coisa: os dados
sobrevivem, o kit à volta deles não. Âmbito:
1. **Reescrever o `DEPLOY.md` contra a produção real** — nginx no host (sem Kong, sem NPM),
   deploy em `~/atelier-vps/tmsiequipment`, imagens por digest do GHCR — incluindo o
   **procedimento de restauro correcto provado no ensaio** (`pg_restore -U supabase_admin`,
   **sem** `--no-owner`) e o **passo de rebuild** do achado 3, enquanto a correcção do item 22
   não existir.
2. **Completar o `.env.example`** com TODOS os nomes de variáveis que a produção usa — só nomes
   e comentários, **nunca valores**.
3. **Versionar o vhost nginx** em `deploy/nginx/`, com nota de que a cópia operante é a do VPS.
4. **Tornar o `smoke.py` portável:** `BASE` e a localização do ficheiro de credenciais por
   variáveis de ambiente, com os valores actuais como default — continua igual em produção e
   passa a poder correr num drill.
5. **Escrow de segredos** — hoje o `.env` do VPS não existe em mais lado nenhum, e sem ele um
   desastre real obriga a reconstruir segredos à mão antes de o restauro sequer começar.
   Proposta **a desenhar neste item, não a executar**: cópia cifrada (`age` ou gpg simétrico,
   passphrase só do Pedro, **nunca em ficheiro**) incluída no fluxo do backup off-site para o
   homelab. **Decisão pendente do Pedro.**

**22. Desprender a imagem do hostname** (achado 3 do ensaio). O URL do Supabase e a anon key
estão compilados no build via `NEXT_PUBLIC_*`, sem override em runtime — restaurar noutro
hostname exige refazer a imagem por CI. Barato de corrigir: a app usa o URL **só do lado do
servidor** (confirmado — não está no bundle do cliente), portanto basta lê-lo de env de runtime.
Fecha a classe toda: a mesma imagem passa a servir qualquer hostname.

**23. Tornar o pacote GHCR privado** (achado 4; **decidido pelo Pedro 2026-09-06**). Hoje
`ghcr.io/pdr625/tmsiequipment/tmsi-app` é descarregável **sem credencial nenhuma**, apesar de o
repo ser privado e a licença proprietária. Exige permissões de `packages` na conta — não
executável pelas sessões actuais.
⚠️ **Antes ou imediatamente depois de virar a visibilidade:** confirmar que o VPS consegue
autenticar-se no GHCR, senão o próximo `docker compose pull` da app parte. Sequela obrigatória:
a recuperação passa a precisar de um token `read:packages` que **exista fora do VPS** — senão o
desastre leva-o também. Liga ao ponto 5 do item 21 (escrow).

## ⚪ Baixas — registadas, sem urgência

**16.** Dark mode global (paleta dark já validada).
**17.** `rrsync` na chave homelab→VPS (endurecimento).
**18.** Métrica idade-FX no vps-stats (quando houver via limpa sem dependência Postgres).
**19.** Varredura ~/.ssh dos dois hosts (item 13 do dossier — parque, não só TMSI).
**20.** Swap do VPS — vigilância contínua (T8/tiles já o fazem; só agir se a tendência
mudar de regime).

---

## Ordem de sessões proposta
i9 (passwords) → i10 (export) → técnica (smoke+lockfile) → auth/headers → code review →
piloto (8) → L2/E4 informada pelo uso → restantes por procura.
Cada sessão fecha com STATE/ROADMAP/dossier como habitual; a i9 arrasta a actualização do
protocolo e a re-execução parcial.
