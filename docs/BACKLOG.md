# TMSI — Backlog completo (tudo o que precisa de atenção)
**Data:** 2026-09-05 · Incorpora as decisões do Pedro de hoje: gestão de passwords sem email
(i9), export Excel/PDF promovido a essencial (i10), testes e revisão mantidos com fundamento.
Substitui a lista da análise de 05/09 como referência de trabalho; o ROADMAP do repo deve
absorver isto na próxima sessão.

**Varredura 2026-09-15** (pedido do Pedro, "faz a varredura ao ficheiro inteiro"): todo o
ficheiro revisto item a item contra o schema/código real, não contra a memória de sessões
anteriores. Achado principal: o item 1 estava 100% implementado desde a migração 0006 mas
nunca tinha sido marcado `~~fechado~~` — corrigido. Item 10 revisto e clarificado (parcial,
por um caminho diferente do que as duas perguntas originais previam). Todos os outros itens
ainda sem `~~risco~~` foram confirmados como genuinamente em aberto (a maioria são decisões
do Pedro ou itens de infra fora do âmbito desta app, não trabalho técnico por fazer).

**Reconciliação 2026-09-15 (mesmo dia, segunda passagem):** seis itens acordados a 06/09 e
09–10/09 que nunca tinham entrado neste ficheiro, acrescentados como **38-43** (secção "Caminho
para os dados reais"). Achado de processo: a migração 0012 (margem interco no artigo + ecrã
`/branches`, aplicada e implantada 2026-09-10/14) é a única, de 0001 a 0012, sem adenda em
`docs/VERIFICATION-PROTOCOL.md` §7 — está documentada em `docs/STATE.md` e no dossier, mas não
no registo formal de verificação que todas as outras migrações têm (agora item 41). Os números
**21, 22 e 23**, cada um usado duas vezes no documento original, foram desambiguados — o
conjunto de 06/09 ganhou números novos (**35, 36, 37**), nota de correspondência no fim do
ficheiro.

**Item 38, 2026-09-15/16:** paridade motor vs Excel corrida por completo — **fechado, a
fórmula do motor bate 100%**, zero linhas por explicar. Detalhe: `docs/ENGINE-PARITY.md`.
Rendeu um número medido para o item 39 (163 entradas de configuração para 13 artigos,
12,5/artigo) e um item novo, **44** (aprovação em lote para configuração global, achado de
desenho, não resolvido).

## Decisões do Pedro incorporadas
- Admin pode forçar reset de password: manual OU temporária gerada única (nunca uma
  "default" fixa igual para todos), mostrada uma vez, com troca obrigatória no próximo login.
- Utilizador autenticado pode mudar a própria password sem link de email.
- Consequência: **EOP despromovido de bloqueio a melhoria** — o onboarding do piloto passa a
  password temporária comunicada verbalmente; o email fica útil, não indispensável.
- Export Excel/PDF: essencial, não opcional.

---

## 🆕 Caminho para os dados reais — itens novos, reconciliação 2026-09-15

Seis itens acordados com o Pedro a 06/09 e 09–10/09 que nunca tinham entrado neste ficheiro —
achado da reconciliação pedida pelo Pedro ("os passos acordados a 06/09 nunca lá entraram").
Numerados a seguir ao último existente (34) e aos três renumerados abaixo (35–37).

~~**38. Paridade motor vs Excel**~~ ✅ **fechado 2026-09-15/16 — a fórmula do motor bate
100% com o Excel.** Corrida formal completa: 65 linhas (13 artigos × 5 âmbitos), 62
comparáveis, **zero linhas por explicar** — 22 exactas, 28 explicadas pelo desvio de câmbio
já sinalizado (agora quantificado: −0,05% CNY→EUR, −0,20% CNY→USD, +0,43% CNY→GBP), 12
explicadas pela taxa antiga do Excel do Pedro (achado já conhecido, reconfirmado aqui, não
novo). As 3 restantes (refs 22/23/43, canal APAC) ficam de diagnóstico — margem implícita
não é um número reconhecível em nenhuma leitura, achado sobre o Excel, não sobre o motor.
Artigos entraram pelo formulário real (restrição 4); 163 entradas de configuração medidas
para os completar (12 HS + 48 direitos + 62 transporte + 41 margem — 12,5 por artigo, número
que informa o item 39 abaixo). Amostra provada pelo mecanismo real de propor→aprovar (9
aprovações, cobrindo os dois ramos de elegibilidade); as restantes ~142 entraram como
excepção nomeada (seed directo, só configuração, nunca artigo — ver `docs/ENGINE-PARITY.md`
§5). Limpeza confirmada contra a baseline: 13 artigos de amostra e os overrides que deles
dependiam apagados; os 12 códigos HS e as 48 linhas de direitos ficaram, são referência real
reutilizável pelo item 39. Detalhe completo, achado a achado: `docs/ENGINE-PARITY.md`.

