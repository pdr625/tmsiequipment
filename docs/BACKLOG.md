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

**5. Code review read-only da app** *(sessão VPS; relatório de achados triados, sem
reescrita)* — caminhos de erro, segredos em logs, código morto, manutenibilidade; também
prepara a entrega E6.
~~**6. Limpeza da sinalização órfã no `VPS.md`**~~ ✅ **fechada 2026-09-05, na i9** (F0
dessa sessão — o espelho 1.14 já estava feito pela E5-HOMELAB, sinalização removida).
**7. EOP / entregabilidade de email** *(decisão tua, sem pressa desde a i9)* — continua
útil para recovery self-service; via TI a ponderar junto com o CPI.
**8. Piloto com 2–3 colegas** *(depois de 1–4)* — onboarding por password temporária;
recolha de feedback que informa a L2 e a i11+.

## 🟡 Médias — decisões tuas e melhorias com contexto

**9. L2 — quem aprova** (inclinação: BM + «quem edita não aprova») → destrava E4/0006.
**10. Âmbitos de override canal/agente** — 2 perguntas de desenho registadas.
**11. CPI L113-9 por escrito** — pré-condição E6; condiciona a via TI (7).
**12. Questões do handover §7**: moeda escalões TBM (T2) · taxas SAP (C2, manual no piloto).
**13. Terceira perna do backup** (hoje 2 cópias/2 máquinas; liga a D-C/D-D do parque).
**14. Paginação/pesquisa nas listagens** — quando o catálogo real chegar (nunca testado
acima de 13 artigos; medir com dados de volume fictícios antes do piloto alargar).
**15. Ensaio de restauro completo** (dump → ambiente limpo → app funcional) — o ensaio
geral da E6; agendar antes da migração para a empresa.

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