~~**39. Importação em massa de produtos**~~ ✅ **fechado 2026-09-16 — migração 0013.**
Âmbito alargado face ao desenho original, com justificação medida pelo próprio item 38: não
só produtos — **produtos + configuração (transporte, margem, direitos aduaneiros) na mesma
passagem**, porque o volume nunca esteve nos produtos (163 entradas para 13 artigos, 12,5
por artigo — 625–875 para um catálogo real de 50–70). Ecrã `/import` (admin: os dois
ficheiros; `product_manager`: só artigos); dois formatos — `hs_code;description;rate` (a
taxa uniforme nas 4 zonas, confirmado sem excepção no item 38) e o mesmo formato da amostra
de paridade para artigos, com duas colunas novas derivadas nesta sessão (`product_id`,
`item_type` — a amostra nunca teve chave real nem este campo). Chave natural = `product_id`,
com upsert. Carregamento inicial escreve directo, fora do workflow da 0007, exactamente como
decidido a 06/09 (decisão datada em `docs/STATE.md`); um segundo modo por proposta agrupada
fica explicitamente para o item 44. Sete provas todas passadas: payload real (12 HS + 48
direitos, cruzado com o que o item 38 já tinha semeado à mão — bate 100%, e um teste à parte
comprovou o elo causal, `compute_price()` a falhar antes e a resolver depois, dentro de
`BEGIN`/`ROLLBACK`); dry-run sem escrita nenhuma; ficheiro com uma margem 1,2 rejeitado por
inteiro; segunda passagem do mesmo ficheiro sem escrever nada (idempotência por contagem);
lote desfeito de volta à baseline exacta, um segundo desfazer recusado; papel sem
`admin`/`product_manager` recusado pela própria função (`SECURITY DEFINER`, não é RLS).
`scripts/smoke.py` ganhou o bloco Z, **61/61**. Três bugs reais apanhados e corrigidos só
durante a validação `BEGIN`/`ROLLBACK` (duas colisões de nome de coluna, mesma classe de
erro que a 0010 já tinha apanhado uma vez; um `array_agg` sobre zero linhas a dar `NULL` em
vez de lista vazia, a violar o `not null` de `sold_in`). Detalhe completo:
`docs/IMPORT.md`.

**44. `decide_price_proposal()` sem caminho de aprovação em lote para configuração
global** — **REGISTADO 2026-09-15/16**, achado de desenho do item 38, não resolvido aqui.
Uma proposta de âmbito global (`branch_id IS NULL` — hoje só `customs_rates`,
`exchange_rates`, `currency_rounding_params`) só pode ser aprovada por `admin`; não há
caminho nenhum para um `branch_manager` ou outro papel partilhar essa carga, mesmo sendo a
sua própria filial afectada. Medido no item 38: uma revisão de 12 códigos HS × 4 zonas já
são 48 aprovações, uma a uma, só na conta do Pedro. Com o catálogo real (item 39), este
número sobe para a ordem das centenas por revisão de tarifa. Duas direcções possíveis, por
decidir: aprovação em lote (seleccionar várias propostas do mesmo `target_table` e decidir
de uma vez) ou um papel novo "gestor de configuração" mais estreito que `admin`. Nenhuma
desenhada aqui — registo, não correcção.

**45. Sem mecanismo de apagamento/anonimização de utilizador** — **REGISTADO 2026-09-16**,
achado de F0 do item 42. `app/src/app/admin/users/actions.ts` tem convidar, atribuir papel,
remover papel, desactivar (`Disable`/`Reactivate`, GoTrue `ban_duration`) e reset de
password — nenhuma função apaga ou anonimiza um utilizador (confirmado por leitura completa
do ficheiro, zero `deleteUser`). Um pedido de apagamento (RGPD ou não) hoje não tem botão
nenhum — seria manual, directo à BD, fora de qualquer fluxo da app. Não desenhado aqui.

**46. Sem exportação dos próprios dados (self-service)** — **REGISTADO 2026-09-16**, achado
de F0 do item 42. Nenhum ecrã deixa um utilizador pedir "os meus dados" (perfil, papel,
histórico de acções que o envolvem). Hoje, uma pergunta dessas só se responde por consulta
directa à BD, feita por quem lá tem acesso. Não desenhado aqui.

**47. `tmsi.audit_log` sem retenção nem purga, e alcança dados pessoais de colegas por API
directa** — **REGISTADO 2026-09-16 (item 42), investigado e reclassificado 2026-09-16 (itens
47+48).** A tabela é append-only desde a 0001, sem TTL nem tarefa de limpeza (confirmado:
nenhum timer/cron além do `tmsi-backup.timer`) — cresce para sempre. O ecrã `/audit` nunca
mostra `old_row`/`new_row` (só `id/at/actor/table_name/row_pk/action`, confirmado por leitura
de código) e só resolve o email de um `actor` para o próprio utilizador ou para `admin` (RLS
de `tmsi.profiles`, `profiles_self`) — mas os quatro papéis com leitura de `audit_log`
(`admin`/`finance`/`branch_manager`/`viewer`) têm privilégio de coluna para `old_row`/
`new_row` (confirmado, sem `REVOKE` nenhum), e uma linha de auditoria da tabela `profiles`
contém `full_name`/`email` em texto simples — alcançável por pedido directo à API
(`/rest/v1/audit_log?select=*`) por qualquer um desses quatro papéis, não só `admin`.

**F0 dos itens 47+48 (2026-09-16) mediu a hipótese mais grave — se isto também alcança
custos, contornando 0003/0004 — e a resposta é NÃO, com prova, não presunção:**
`tmsi.audit_log` tem uma única política RLS (`audit_read`, `admin`/`finance`/`viewer`/
`branch_manager`) — um subconjunto estrito de `can_read_costs()`
(`admin`/`product_manager`/`finance`/`branch_manager`/`viewer`). Todo papel sem custos
(`logistics`/`sales`/`agent`) devolve **zero linhas** de `audit_log`, por sessão real
(login real para `logistics`, JWT assinado para `sales`/`agent`) contra
`GET /rest/v1/audit_log?table_name=eq.products&action=eq.INSERT&select=id,new_row` — não uma
coluna mascarada, a própria RLS nega a linha antes de qualquer coluna importar.
`product_manager` (tem custos, mas a matriz do item 41 já o excluía de `audit_log`): também
zero linhas, confirmado. Controlo positivo: `finance`/`branch_manager` (login real) devolvem
a linha com `exw_price` presente — confirma que o mecanismo de teste funciona e que a leitura
é real quando o papel tem direito. Como `audit_log` é UMA tabela com UMA política aplicada a
todas as linhas independentemente de `table_name`, esta prova generaliza — nenhuma tabela
auditada (mesmo as com custos) pode vazar por este caminho a um papel sem `can_read_costs()`.

**Reclassificação: NÃO é falha de segurança da fronteira de custos — item 47 volta a ser
exactamente o que o item 42 tinha registado: um achado de privacidade** (dados pessoais de
colegas — não custos — alcançáveis por 4 papéis via API directa, nunca pelo ecrã). Sem
urgência de fronteira, sem correcção implementada nesta sessão (decisão deliberada, não
esquecimento — a correcção do ângulo de privacidade fica registada aqui, pendente, ao mesmo
nível dos itens 45/46/49, não implementada por decisão explícita de não alargar o âmbito
desta sessão de investigação além do que a urgência — agora afastada — justificava).

~~**48. Dumps nocturnos mundialmente legíveis no host (`644`, não `600`)**~~ ✅ **fechado
2026-09-16.** `~/backups/tmsi/` passou a `700` e os dumps existentes a `600` (directamente,
sem sudo — ficheiros do próprio `pedro`). O produtor (`tmsi-backup.service`, `/etc/systemd/
system/`, root) ganhou um passo novo — `chmod 600` logo a seguir ao `docker cp`, antes da
limpeza dos +30 dias — aplicado pelo Pedro directamente (o classificador de permissões da
sessão recusou a criação de um drop-in `sudoers` `NOPASSWD` para isto; o Pedro correu os
comandos exactos dados pela sessão). **Provado por execução real do serviço, não por leitura
do script:** `sudo systemctl start tmsi-backup.service` → os quatro `ExecStart` a
`status=0/SUCCESS`, incluindo o `chmod` novo; dump novo (`tmsi-2026-09-16.dump`) confirmado
`600` pela sessão a seguir, sem sudo (ficheiro do próprio dono). Escrow cifrado (`.gpg`) já
estava `600`, confirmado, sem alteração.

**49. Implementar a retenção de 5 anos do `tmsi.audit_log`** — **REGISTADO 2026-09-16**,
decisão do Pedro no item 42 (`docs/DATA-PROCESSING-NOTICE.md` secção 1): a tabela guarda-se
hoje sem limite (`append-only` desde a 0001, sem purga nenhuma); o prazo decidido é 5 anos a
partir da data de cada entrada. Por desenhar: mecanismo de apagamento (uma tarefa periódica?
uma política a nível de linha por data?), se o apagamento é definitivo ou passa primeiro por
um arquivo frio, e como isto interage com o valor probatório do registo (uma alteração de
preço de há 4 anos ainda pode interessar numa auditoria). Nada implementado aqui — a nota já
declara o prazo decidido como distinto do que está em vigor, para não prometer o que ainda
não existe.

~~**40. Higiene do seed fictício e das contas `.test`**~~ ✅ **fechado 2026-09-16.** Achado de
F0 que corrige o próprio texto acima: os IDs de fixture nunca foram `T-92xx`/`T-93xx` — essas
gamas eram fixtures **efémeras** de medição de desempenho (item 14/28), já confirmadas em
`docs/STATE.md` como limpas a 0/0. O que estava mesmo por marcar era outra coisa: os 10
produtos do seed real (`T-0001`–`T-0010`) **e** três produtos residuais de uma sessão de
verificação anterior (`T-8515`, `T-9002`, `T-9004` — mantidos deliberadamente nessa altura
como exemplos vivos, nunca fechados depois), nenhum destes derivável de `import_batches` (a
0013 só tem um lote, e esse lote não escreveu produto nenhum — todo o `tmsi.products` de hoje
é fictício, zero linhas reais). Achado extra: 3 `price_overrides` residuais de sessões
manuais antigas (`reason`: "tst"/"41"/"25", nada a ver com o seed) — expirados como as
demais, não escondidos.
**Feito:** (a) as contas `.test` **mantêm-se intocadas**, exactamente como o Pedro decidiu —
zero desactivação, zero rotação, zero criação de conta nova. (b) `scripts/smoke.py` ganhou um
modo `TMSI_VERIFY_MODE=jwt` que nunca chama `/auth/v1/token` (assina um JWT local com o
`JWT_SECRET` real, para o mesmo `user_id` que o login já usava) — provado com as contas
**simuladas indisponíveis** (`TMSI_CREDENTIALS_DIR` inexistente): 62/62, idêntico ao modo por
omissão (que fica byte-a-byte como estava). No mesmo achado, **4 blocos do smoke (P/S/U/X)
dependiam de existir algum produto `active` na BD para se auto-descobrirem** — deixaram de
encontrar um assim que (c) abaixo correu, e passaram a SKIP silencioso (61→46 com skips, não
uma falha ruidosa). Corrigido com um fixture próprio, criado/apagado a cada corrida — 62/62
real, sem SKIP nenhum. (c) os 5 códigos HS de fixture (referenciados pelo seed, não apagáveis
sem quebrar FK) e os 12 produtos fictícios (10 do seed + os 3 residuais) marcados/retirados de
circulação — `hs_codes.description` com sufixo `(fixture item 40 — não usar em preços reais)`;
produtos a `status='inactive'` (um já estava `discontinued`, deixado como estava). `compute_price()`
confirmado byte-idêntico antes/depois para o par não afectado (`T-0004/SA`, `T-0002/CORP`); os
3 `price_overrides` residuais expirados via `valid_to` (não `DELETE` — mecanismo nativo do
schema), com a alteração de preço resultante explicada, não escondida (`T-0005/SA`: margem
volta de 0,55 fabricado para 0,50 de grelha — o valor que o `VERIFICATION-PROTOCOL.md` sempre
documentou como baseline). `sales.sa` confirmado a ver **zero** produtos depois (antes via
`branch_manager.test`/CORP: 8; o RLS de `sales`/`agent` filtra por `status='active'`, o de
`branch_manager`/`admin`/`product_manager`/`finance`/`logistics`/`viewer` não — intencional,
essas contas continuam a precisar de ver produtos em qualquer estado). (d) `docs/TEST-ACCOUNTS.md`
novo: o que são as seis contas fictícias (as quatro do smoke + `sales.sa`/`agent.apac`), o que
já não se perde ao desactivar (nada, desde o modo `jwt`), o que **continua** a perder-se
(passos S/T do `VERIFICATION-PROTOCOL.md`, login real por browser — natureza do que testam,
não um defeito), e os passos exactos (`/admin/users`, botão **Disable**/**Reactivate**, já
existente, `ban_duration` via GoTrue). Backup fresco tirado e **verificado por restauro real**
(não só por existir o ficheiro) antes das alterações de dados — contagens do restauro
conferidas 1:1 contra o vivo. Detalhe completo, achado a achado: `docs/STATE.md`.

~~**41. Re-execução formal completa do `docs/VERIFICATION-PROTOCOL.md`**~~ ✅ **fechado
2026-09-16 — Execução n.º 2, 8 papéis completos, migrações 0001–0013.** Primeira execução
completa desde a n.º 1 (2026-09-05, só 0001–0005) — tudo o que veio depois (i9, i10, tarefa 6,
0007–0011) tinha sido só adenda parcial. As duas adendas em falta (0012/0013) escritas
primeiro (commit `5701607`), depois exercidas nesta mesma execução — matriz da secção 3 com 6
linhas novas, secções 4.12/4.13 novas (5 passos). Quase tudo provado fresco (`BEGIN`/
`ROLLBACK`, claims JWT reais, zero commit) — `scripts/smoke.py` cobre boa parte
automaticamente (62/62), o resto directo contra a BD (fixtures próprios `T-9691`–`T-9698`,
sobre o estado limpo do item 40, exactamente como antecipado); zero resíduo confirmado por
contagem no fecho (baseline 13/17/68/6/20/1/4/1/7, idêntica no fim). Passos que só um browser/
caixa de correio real consegue exercer marcados **NÃO EXECUTADO** (não "ok por inspecção") —
ficam para o Pedro, mesma limitação de sempre. **Três divergências encontradas, todas classe
(b) — texto do protocolo desactualizado, zero defeito da app:** a nota ⁸ dizia
`channels.margin_delta` "foi removido" (a coluna continua lá, só sem leitores); o passo K
dizia "pode criar" um override de duty (texto pré-0007, hoje é propor→admin aprova→visível); o
passo RR registava um achado que a nota XX (0010) já tinha corrigido, nunca actualizado para o
dizer. Todas corrigidas no próprio texto, histórico preservado por tachado. Matriz reforçada
da fronteira de custos (papel × caminho, incluindo `/import` da 0013): zero fuga em qualquer
célula. **Veredicto: gate de produção satisfeito para 0001–0013** — primeira vez a cobrir os
8 papéis completos desde a execução n.º 1. Detalhe completo, passo a passo: `docs/
VERIFICATION-PROTOCOL.md` secção 7, "Execução n.º 2".

~~**42. Nota de tratamento de dados aos utilizadores**~~ ✅ **fechado 2026-09-16.**
`docs/DATA-PROCESSING-NOTICE.md` (fonte, PT) + `/privacy` na app (inglês, qualquer
utilizador autenticado, sem caixa de aceitação). Cada afirmação ancorada numa medição real
desta sessão contra a BD/containers/host — não um modelo genérico: colunas de dados pessoais
(`profiles`/`user_roles`/`auth.sessions`), o que `tmsi.audit_log` guarda de facto (`old_row`/
`new_row` inclui nome/email sempre que um perfil muda, alcançável por 4 papéis via API
directa, nunca pelo ecrã `/audit`), o registo interno do GoTrue e os logs dos containers
(email em texto simples, retenção por volume não por dias), os logs do nginx (14 dias,
`logrotate`), os dumps nocturnos (30 dias, mas mundialmente legíveis no host) e o escrow
cifrado (só segredos de infra, confirmado sem dados pessoais). Duas decisões só do Pedro,
perguntadas directamente, nunca assumidas: responsável pelo tratamento no piloto (ele
próprio) e retenção do `audit_log` (5 anos, declarado como decisão distinta do que está
implementado hoje — item novo **49**). Quatro outras lacunas, cada uma o seu item: sem
apagamento/anonimização de utilizador (**45**), sem exportação própria de dados (**46**),
alcance do `audit_log` por API a 4 papéis (**47**), dumps `644` em vez de `600` (**48**).
`scripts/smoke.py` ganhou uma asserção nova (63/63) confirmando que `/privacy` sem sessão
redirecciona para `/login`, nunca serve a página — a prova mais funda (um papel comum a
ler o texto) fica para o Pedro, browser, mesma limitação de sempre para páginas Next.js.
Detalhe completo: `docs/DATA-PROCESSING-NOTICE.md`.

~~**43. Backup diário → semanal**~~ ✅ **fechado 2026-09-16, com a ressalva de calendário do
próprio item — fica em modo janela (diário) até o catálogo real estar carregado e
verificado.** `tmsi-backup.timer`/`.service` únicos substituídos por dois pares independentes
— `tmsi-backup-weekly.timer`/`.service` (regime permanente, `Mon *-*-* 03:30:00`, mantém as
últimas **8** cópias) e `tmsi-backup-window.timer`/`.service` (regime de janela, diário, sem
rotação) — exactamente um activo de cada vez, trocado por `systemctl disable --now`/
`enable --now`, nunca a editar a unit à mão. **Retenção contada em cópias, não em dias**:
medido antes de mudar (14 dumps reais desde 03/09, ~373 KB/dump em média, disco a 56%/13 GB
livres) — 8 semanais + janela sem limite cabe com folga enorme, confirmado por conta, não
estimativa. Nomes `tmsi-<data>-<modo>.dump` (data primeiro, propositadamente — um `tmsi-
weekly-<data>` teria ordenado alfabeticamente à frente de `tmsi-window-<data>` sem relação
com a data real, um risco real para o script de pull off-site do homelab, apanhado e corrigido
antes de fechar, não depois). Provas: dump novo a `600` (permissões do item 48 preservadas);
**restauro real** com `-U supabase_admin` (o procedimento documentado, não o atalho `-U
postgres` usado em sessões anteriores desta cadeia — zero erros, ownership de `auth.*`/
`tmsi.*` confirmado, mais rigoroso que as verificações anteriores); agendamento trocado nos
dois sentidos, `list-timers` a confirmar o próximo disparo a mudar de facto cada vez
(calculado independentemente também via `systemd-analyze calendar`); rotação com o limiar
forçado (10 cópias fictícias, as 2 mais antigas apagadas, as 8 mais recentes mantidas,
ficheiros reais nunca tocados). Dumps do regime antigo (14 datados + os `tmsi-pre-<migração>-*`
de sessões passadas) deixados como estão, já não geridos automaticamente — inofensivo à
escala medida. **Achado, não corrigido aqui, fora do âmbito VPS:** o script de pull off-site
do homelab pode assumir que a ordenação alfabética dos nomes de dump equivale à ordem
cronológica — continua a valer com o esquema novo (dados primeiro), mas fica sinalizado no
CHANGELOG do dossier para uma sessão homelab confirmar. Off-site (terceira perna, item 13)
continua suspenso, não resolvido aqui. Detalhe completo: `docs/STATE.md`.

---

## 🔴 Críticas — a fila de execução imediata

~~**1. i9 — Gestão de passwords sem email**~~ ✅ **fechada — achada já feita nesta varredura
2026-09-15, nunca marcada.** Todas as cinco alíneas confirmadas contra o código real:
(a) `resetPassword()` em `app/src/app/admin/users/actions.ts:159`, manual ou gerada
(`crypto.randomInt`), atrás de `has_role('admin')`. (b) `must_change_password` em
`tmsi.profiles` (migração 0006) — `app/src/lib/supabase-middleware.ts` lê-o em todo o
pedido e bloqueia a navegação até à troca. (c) `/account/password`
(`change-password-form.tsx`/`actions.ts`) — verificação da password actual passou a ser
imposta pelo próprio GoTrue (`GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`),
não só pela app, um upgrade sobre o pedido original. (d) `mark_password_changed()` RPC limpa
a flag; audit trigger já cobre `tmsi.profiles`. (e) `docs/VERIFICATION-PROTOCOL.md` secção
4.7, passos W/X/Y, cobre os três fluxos (reset manual, reset gerado, troca própria) —
password errada recusada no servidor, sem sessão nova. `scripts/smoke.py` já assume as
quatro contas `.test` geridas por este mecanismo (`TEST_USERS`).

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
**10. Âmbitos de override canal/agente** — **PARCIALMENTE fechado, achado nesta varredura
2026-09-15, por um caminho diferente do previsto.** As duas perguntas originais
(`docs/ROADMAP.md`, "Questões abertas": (a) precedência entre âmbito de filial e de
canal/agente coexistentes; (b) como o contexto de canal/agente chega a `compute_price()`)
eram sobre `tmsi.product_hs_overrides` especificamente, não sobre `price_overrides` em
geral. Estado real confirmado contra o código: **(b) resolvido para `price_overrides`** —
`compute_price()` ganhou `p_scope_type`/`p_scope_id` na migração 0009, e um override de
margem/transporte por canal já tem efeito real (workflow de aprovação, admin-only).
**(b) continua por resolver para `product_hs_overrides`** — o motor (migração 0012, linha
do `select h.hs_code from tmsi.product_hs_overrides h where ... h.scope_type = 'branch'`)
só lê `scope_type='branch'`, exactamente como o ROADMAP registava; linhas `channel`/`agent`
continuam a aparecer marcadas "no effect" na UI (`app/src/app/products/[id]/page.tsx`).
**(a) tornou-se irrelevante, não resolvida** — a migração 0010 fez o âmbito canal zerar
**sempre** a taxa de direitos (`v_duty_rate := 0` quando `p_scope_type = 'channel'`), por
isso o HS code (e qualquer override dele) deixou de influenciar o preço de canal de todo;
não há precedência nenhuma para decidir enquanto essa regra se mantiver. Se um dia os
direitos voltarem a aplicar-se a canais, a pergunta (a) reabre.
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
procedimento correcto provado: `docs/DISASTER-DRILL.md`. Sequelas → itens 35, 36 e 37
(renumerados na reconciliação de 2026-09-15 — ver nota de correspondência no fim do
ficheiro; eram 21, 22 e 23 até aí).

~~**35. Kit de desastre**~~ ✅ **fechada 2026-09-06** — as 6 frentes (`docs/DISASTER-DRILL.md`
achados 5–8 + GHCR + escrow), todas provadas: `DEPLOY.md` reescrito contra a produção real,
incl. o procedimento de restauro provado no ensaio e o passo de rebuild do achado 3;
`deploy/supabase/.env.example` completo (25 nomes reais, raiz `.env.example` corrigido para
apontar lá); `deploy/nginx/tmsiequipment.conf` versionado, diff zero contra o real; GHCR
autenticado com ordem rígida provada (→ item 37, já fechado); `smoke.py` portável
(`TMSI_BASE_URL`/`TMSI_CREDENTIALS_DIR`), 27/27 provado nos dois modos; escrow cifrado
(`gpg -c`, `age` não instalado) com prova de decifração do Pedro. Detalhe completo, todos os
desvios/incidentes registados honestamente: `docs/STATE.md`.

~~**25. `smoke.py`'s bloco R é sensível à fronteira UTC/hora local**~~ ✅ **fechada
2026-09-06** — `db_today()` novo pergunta ao próprio Postgres (`select current_date`) em vez
de usar `date.today()` do Python; as duas comparações reais (blocos I e R) passam a usar essa
autoridade única. Provado: mecanismo de dependência do fuso confirmado ao vivo (`TZ=UTC` vs
`TZ=Etc/GMT+12` dão datas diferentes agora), `smoke.py` corrigido dá 27/27 sob os dois
extremos. Detalhe: `docs/STATE.md`.

~~**36. Desprender a imagem do hostname**~~ ✅ **fechada 2026-09-06** (achado 3 do ensaio).
`SUPABASE_URL`/`SUPABASE_ANON_KEY` passam a env de runtime, reaproveitando `SITE_URL`/
`ANON_KEY` já existentes — zero chave nova no `.env`. Confirmado por grep contra a imagem
nova: zero ocorrências do hostname e de qualquer JWT nos chunks. **Achado lateral real
durante a prova:** o fail-fast desenhado com `instrumentation.ts`/`register()` do Next.js não
funcionava — provado ao vivo três vezes que nem `process.kill(process.pid, 'SIGKILL')`
chamado de dentro da app derruba o processo real (fica um zombie a recusar ligações para
sempre); substituído por um guard `sh -c` no `CMD` do `Dockerfile`, que funciona (exit 1
imediato, confirmado ao vivo). Fecha a classe toda: a mesma imagem serve qualquer hostname, e
rodar `JWT_SECRET`/`ANON_KEY` (item 24) deixa de exigir rebuild. Detalhe: `docs/STATE.md`.

~~**37. Tornar o pacote GHCR privado**~~ ✅ **fechada 2026-09-06** (achado 4; item 35 F1).
Ordem rígida provada: login autenticado com o pacote ainda público (`tmsi-app` **e**
`itinera`, mesma entrada partilhada `~/.docker/config.json`) → pacote tornado privado pelo
Pedro → re-prova dos dois → ramo de falha (`unauthorized` sem credencial) → credencial
restaurada, re-provado. Novo PAT `read:packages` (classic), criado pelo Pedro, introduzido
só por ficheiro 600 descartado logo a seguir ao login — avança a rotação pendente do
`CREDENTIALS-INVENTORY.md` (KI #9) do lado do pull. Detalhe: `docs/STATE.md`.

~~**24. 4 segredos de produção ecoados no output do agente — rotação**~~ ✅ **fechada
2026-09-06** (incidente de 2026-09-06, item 35). `POSTGRES_PASSWORD`, `JWT_SECRET`,
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

~~**28. Custo HTTP/PostgREST de `v_products` a volume**~~ ✅ **fechado 2026-09-06 — artefacto
de medição, não defeito da app.** O achado do item 14 media `v_products` sem `?select=`
(PostgREST responde `*`, ~32 colunas) — forma que a app **nunca envia**: `/products` e o
export já pedem só as 7 colunas que usam. Medido com essa forma real: 0,376s/0,667s a
70/163 (vs. 3,234s/6,310s com `*`) — 8,6-9,5× mais rápido, ao nível do controlo saudável
(`v_branch_prices`). Subir o `mem_limit` do `supabase-rest` 128m→512m (temporário, revertido
e confirmado por `docker inspect`) não mudou nada — exclui a hipótese do limite do
contentor. **Nada a corrigir** — o único consumidor com `select('*')` é a página de detalhe
de um produto (uma linha, não escala com o catálogo). Detalhe completo: `docs/STATE.md`,
secção "Item 28".

~~**29. Motor sem regra de cálculo para canais (APAC e futuros)**~~ ✅ **fechado
2026-09-09 — migração 0009.** `tmsi.compute_price()` ganhou um âmbito explícito
(`p_scope_type`/`p_scope_id`, `'branch'` ou `'channel'`) — um preço de canal calcula-se a
partir do EXW, sem fee intercompany, sem direitos aduaneiros, sempre (a regra selecciona-se
pelo tipo de âmbito, nunca pelo nome do canal). `tmsi.channels.margin_delta` removido (não
migrado — o seu único valor, `-0,10`, não sobrevive ao modelo novo, margem por artigo×canal
via override, nunca uma grelha); margem de canal é sempre um override explícito (0009 §5),
que segue o mesmo workflow de aprovação da 0007, admin-only (nenhum `branch_manager` tem um
canal em `my_branches()`). Preços de filial confirmados **byte-idênticos** a uma baseline
pré-migração (restrição 1), duas vezes. `docs/VERIFICATION-PROTOCOL.md` secção 4.10 (passos
MM–SS) tem as 7 provas completas; `scripts/smoke.py` 45/45. Export/impressão de uma lista de
canal (o ficheiro real) fica por confirmar pelo Pedro — mesma limitação de cookie de sempre.
Detalhe completo: `docs/STATE.md`, secção "Canais no motor de preços".

~~**30. Sem regra própria para linhas não-equipamento (margem zero, preço=EXW)**~~ ✅
**fechado 2026-09-10 — migração 0010.** `option`/`service` passam a ter `fee=0` e
`margin=0` sempre (não só em venda "em casa"), verificado antes do fallback de grelha/canal
— substitui por completo o caminho antigo de "opção herda a margem do pai". Hand-verificado
em três casos reais (`T-0006`/`T-0007`/`T-0008`, `docs/VERIFICATION-PROTOCOL.md` passo WW).
**Risco do carregamento de dados reais, registado aqui em 2026-09-15, a verificar quando os
artigos entrarem (item 39) — não uma tarefa a fazer agora**: se o catálogo real tiver
opções que devam continuar a herdar a margem do pai (bundles) em vez desta regra plana,
precisa de um sub-tipo que o schema não tem hoje — a regra actual aplica-se a **todas** as
opções/serviços, sem distinção. "Artigo não devolvido" continua sem campo próprio no
schema — se corresponder a `item_type='service'` na prática, já está coberto; se não, é um
achado novo, não confirmado ainda.

~~**31. `origin_country` não está atrás da fronteira de custos**~~ ✅ **fechado 2026-09-10 —
migração 0010.** Movido de `can_read_operational()` para `can_read_costs()` em
`tmsi.v_products`, exactamente a mesma condição do `supplier_id` ao lado. Provado no ramo
negado, ao nível do payload (`docs/VERIFICATION-PROTOCOL.md` passo VV: papel com custos vê
o país, papel sem custos recebe `null`) — nunca apareceu em nenhum export (confirmado por
leitura de código), por isso não há prova de conteúdo de ficheiro a fazer aqui.

**32. Base do direito aduaneiro fixa, não configurável por zona** — **REGISTADO
2026-09-09**, pergunta em aberto do Pedro, não uma correcção pedida ainda. `v_duty :=
v_interco * v_duty_rate` (0001:468) é uma única fórmula para todas as zonas — bate certo com
o Excel hoje (direitos incidem só sobre o preço interco, sem o transporte na base), mas não
há forma de a app ter uma base diferente por zona se um dia for preciso. Sem urgência — só
decidir depois de confirmar com quem trata de alfândega. Detalhe completo:
`docs/MODEL-GAP-ANALYSIS.md`, item 7.

~~**33. Zona "CH" do Excel sem correspondência no enum de zonas do schema**~~ ✅ **fechado
2026-09-09 — falso alarme, resolvido pelo Pedro sem tocar em código.** `CH` no Excel
significa **China** (o bloco da Condat TBM — `CONFIGURATION`: `Condat TBM | CNY | China`),
não Suíça, e a quarta coluna chamada `GBP` significa **Reino Unido**. `tmsi.customs_zone`
(0001:20) já é `EU/CN/US/UK` — exactamente o que devia ser, desde sempre. A confusão estava
inteiramente na leitura das colunas do Excel, nunca no schema — nada a alargar, nada a
renomear, nada a corrigir. Único efeito prático: nos 18 códigos HS, a percentagem é hoje
igual nas quatro zonas, por isso nenhum número muda com este achado.

~~**34. `ref_factor`/`list_coef` sem interface de edição na app**~~ ✅ **fechado 2026-09-10 —
migração 0010.** `ref_factor`/`list_coef` saíram de `tmsi.branches` para
`tmsi.branch_pricing_params`, efectivo-datado como `margin_grids`/`transport_tiers`, novo
`target_table` do workflow de aprovação da 0007 — aprovação cai no mesmo mecanismo genérico
que já cobre `margin_grids` (um `branch_manager` aprova para a sua própria filial, sem
código novo). `/config` ganhou uma secção só para `ref_factor` (`list_coef` continua sem
campo no formulário — carregado do valor actual pelo próprio servidor, nunca de um campo).
Fluxo completo propor→aprovar→efeito provado ao vivo (`docs/VERIFICATION-PROTOCOL.md`
passo YY) — **apanhou um bug real no caminho** (as duas tabelas novas ficaram sem
privilégios para `authenticated`/`postgres`, corrigido pela migração 0011 antes de fechar).
Detalhe completo:
`docs/MODEL-GAP-ANALYSIS.md`, item 4.

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

## Nota de correspondência — renumeração de 2026-09-15

O documento original reutilizou os números **21, 22 e 23** para tarefas diferentes (um
conjunto fechado 2026-09-05, outro fechado 2026-09-06) — achado da reconciliação pedida pelo
Pedro. Os títulos ficaram como estavam; só o **segundo** conjunto (o de 06/09) ganhou número
novo, para cada identidade ficar única:

| Número antigo | Título | Número novo |
|---|---|---|
| 21 (06/09) | Kit de desastre | **35** |
| 22 (06/09) | Desprender a imagem do hostname | **36** |
| 23 (06/09) | Tornar o pacote GHCR privado | **37** |

Os itens **21** (Tarefa 6), **22** (`forgot-password/actions.ts`) e **23**
(`compute_price()`'s `errors[]`), todos de 2026-09-05, mantêm o número original — nunca
mudaram.

---

## Ordem de sessões proposta — histórica, já toda percorrida (nota 2026-09-15)
i9 (passwords) → i10 (export) → técnica (smoke+lockfile) → auth/headers → code review →
piloto (8) → L2/E4 informada pelo uso → restantes por procura.
Todos os passos até "L2/E4" estão fechados (ver itens 1-6, 9, 21-25 acima); o piloto (8)
continua deliberadamente adiado pelo Pedro, não pendente de trabalho técnico. "Restantes por
procura" já rendeu, fora desta ordem original: canais no motor (0009, item 29), arredondamento/
margem plana/fronteiras (0010/0011, itens 30/31/34), margem interco como propriedade do
artigo + ecrã `/branches` (migração 0012 — documentada em `docs/STATE.md` e no dossier, mas
**sem adenda em `docs/VERIFICATION-PROTOCOL.md` §7**, ao contrário de todas as migrações
0001–0011; achado da reconciliação de 2026-09-15, ver item 41). Esta secção fica como
registo histórico, não como fila activa — **a fila real, a partir de 2026-09-15, é a secção
"Caminho para os dados reais" (itens 38-43) primeiro, depois os itens ainda sem `~~risco~~`
mais acima (7, 10 parcial, 11, 12, 13, 32), mais os "Baixas".**
