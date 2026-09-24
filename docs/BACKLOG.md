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

~~**44. `decide_price_proposal()` sem caminho de aprovação em lote**~~ ✅ **fechado
2026-09-16 — migração 0015, mecânica apenas.** Medido no item 38: 48 aprovações só para uma
revisão de direitos (12 HS × 4 zonas), 163 entradas de configuração para 13 artigos — com o
catálogo real (50–70 artigos), centenas de cliques, um de cada vez, numa única conta.
`tmsi.decide_price_proposal_batch(p_proposal_ids, p_decision, p_reason, p_dry_run)`: **a
mesma elegibilidade da 0007, nunca alargada** — admin, ou branch_manager da filial afectada;
propostas inelegíveis excluídas à cabeça, visíveis com motivo, nunca fazem o lote falhar.
Pré-visualização (omissão) mostra deltas reais — valor antes/depois por proposta, não só uma
contagem — decisão desenhada explicitamente para não reabrir o "aprovar sem ler" que a adenda
F1 do item 38 já tinha recusado. Atómico: uma falha a meio reverte o lote inteiro, provado
pelo ramo de falha (uma proposta condenada a violar FK ao lado de uma válida — nenhuma das
duas fica decidida). `audit_log`: uma entrada por proposta decidida, com a referência do
lote — nunca duas, nunca perde granularidade. `docs/IMPORT.md` ganhou o contrato que o
segundo modo de importação (proposta agrupada) terá de seguir, não implementado ainda.
`scripts/smoke.py` bloco **AA**, 63→**78/78**, confirmado nos três modos do item 40.
Detalhe completo: `docs/STATE.md`.

**50. Aprovação de configuração global — `branch_manager` ou só `admin`?** — **REGISTADO
2026-09-16**, decisão de política que o item 44 deliberadamente não resolveu (§1 do prompt: é
organização, não mecânica). Hoje, uma proposta de âmbito global (`branch_id IS NULL` —
`customs_rates`, `exchange_rates`, `currency_rounding_params`) só pode ser aprovada por
`admin`, mesmo em lote — não há caminho nenhum para um `branch_manager` partilhar essa carga,
mesmo sendo a sua própria filial afectada por uma revisão de tarifa. A resposta determina
quem consegue trabalhar sem o Pedro quando a equipa entrar: manter admin-only significa que
toda a revisão de configuração global cai sempre na mesma conta; alargar significa desenhar
ou um papel novo ("gestor de configuração", mais estreito que admin) ou uma regra de
elegibilidade nova para `branch_manager` em propostas sem filial própria — nenhuma das duas
desenhada aqui. Decisão do Pedro, sem prazo.

~~**51. Carga do catálogo real**~~ 🟠 **carregado 2026-09-16, por activar — registado
2026-09-19.** **49 dos 52 artigos** entraram por um único lote do importador do item 39
(`tmsi.import_batches` `ee1db00c-1d14-4e32-8813-83b6acd19dca`, 245 linhas, 16/09 19:53):
**49 produtos `T-1001`–`T-1052` + 485 `price_overrides`**, 534 itens escritos, zero rejeições.
Antes dele, um lote de complemento de direitos (`d1baa128-…`, 4 códigos HS × 4 zonas = 20
itens) e, fora do importador, **11 categorias reais** inseridas directo (mesma excepção
nomeada que o item 38 usou para configuração: tabela de referência, sem preço, fora do
workflow da 0007). Contagens em produção depois da carga: `products` 13→62, `price_overrides`
6→491, `hs_codes` 17→21, `customs_rates` 68→84, `categories` 6→17, `import_batches` 1→3.
**Esquema de identificadores:** `T-1NNN` com `NNN` = `ref` do Excel — determinístico e
reversível, sem colisão com os legados (`T-0001`–`T-0010`, `T-8515`, `T-9002`, `T-9004`).
**Três artigos diferidos** (refs 47/48/49, `item_type='option'`): `primary_subsidiary` vazio
na origem **e** duas barreiras independentes do importador — a validação recusa `exw_price < 0`
para **todos** os tipos (mais estrita do que a constraint da BD, que isenta `option`), e o
`INSERT` não escreve `parent_id`, que `products_check` exige para `option`. Quem lá mexer tem
de tratar as duas, não uma. **Estado hoje: os 49 estão em `draft`** — a activação exige `unit`
(ausente no ficheiro e no importador, bloqueia os 49) e o código SAP da filial de origem
(`sap_code_cn` para os 39 de origem TBM; ver item 52). Paridade completa do catálogo contra o
Excel: `docs/ENGINE-PARITY.md` §9. Detalhe da execução: `docs/STATE.md`.

**52. `sap_code_cn` dos artigos de origem TBM — derivável, com 2 excepções** — **REGISTADO
2026-09-19.** A regra de negócio já está escrita (`docs/MODEL-GAP-ANALYSIS.md:27`, item 10):
TBM = `sap_code_sa` com prefixo `S`, LTD = `sap_code_sa` tal e qual, CORP = `NC` próprio; o
schema guarda os quatro valores e **não deriva nenhum**. Medido a 19/09 sobre os 39 artigos de
origem TBM: **37 têm `sap_code_sa`**, a derivação daria **37 valores distintos** e **zero
colisões** contra `sap_code_cn` existentes. As duas excepções são **T-1002** e **T-1020**,
ambos sem `sap_code_sa` de origem. O ficheiro da carga **não traz coluna de código CN** (só
`sap_code_sa` e `sap_code_us`), por isso não confirma nem contradiz a regra — apenas não a
alimenta. Decisão do Pedro: derivar os 37 e tratar os 2 à mão, ou esperar pelos códigos reais.

**53. `sap_code_us` duplicado no ficheiro-fonte — dado errado ou constraint errada?** —
**REGISTADO 2026-09-19.** `NC01728-998` aparece em três artigos do ficheiro da carga:
**T-1021** (FOAM GUN, `equipment`, cat. `2-FOAM GENERATOR`, origem SA), **T-1023** (M4N FOAM
GENERATOR, `equipment`, mesma categoria e origem) e **T-1042** (EASY BRUSH FILLER ASSEMBLY,
`equipment`, cat. `4-EASY BRUSH FILLER`, origem TBM). Os três são `equipment`, nenhum é opção
nem acessório de outro, e o terceiro difere em categoria **e** em filial de origem — não é o
padrão de "um código de kit para uma família". Facto adicional, sem interpretação: o T-1002
leva `NC01726-998`, número adjacente. **Nada disto chegou à base** — o importador da 0013
nunca escreve `sap_code_us`, logo `products_sap_code_us_key` ainda não foi exercida por estes
dados; será, na segunda importação. Duas leituras possíveis e opostas (o dado está errado, ou
a CORP usa mesmo um código para três artigos e a constraint é que está errada) — decisão do
Pedro, não desenhada aqui.

~~**54. `limit_req_zone` do rate limit vive fora do repo**~~ ✅ **FECHADO — feito em `482bb4f`
(`deploy/nginx/tmsi-rate-limits.conf`), riscado 2026-09-24** depois de confirmar que o vhost vivo é
igual ao do repo (`diff`) e a zona está em `/etc/nginx/conf.d/`. Texto original: — **REGISTADO 2026-09-19**, lacuna do
kit de desastre achada ao verificar o ⚠️ do relatório de auditoria. O vhost versionado traz
`limit_req zone=tmsi_auth burst=5 nodelay` (`deploy/nginx/tmsiequipment.conf:34`,
`location = /auth/v1/token`), mas a zona correspondente — `limit_req_zone $binary_remote_addr
zone=tmsi_auth:10m rate=10r/m` — só existe em `/etc/nginx/conf.d/tmsi-rate-limits.conf`, **no
host, fora do repo**. Um restauro que reponha só o que está versionado dá um vhost a
referenciar uma zona inexistente, e o nginx **recusa arrancar** (`unknown limit_req zone`). O
limite funciona hoje (provado ao vivo a 19/09: seis pedidos passam, do 7.º ao 9.º `503`, o
10.º volta a passar — `rate=10r/m burst=5`). Falta versionar o ficheiro da zona, ou registá-lo
explicitamente no `deploy/DEPLOY.md` como passo manual de restauro.

**55. A perna off-site é invisível à monitorização** — **REGISTADO 2026-09-19.** O
`status.json` publica `tmsi_backup_age_h` (idade do dump **no VPS**) e nada sobre o off-site.
A 19/09 confirmou-se, pelo padrão de `atime` dos dumps, que o pull nocturno do homelab corre e
apanha os ficheiros `-window` (16/09 lido a 17/09 03:08, 17/09 lido a 18/09 03:05, 18/09 lido
a 19/09 03:02) — mas isso é inferência de uma sessão, não um sinal contínuo. Se o pull parar,
nada nesta infra dá por isso.

**Desenho proposto (2026-09-19, só desenho — nada tocado no homelab):** há duas formas, e a
diferença entre elas é *quem consegue mentir*.

1. **Medir no VPS, pelo `atime`** — `vps-stats.sh` publica `tmsi_offsite_pull_age_h`, calculado
   como `now() - max(atime)` dos `~/backups/tmsi/*.dump`. **Prós:** zero código no homelab, zero
   credenciais novas, e o VPS já produz o `status.json`. **Contra:** mede *que alguém leu o
   ficheiro*, não que a cópia chegou nem que presta — e um `noatime` futuro no `/` cega a métrica
   sem aviso. É um sinal de liveness, não de integridade.
2. **Medir no homelab, e publicar de lá** — o próprio `tmsi-offsite-pull.sh` escreve, no fim de
   cada corrida bem sucedida, um carimbo com a data e o resultado de um `pg_restore -l` ao
   ficheiro que acabou de puxar; o tile do homelab lê esse carimbo. **Prós:** mede o que
   interessa — cópia presente **e** legível no destino. **Contra:** precisa de trabalho do lado do
   homelab, que é outro projecto e outra sessão.

**Recomendação:** as duas, por ordem — (1) agora, porque é barato e apanha o caso "o pull parou";
(2) quando houver sessão de homelab, porque é a única que apanha "o pull corre e traz lixo". O
limiar de alarme sai da cadência: em modo janela (diário), qualquer idade acima de ~30 h é
anomalia; em modo semanal, acima de ~8 dias.

**56. Cobertura de prova em falta: 0014 sem smoke, e 4 dos 8 papéis sem sessão automatizada** —
**REGISTADO 2026-09-19**, achado da auditoria (§5.2 do `docs/STATUS-REPORT-2026-09.md`). A 0014
não tem **nenhuma** asserção no `scripts/smoke.py` — e a sua primeira versão foi um `REVOKE` ao
nível da coluna que aplicou sem erro e **não fez nada**, exactamente o tipo de regressão que só
um teste apanha. O `TEST_USERS` do smoke tem 4 papéis (`finance`, `product_manager`,
`logistics`, `branch_manager`); a matriz do protocolo tem 8 — `sales`, `agent`, `viewer` e
`admin` nunca são exercidos automaticamente. Como `sales` e `agent` são precisamente os papéis
que verão dados reais primeiro quando os artigos do item 51 forem activados, a prova tem de
existir **antes** dessa activação. Também sem asserções: 0005 (substituída pelo bloco R, não
reforçada), 0006 e 0008.

~~**57. Três contas reais sem papel atribuído**~~ ✅ **fechado 2026-09-19 por decisão do Pedro:
nenhuma conta é removida nem desactivada.** Todas as contas existentes — as seis `.test`, a de
admin e estas três sem papel — são de teste e ficam como estão **até à fase de produção**, altura
em que a limpeza se faz de uma vez. Sem papel não vêem nada (verificado: toda a leitura passa por
`has_role()`), logo não há urgência. Texto original do achado, para contexto:

**Decisão do Pedro, 2026-09-23, sobre as três contas sem papel:** ficam **exactamente como
estão** — nem removidas, nem desactivadas, nem com a password uniformizada. São
`pedro_alexandre625@hotmail.com`, `pedro.dacosta@condat.fr` (banida até 2126) e
`pedroalexandre625+verifiteste@gmail.com`. **Não são contas `.test`:** são endereços reais, um
deles corporativo. A uniformização de passwords de 2026-09-23 aplicou-se às seis `@example.test` e
**parou aqui de propósito** — a justificação dessa decisão ("são fictícias, só o Pedro acede") não
se estende a identidades reais.

**57. Três contas reais sem papel atribuído** — **REGISTADO 2026-09-19**, achado da auditoria
(C4). Além da conta `admin` do Pedro, existem em `tmsi.profiles` **três contas reais sem
nenhuma linha em `tmsi.user_roles`**: um endereço pessoal alternativo, um endereço corporativo
`condat.fr` e um alias `+verifiteste` do endereço principal (este criado, pelo aspecto, para
testar o fluxo de verificação por email). Todas `active`. **Não são uma fuga** — sem papel,
`has_role()` devolve falso em tudo e nenhuma delas vê produtos, preços ou auditoria; foi
verificado que a fronteira não depende da ausência de papel, mas da sua presença. São higiene
por fazer, e tocam o item 45 (não há mecanismo de apagamento/anonimização): decidir, para cada
uma, se leva papel, se é desactivada, ou se fica como está e porquê. Não foram tocadas nesta
sessão.

~~**58. Completar `sap_code_cn` dos artigos de origem TBM**~~ ✅ **fechado 2026-09-19 —
37 escritos, 2 excepções nomeadas.** Autorizado pelo Pedro nessa noite; regra de 09/09
(`docs/MODEL-GAP-ANALYSIS.md:27`): TBM = `S` + `sap_code_sa`. Recalculado na hora, não reutilizado
da sessão anterior: 39 de origem TBM, **37 com `sap_code_sa`**, 37 derivados **distintos**, zero
colisões entre si e zero contra qualquer `sap_code_*` já existente. Escrita directa numa **única
transacção**, assinada pela identidade `admin` (zero entradas de auditoria com autoria nula), com
**desfazer provado antes** num artigo fictício que já tinha valor (`T-0001`: valor → ensaio →
valor original restaurado). Efeitos secundários medidos e **ausentes**: os 37 continuam `draft`;
`price_versions` 67→67; **impressão digital dos preços idêntica antes e depois**
(`md5` de todas as linhas de `v_branch_prices`), logo zero preços mudaram. **Excepções:**
`T-1002` e `T-1020`, sem `sap_code_sa` de origem — nada a derivar. **Nota:** `T-1012` tinha
`sap_code_cn` preenchido com `Ytghuu`, escrito às 22:29 desse mesmo dia por conta conhecida — o
`audit_log` mostra-o; é resíduo do teste no browser, não um código SAP, e foi substituído pelo
derivado. O desfazer repõe o valor exacto anterior de cada um dos 37, `Ytghuu` incluído.
**Valores derivados, sujeitos a revisão humana na fase de produção**, por decisão do Pedro.

**59. 🔴 FUGA DE MARGEM por função `SECURITY DEFINER` sem verificação de papel** — **ACHADO
2026-09-19**, bloco A da sessão de fronteiras laterais. **Três funções não verificam o papel do
chamador no corpo** e, sendo `SECURITY DEFINER`, lêem tabelas cuja RLS é `can_read_costs()` e
devolvem o número à mesma:

| Função | Lê | RLS da tabela | Mede-se |
|---|---|---|---|
| `tmsi.branch_margin(p_branch, p_cost_eur, p_date)` | `margin_grids` | `can_read_costs()` | `logistics`, `sales`, `agent` → **HTTP 200 com valor de margem** |
| `tmsi.override_value(p_product, p_scope_type, p_scope_id, p_kind, p_date)` | `price_overrides` | custos, ou `logistics` só `kind='duty'` | os mesmos três → **200 com valor de margem** (testado contra um override real de `kind='margin'`) |
| `tmsi.fx_rate(p_currency, p_date)` | `exchange_rates` | `can_read_costs()` | **200 sem credencial nenhuma** — `EXECUTE` é `PUBLIC`, alcança `anon` |

Medido duas vezes, independentemente, pela **API REST real** com JWT cunhado — não por leitura de
código. Os mesmos papéis que dão **0 linhas** em `margin_grids` e `price_overrides` recebem daqui
um valor. Um `POST /rest/v1/rpc/branch_margin` basta. **Nenhum valor real foi impresso** em
nenhuma das medições.

É a mesma classe dos itens 47/48 (fuga lateral): a fronteira foi provada nas tabelas e nas
vistas, e o caminho por função ficou por exercer. **Exposição medida e fechada — ver item 64:
nenhum terceiro tocou na API REST do TMSI em todo o período coberto pelos logs.** A correcção — verificar `can_read_costs()`
dentro das três, ou revogar `EXECUTE` a quem não deve — **mexe em funções e privilégios, logo
arrasta migração e execução formal do protocolo**. Decisão do Pedro, não tomada aqui.

**60. `decide_price_proposal_batch` sem verificação de papel ao topo** — **ACHADO 2026-09-19.**
Ao contrário de `decide_price_proposal`, que levanta `Forbidden`, a versão em lote não verifica
o papel do chamador: protege-se só pela classificação de elegibilidade por proposta. **Essa
classificação é eficaz** — medido com `logistics`, incluindo o caso adversarial de lhe entregar
os **21 ids** (20 dos quais a RLS lhe esconde): `changes` a zero, 21 excluídos, nenhum campo de
valor em nenhuma entrada, `decided_count = 0` no caminho de escrita. **Mas cria uma linha vazia
em `tmsi.decision_batches`**, atribuída a quem chamou, sem ter decidido nada. Não é fuga; é
integridade e defesa em profundidade. Corrigir mexe na função → migração → decisão do Pedro.

**61. `tmsi.settings` é legível por toda a gente, e contém política de margem** — **ACHADO
2026-09-19.** A política `config_read` de `settings` é `USING (true)`: qualquer autenticado lê
as 6 chaves, entre elas `margin_min`, `margin_target` e `margin_good`. Medido: `sales` e `agent`,
que não lêem mais nenhuma tabela de configuração, lêem esta. Não é margem de um artigo — é a
**política comercial da empresa** (o mínimo aceitável), e um comercial saber o piso da casa não é
o mesmo que saber o custo de um artigo. Por isso não o classifico como fuga: classifico-o como
decisão do Pedro. Se for para fechar, é migração.

**62. As quatro primitivas da fronteira não têm `search_path` pinado** — **ACHADO 2026-09-19.**
`has_role`, `can_read_costs`, `my_branches` e `my_channels` são `SECURITY DEFINER` **sem**
`SET search_path`, contra a convenção que a própria 0002 instituiu depois de apanhar esse defeito
em `audit()`. **Não é explorável hoje** — os corpos qualificam tudo, e `authenticated`/`anon` não
têm `CREATE` em `public`, `tmsi`, `auth` nem na base, logo não há onde plantar um objecto que
capture um nome. Dívida de defesa em profundidade, não incidente. Corrigir é migração.

**63. Sete rotas cujo único gate é a RLS por baixo** — **ACHADO 2026-09-19.** `/products/export`
(a mais séria — é a única rota de export que não ramifica por `can_read_costs()`, ⚠️10),
`/products`, `/products/[id]`, `/overrides`, `/proposals`, `/branches` e `/`. Nenhuma verifica
papel; todas dependem da RLS da vista ou tabela por baixo. Funciona hoje, e é a última linha de
defesa a fazer sozinha o trabalho das duas. Nota relacionada: em `/config`, as 9 consultas
disparam **incondicionalmente** (`app/src/app/config/page.tsx:104-157`), incluindo
`margin_grids.margin` e `branch_pricing_params.ref_factor` — inócuo porque a RLS esvazia, mas
pelo mesmo motivo. As que se resolvem em código de app entram na sessão de correcções; as que
pedirem migração ficam aqui.

**64. 🔴 `compute_price` devolve o breakdown de custo a quem não tem sessão** —
**ACHADO 2026-09-20**, teste adversarial da condição 3. Pior do que o item 59, e por mecanismo
diferente: `POST /rest/v1/rpc/compute_price` **sem `Authorization` nenhum** devolve **200 com as
20 colunas**, breakdown de custo inteiro incluído (`exw_local`, `fee`, `interco`, `transport`,
`duty`, `total_cost`, `total_cost_eur`, `margin`, `list_coef`, `fx_used`, `duty_rate`,
`min_price`, `ref_price`) — sobre um artigo **real em `draft`**, o mesmo que um `sales`
autenticado não vê. Os identificadores são sequenciais (`T-1001`…`T-1052`), logo enumeráveis;
não se enumerou, por razões óbvias.

**Causa:** as duas guardas do `compute_price` estão escritas como *«autenticado mas sem direito
a custos»* — `if auth.uid() is not null and not see_costs and p.status <> 'active' then return`
e `if auth.uid() is not null and not see_costs then` (o ramo que anula as 11 colunas). Para o
`anon`, `auth.uid()` é **NULL**, as duas condições dão falso, e **nem o portão de estado nem a
máscara disparam**. A guarda **falha aberta**.

**Porque só agora:** as 8 identidades da matriz do protocolo são todas autenticadas. O caso «sem
credencial» nunca foi uma identidade de teste — era o buraco entre duas linhas.

**Fechado no sintoma pela 0016** (revoga `EXECUTE` a `anon`/`PUBLIC`; `compute_price` passa a ser
concedida só a `authenticated`). **A guarda em si fica para a 0017**, para a falha-aberta não
voltar por outro caminho — e a 0017 varre o mesmo padrão em todas as funções, políticas e vistas.
**`anon` passa a 9.ª identidade permanente** do `scripts/smoke.py` e da matriz do
`docs/VERIFICATION-PROTOCOL.md`, por decisão do Pedro (2026-09-20).

**✅ EXPOSIÇÃO — FRENTE FECHADA 2026-09-20.** A janela existiu **com dados reais**, de 16/09
(carga do catálogo) a 20/09 13:13 (aplicação da 0016). **Não foi explorada.** Medição corrida
pelo Pedro com sudo, 20/09 entre 19:48 e 19:55:

| Verificação | Resultado |
|---|---|
| Pedidos a `/rest/v1/rpc/*`, por IP · dia · função · status | **Só dois IPs**: `185.200.244.100` (o próprio VPS — smoke, provas de paridade, sessões de agente; inclui os 403/401 de 20/09 em `fx_rate`/`branch_margin`/`override_value`, que são as asserções negativas novas) e `172.20.40.5` (o container `tmsi-app` a falar com o PostgREST pela rede docker — é por isso que os IPs do browser não aparecem por estes caminhos) |
| A mesma consulta **excluindo esses dois IPs** | **VAZIO.** Zero chamadas de terceiros a `compute_price`, `branch_margin`, `override_value`, `fx_rate` ou a qualquer outro RPC |
| Alargado a **todo** o `/rest/v1/` (tabelas e vistas, não só RPC — relevante porque `settings` tinha política aberta antes da 0016), mesmos IPs excluídos | **VAZIO** |
| Validação do método: top 15 de IPs de **todo** o `access.log` | Mostra IPs externos reais, com milhares de pedidos cada. Logo o nginx **regista a origem verdadeira** — a ausência de terceiros em `/rest/v1/` é **medição**, não artefacto de proxy ou de NAT |

**Fonte:** `access_log` único, `/var/log/nginx/access.log` (confirmado: `grep -rh access_log` em
`sites-enabled` e `nginx.conf` devolve só essa linha — o vhost não tem log próprio), partilhado
pelas apps do VPS. Retenção 06/09→20/09, que **cobre toda a janela de dados reais expostos**.
03–05/09 não tem logs, mas nessa altura só existiam dados fictícios.

**Limite da prova, a repetir sempre que esta conclusão for citada:** só vale para o que o
`access.log` do nginx regista e para a retenção de 14 dias; **o PostgREST não regista pedidos bem
sucedidos** (`PGRST_LOG_LEVEL` por omissão é `error`), logo não é fonte alternativa nem
corroboração. Ver item 66.

**Script re-executável:** `scripts/exposicao-rest.sh`, referenciado no protocolo como passo a
correr depois de qualquer achado de fronteira.

~~**65. O default-deny da 0016 não existe — `ALTER DEFAULT PRIVILEGES ... IN SCHEMA` não
retira o `PUBLIC`**~~ ✅ **diagnosticado e contornado 2026-09-20.** Achado ao verificar a 0017
depois de aplicada: `tmsi.is_trusted_db_session()` nasceu com `PUBLIC` no `EXECUTE`, apesar de a
0016 dizer ter instituído um default-deny.

**Mecanismo real** (medido em transacção revertida, e corrige um primeiro diagnóstico errado —
ver abaixo): os privilégios por omissão de uma função nova são o **built-in do PostgreSQL**, que
concede `EXECUTE` a `PUBLIC` e é **global** (não vive em `pg_default_acl`), **mais** o que as
entradas de `pg_default_acl` **acrescentam**. Uma entrada com âmbito de schema só sabe
acrescentar — **não consegue retirar** o que o built-in global concede. Logo
`ALTER DEFAULT PRIVILEGES ... IN SCHEMA tmsi REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` é **no-op
para qualquer dono**, e a 0016 usou `IN SCHEMA` nos dois comandos que escreveu.

**Teste que decide:** criar uma função em `tmsi` **como `postgres`** — o dono que *tem* entrada
por schema (`postgres|tmsi|f`) — e ver a ACL com que nasce:
`=X/postgres postgres=X/postgres authenticated=X/postgres service_role=X/postgres`. O `=X/` é
`PUBLIC`. Nasce aberta na mesma.

**Primeiro diagnóstico, errado, registado por honestidade:** escrevi que "só as defaults do
`postgres` fazem efeito nesta instância", inferindo-o de o `compute_price` não ter `PUBLIC`. Não
tem porque o `revoke execute on all functions in schema tmsi from public` da própria 0016 lho
tirou à mão — nada a ver com defaults. Inferi de um efeito que eu próprio tinha causado.

**O que funcionaria e não se faz:** um `ALTER DEFAULT PRIVILEGES` **sem** `IN SCHEMA` (global)
para o `supabase_admin` apanharia as funções que ele cria noutros schemas (`extensions`,
`graphql`, `realtime`, `public`) e partiria a instância. Decisão do Pedro, 2026-09-20: não fazer.

**Contorno, agora convenção escrita em `CLAUDE.md`:** toda a migração que crie ou recrie funções
termina com `REVOKE` explícito **e** com um bloco `DO` que levanta excepção se sobrar alguma
função de `tmsi` com `EXECUTE` a `PUBLIC` ou a `anon` — **a migração falha antes do `COMMIT`**.
Verificável, ao contrário de uma regra que se tem de lembrar. O `scripts/smoke.py` (bloco DD)
tem a asserção equivalente, pelo que uma regressão parte também a suite.

**Estado:** `is_trusted_db_session()` corrigida com `revoke` explícito (no ficheiro da 0017);
varrimento confirma **zero** funções de `tmsi` com `PUBLIC` ou `anon`.

~~**66. Retenção do `access.log` é de 14 dias**~~ ✅ **fechado 2026-09-20 — `rotate 90` aplicado
pelo Pedro e confirmado por medição** (`grep rotate /etc/logrotate.d/nginx` → `rotate 90`). Texto
original do achado, para contexto: — **REGISTADO 2026-09-20**, achado ao fechar a exposição do item 64. O `logrotate` do nginx está em
`daily`/`rotate 14`, e o `access.log` é a **única** fonte capaz de responder a "alguém explorou
isto?" — o PostgREST não regista pedidos bem sucedidos (`PGRST_LOG_LEVEL` por omissão é `error`)
e não há mais nada à frente. Catorze dias significa que **um achado de fronteira com mais de duas
semanas já não é investigável**: foi exactamente por pouco que a janela de 16→20/09 ficou coberta,
e o período 03–05/09 já está perdido (sem consequência, só havia dados fictícios).

**Proposta, medida:** passar a `rotate 90`. Custo em disco, calculado a partir dos ficheiros
rodados reais — média de **90 KB/dia** comprimido (mínimo 46, máximo 125): hoje 1,14 MB em 13
ficheiros; a 90 dias, **~7,9 MB** (pior caso ~11 MB). **Acrescento de ~7 MB** num disco com 13 GB
livres. O `delaycompress` mantém um único ficheiro não comprimido (~2 MB), inalterado.

Comando exacto, para o Pedro correr:
```
sudo sed -i 's/^\(\s*\)rotate 14$/\1rotate 90/' /etc/logrotate.d/nginx
sudo logrotate -d /etc/logrotate.d/nginx 2>&1 | head -20   # ensaio, não roda nada
```
O `-d` é ensaio (debug): mostra o que faria sem mexer em ficheiro nenhum. Confirmar que diz
`rotate 90` e que não acusa erro de sintaxe. A alteração só produz efeito na rotação seguinte;
os ficheiros já apagados não voltam.

~~**67. Regra do `Alert` para serviços de margem plana — decisão do Pedro**~~ ✅ **FECHADO
2026-09-24** (revisão `392770f`). Decisão do Pedro: (a) `item_type` em (`service`, `option`) não é
classificado — célula **vazia**, nem `critical` nem `ok`, no `/prices`, no export e em
`/products/[id]` (`lib/alert.ts`; o `compute_price` não muda); (b) a coluna `Alert` não sai nos
exports dos papéis sem custos — já não saía, ficou fixado. Smoke `JJ`. Texto original: — **REGISTADO
2026-09-20**, ao activar os três CONDATLINK. As **15 linhas** de `T-1050`/`T-1051`/`T-1052`
aparecem com `alert = 'critical'`, e **desde hoje isso é visível no export** — antes não era,
porque nada estava `active`.

**Não é um defeito do motor.** O `compute_price` classifica `critical` quando
`margin < settings.margin_min` (0,15), e estes três têm **margem 0 por decisão** — é a regra
plana do item 30, que o Pedro confirmou a 2026-09-10: opções e serviços não têm margem própria,
ela está no preço do artigo-pai. O alerta está a dizer a verdade sobre um número que foi
escolhido.

**O problema é de leitura, não de cálculo:** uma lista de preços que circula fora da empresa
mostra `critical` em todas as linhas de serviço, e quem a lê não sabe que é intencional.

**Três saídas, e a escolha é do Pedro:**
1. A regra de alerta **isenta** `item_type` em (`service`, `option`) — o motor deixa de marcar o
   que foi decidido ser assim. Migração, toca `compute_price`.
2. A coluna `Alert` **sai** do ficheiro que circula, e fica só no ecrã interno. Alteração de app,
   sem migração.
3. **Fica como está**, e documenta-se no rodapé do export o que `critical` significa para um
   serviço.

Sem urgência operacional — não afecta preço nenhum. Mas afecta a primeira impressão de quem
receber o ficheiro, e por isso não deve chegar à apresentação à equipa por decidir.

~~**68. Regressão em produção: o export de `/prices` pedia uma coluna que a vista não tem**~~
✅ **FECHADO 2026-09-23** — corrigido, deploy feito (revisão `24c8a70`, digest `83c4a4f7…`) e
**confirmado pelo Pedro no browser**: o export como `sales.sa` abre, 46 linhas, só SA, sem colunas
de custo, com os artigos de origem SA. A causa raiz fica registada abaixo, e as duas asserções do
bloco `FF` ficam permanentes. Texto original do achado: — **APANHADO PELO PEDRO no browser, 2026-09-23**, dois dias depois de activar o catálogo. O export
como `sales.test` devolvia `{"error":"column v_selling_prices.scope_type does not exist"}`; o
ecrã e a vista de impressão estavam correctos.

**Causa, confirmada e não deduzida.** A correcção do ⚠️11 (bloco C de 2026-09-20) acrescentou
`scope_type` ao `select` **dos dois ramos** da rota, para o rótulo do âmbito passar a descrever o
conteúdo do ficheiro. Mas as duas vistas não têm as mesmas colunas:

| | tem `scope_type`? |
|---|---|
| `tmsi.v_branch_prices` (ramo dos papéis **com** custos) | **sim** |
| `tmsi.v_selling_prices` (ramo dos papéis **sem** custos) | **não** — projecta 11 colunas e essa não está lá, apesar de ler de `v_branch_prices` |

Logo o ramo `finance`/`admin` funcionava e o ramo `sales`/`agent`/`logistics` rebentava por
inteiro. O ficheiro não saía de todo — não era degradação, era falha.

**Porque escapou a tudo o que existia:** o ecrã `/prices` e a vista de impressão escolhem a vista
pela mesma condição mas **não pedem `scope_type`**; o TypeScript não conhece o schema (o tipo
`SellingPriceRow` até declarava o campo, o que é uma mentira que o compilador aceita); e
**nenhuma asserção atravessava a rota de export** — a fronteira de custo no export está marcada
como "por re-provar" desde sempre, e até 2026-09-20 nem era exercível, porque não havia artigos
`active`. A activação tornou-a exercível e a regressão apareceu no mesmo dia.

**Correcção (sem migração).** A rota deixa de depender de uma coluna que só uma das vistas tem. O
sinal de "há linhas de canal" passa a ser o mesmo que o ecrã `/prices` já usa: uma linha é de
canal quando o seu `branch_id` é o id de um canal (`tmsi.channels`, cuja RLS já limita ao que o
utilizador vê). O ramo com custos continua a usar `scope_type`, que lá existe.

**Prevenção — bloco `FF` do smoke, duas asserções:**
1. **Contrato estático:** extrai do código os pares `.from('X').select('a,b,c')` e confirma cada
   coluna contra `information_schema`. Cobre **252 colunas em 28 objectos** — a app inteira, não
   só o export. **Provado a falhar** com o defeito reintroduzido, apontando
   `route.ts:157 v_selling_prices.scope_type`.
2. **Travessia real:** emite exactamente o `select` de cada ramo contra o PostgREST, com papel
   real (`finance` para o ramo com custos, `logistics` para o sem), e exige `200`. É onde o
   defeito se manifestava — o erro vinha do PostgREST, não do compilador.

**O que estas duas não cobrem, e continua a ser passo de browser:** o invólucro Next.js — cookies
de sessão, geração do `.xlsx`, cabeçalhos de download. A regra do projecto
(`~/atelier-vps/CLAUDE.md` §4, escrita depois de duas tentativas abandonadas) manda que provas por
sessão de browser fiquem para o Pedro. **Decisão em aberto:** se vale a pena um teste de
integração com sessão real — hoje não existe, e é por isso que esta regressão chegou a produção.

~~**69. `/prices` calcula o catálogo inteiro a cada pedido — o filtro de âmbito não desce**~~
✅ **FECHADO 2026-09-23 pela migração 0020.** A vista passou a projectar `b.id`/`ch.id` — o id da
tabela que conduz o `LATERAL` — em vez de `c.branch_id`, a coluna de saída da função. O filtro
desce agora para o scan de `branches`/`channels`, **antes** de `compute_price` correr.

**Medido, antes → depois (chamadas a `compute_price`, que é contagem estrutural e não depende da
carga do host):**

| Pedido | Chamadas | Buffers | ms (com sessão de agente aberta) |
|---|---|---|---|
| APAC, `finance` | **283 → 54** | 12 068 → 1 721 | 730 → **49** |
| SA, `finance` | **283 → 61** | 10 215 → 1 923 | 792 → 138 |
| APAC, `agent` | **230 → 54** | 8 056 → 1 739 | 919 → 328 |
| SA, `sales` | **230 → 61** | 6 453 → 2 011 | 1 375 → 374 |
| `v_selling_prices` SA, `sales` | **230 → 61** | 8 462 → 2 574 | 1 764 → 326 |
| "All branches" | 283 → 283 | *(inalterado)* | — |

`v_selling_prices` **herda** o pushdown, verificado e não assumido — é a vista que `sales`/`agent`
usam, e o item 68 mostrou como é fácil esquecê-la.

**Impressão digital IDÊNTICA nas 9 identidades** — nenhum valor mudou, que era a condição de
aceitação. Asserção `HH` do smoke fixa a invariante por contagem de `loops` no plano, não por
tempo (um tempo dependeria da carga; uma contagem é determinística) — e **provou falhar** contra
o estado anterior: *«compute_price × 285 para 54 linhas devolvidas — o filtro NÃO está a descer»*.

**⚠️ Erro cometido e corrigido dentro da própria migração:** o primeiro `CREATE OR REPLACE VIEW`
**perdeu o `security_invoker=true`**, porque esse comando reinicia as `reloptions`. A vista passou
a correr como o dono (`postgres`, com `BYPASSRLS`) e a RLS da `tmsi.products` deixou de ser
aplicada — medido: o `Filter` com `products_visible()` desapareceu do plano. **Não houve fuga**
(as contagens por papel mantiveram-se, porque as guardas internas do `compute_price` são a
restrição que vincula), mas a primeira das duas camadas tinha desaparecido. Reposto, a cláusula
está agora no ficheiro, e o bloco `HH` passou a verificar as `reloptions`.

**A lição, que é a que fica:** o ensaio comparava impressões digitais e elas ficaram **idênticas**
— o `compute_price` mascarava a diferença. **Uma prova que só olha para o RESULTADO não vê uma
mudança em COMO o resultado é protegido.** Texto original do diagnóstico: — **DIAGNOSTICADO 2026-09-23**, a partir de `/prices?branch=APAC` a dar
`canceling statement due to statement timeout` (8 s no `authenticated`) como `finance.test`.

**A causa, lida no plano e não suposta.** `tmsi.v_branch_prices` é um `UNION ALL` de dois braços,
cada um um `CROSS JOIN LATERAL tmsi.compute_price(...)`, e projecta **`c.branch_id` — a coluna de
SAÍDA da função**. O filtro da app (`.eq('branch_id','APAC')`) só pode ser aplicado **depois** de
a função correr, porque o Postgres não tem forma de saber que
`compute_price(_, 'branch', b.id).branch_id = b.id`. No plano isto aparece exactamente assim:

```
->  Function Scan on compute_price c (actual rows=0 loops=229)
      Filter: (branch_id = 'APAC'::text)
      Buffers: shared hit=9214
```

**229 execuções de `compute_price` para produzir ZERO linhas** — `APAC` é um canal, nunca pode
aparecer como `branch_id` no braço de filial. São **76% dos buffers do pedido** gastos em trabalho
que é deitado fora por construção.

**Medições (host reiniciado; `si`/`so` não estavam a zero — a própria sessão de agente ocupava
303 MB, e isso está dito ao lado de cada número):**

| Pedido | Devolve | Tempo | Buffers | Chamadas a `compute_price` |
|---|---|---|---|---|
| APAC, `finance` | 54 | 1847 ms | 12 078 | 229 desperdiçadas + 54 úteis |
| SA, `finance` | 61 | 1417 ms | 10 215 | 229 (61 úteis) + 54 desperdiçadas |
| APAC, `agent.apac` | 46 | 1880 ms | 8 056 | 184 desperdiçadas + 46 úteis |
| SA, `sales.sa` | 46 | 1065 ms | 6 453 | 184 + 46, **todas** desperdiçadas menos as 46 |

**`compute_price` isolado, um artigo (`T-1044`), a quente, com controlo repetido:**

| Âmbito | Buffers | Tempo |
|---|---|---|
| TBM (a própria origem) | 31 | 5,3 ms · **4,1 ms** (controlo) |
| SA (filial não-origem, cadeia com fee interco) | 32 | 11,4 ms |
| **APAC (canal)** | **121** | 9,1 ms |

O canal custa **~4× o I/O** de uma filial de origem por chamada — é real, mas **não é a causa
dominante**. A causa dominante é o número de chamadas: **283 por pedido, filtrado ou não.**

**O que foi descartado por medição, não por opinião:**
- `override_value` **tem** o índice certo — `(product_id, scope_type, scope_id, kind)`. Não é aí.
- Todas as funções do caminho quente são `STABLE` (só `round_up_to` é `IMMUTABLE`). Correcto.
- `is_trusted_db_session` (0017) é avaliada **uma vez por chamada**, como ficou desenhada — o
  `v_api_caller` aguentou.
- `products_visible` após a 0019 faz `Seq Scan` sobre `products`, mas são **62 linhas**: 530
  buffers, 4% do total. O `||` da origem não impede nada que importe a esta escala.
- Cada `compute_price` chama `override_value` **6×** e `fx_rate` **3×** — 9 sub-chamadas × 283 =
  ~2500 procuras por índice por carregamento de página. É muito, mas é consequência do número de
  chamadas, não causa independente.

**É patologia ou volume?** **As duas, e a patologia é a que interessa:** o custo é
`O(artigos × âmbitos)` **e filtrar não o reduz em nada**. Pedir uma filial custa exactamente o
mesmo que pedir todas. Com os 46 artigos activos de hoje são 283 chamadas; o catálogo a crescer
multiplica-as linearmente, e o `statement_timeout` de 8 s passa a ser atingido por mais pedidos.

⚠️ **Sobre a comparação com o item 14/28 (255 ms para 163 artigos):** essa linha base foi medida
sobre **outra forma de pedido** — não é `v_branch_prices` com `compute_price` por linha. Dizer
"10× mais lento" seria comparar coisas diferentes. O que se pode afirmar com o que está medido é
o que está acima.

**Facto que habilita a correcção, verificado nas 283 linhas:** `c.branch_id` é **sempre** igual ao
âmbito que conduz o `LATERAL` (`b.id` ou `ch.id`) — zero excepções. Logo projectar o id da tabela
que conduz, em vez do da função, é semanticamente idêntico **e deixa o filtro descer antes do
`LATERAL`**.

**Estado: diagnóstico fechado, correcção por decidir pelo Pedro.** Três patamares propostos, com
custo, ganho e o que arrastam — ver a resposta da sessão de 2026-09-23. Invariante de qualquer
uma: **impressão digital de `v_branch_prices` IDÊNTICA por papel** — é só desempenho; se mudar, é
defeito.

**71. `price_cache` — preços materializados, condicionado** — **PROPOSTO 2026-09-23**, e
**deliberadamente não feito agora**. A 0020 resolveu o pedido **filtrado**; o pedido **sem
filtro** ("All branches", e os exports) continua a executar uma chamada a `compute_price` por
artigo × âmbito, porque aí não há filtro para descer. É custo legítimo — está a pedir-se tudo —
mas cresce linearmente com o catálogo.

**Gatilhos propostos, calculados dos números de hoje.** Hoje: 62 artigos → **285 chamadas**,
~11 300 buffers. As chamadas escalam a ≈4,6 por artigo, e o `statement_timeout` do
`authenticated` é **8 s**.

- **X = 4 s** para o "All branches" ou um export, **com o host calmo e sem sessões de agente**.
  Metade do timeout: além disso, um dia mau ou um host ocupado faz o resto do caminho sozinho.
- **N = 200 artigos reais.** A ≈4,6 chamadas por artigo são ~920 chamadas, **3,2× as de hoje** —
  o ponto em que o "All branches" se aproxima de X por volume, não por acidente.

**O que seria:** tabela de preços calculados, refrescada por *trigger* quando muda um input
(EXW, FX, margem, override, transporte, direito). **Com o smoke a comparar `cache ≡ motor`** —
sem essa asserção, uma cache que diverge em silêncio é pior do que não a ter, porque passa a ser
a fonte de preços que ninguém verifica. Migração pesada, arrasta execução do protocolo.

**Não fazer antes de um dos gatilhos.** Hoje seria construir uma cache para um problema que uma
projecção resolveu.

~~**72. `/prices` pede `select('*')` — 20 colunas onde o ecrã mostra 8**~~ ✅ **FECHADO
2026-09-23** — as duas vistas passam a ser pedidas com a lista explícita de colunas, no ecrã e nos
dois exports. Asserção `II` do smoke falha se o `select('*')` voltar. Texto original: — **2026-09-23**, lote de
apresentação. `app/src/app/prices/page.tsx:57` faz `.from(viewName).select('*')`, e a vista tem
~20 colunas. Com 283 linhas são ~5 700 valores serializados pelo PostgREST e enviados, para o
ecrã usar menos de metade.

**Não é a causa do item 69 e não a teria resolvido** — a computação acontece na mesma, e este
custo é de transferência e serialização. Mas é desperdício mensurável e trivial de corrigir:
listar as colunas mostradas, como o export já faz. Fica com o lote de apresentação, junto com o
rótulo "All branches and channels" (⚠️11) e a falta de coluna/filtro de estado no `/prices`.

**Nota de método (item 28, 2026-09-06):** foi exactamente este tipo de diferença — pedir todas as
colunas em vez das que a app pede — que fez três medições seguidas medirem a coisa errada, com
8-9× de desvio. Ao medir o `/prices`, confirmar sempre que o pedido é bit-a-bit o que a app envia.

**73. Latência fixa por página: oito pedidos ao backend, e o dado é 18% deles** — **MEDIDO
2026-09-23** com a instrumentação de tempos do nginx (`tmsi-timing.log`), sobre os cliques reais do
Pedro em `/prices?branch=APAC` como `finance.test`.

**A anatomia de um carregamento** (janela calma, antes da tempestade de *prefetch*):

| # | Pedido | `urt` | Necessário? |
|---|---|---|---|
| 1 | `GET /auth/v1/user` (middleware) | 0,141 s | sim |
| 2 | `GET /rest/v1/profiles` (middleware) | 0,040 s | sim |
| 3 | `GET /rest/v1/v_current_branding` (layout) | 0,089 s | sim |
| 4 | **`GET /auth/v1/user` (página)** | **0,212 s** | **duplicado** |
| 5 | `POST /rest/v1/rpc/can_read_costs` | 0,036 s | sim |
| 6 | **`GET /rest/v1/v_branch_prices`** | **0,165 s** | **é o dado** |
| 7 | `GET /rest/v1/branches` | 0,005 s | sim |
| 8 | `GET /rest/v1/channels` | 0,005 s | sim |
| | **soma** | **0,693 s** | página: **0,911 s** (cobre 76%) |

**A consulta de dados vale 18% da página. As duas chamadas ao GoTrue valem o dobro dela.**

**Três causas, todas de app, todas corrigidas sem migração:**

1. **Seis `await` em cadeia** na página — `getUser`, `can_read_costs`, a consulta, `branches`,
   `channels`, `branding` — quando só a consulta depende do `can_read_costs` (que decide a
   vista). Passaram a `Promise.all`.
2. **Tempestade de *prefetch*.** Cada `<Link>` de filtro era pré-carregado pelo Next.js, e cada
   pré-carregamento é um **render completo no servidor**, com o seu próprio
   `auth/v1/user` + `profiles` + `branding`. Quatro links = **12 pedidos extra por visita**, e
   concorrentes: medido, o `/auth/v1/user` passou de **0,141 s para 1,232 s** por fila de espera
   no GoTrue. A janela do segundo clique mostra **27 pedidos ao backend**, contra os 8 de um
   carregamento limpo. `prefetch={false}` nos links de filtro — são clicados um de cada vez.
3. **`getBranding()` chamado duas vezes por render** (layout e página) → dois
   `v_current_branding`. `cache()` do React dedupe-os dentro da mesma passagem.

**O que fica por decidir (item 74):** o `/auth/v1/user` **duplicado**. O middleware já validou a
sessão; a página chama outra vez. As duas saídas têm custo próprio e a escolha é do Pedro.

**2026-09-24 — a causa 2 não estava fechada:** `prefetch={false}` só desliga o pré-carregamento
por viewport, e o de **hover** continuava (log de 24/09, 10:10). Os filtros passaram a
`<FilterButton>` (`router.push` ao clique, sem `<Link>`); smoke `II` actualizado.

**74. O `/auth/v1/user` duplicado por pedido — decisão pendente** — **2026-09-23**. O middleware
corre `auth.getUser()` em **todos** os pedidos (matcher `/((?!_next/static|…))`) e a página corre
outra vez. São dois *round-trips* ao GoTrue por carregamento, e o GoTrue é o serviço que mais
sofre com concorrência (medido: 0,141 s isolado, 1,232 s sob a tempestade de *prefetch*).

**Duas saídas, ambas com custo:**

1. **O middleware passa a identidade num cabeçalho de pedido** (`x-tmsi-user`), que a página lê
   por `headers()`. Poupa um *round-trip* ao GoTrue por pedido. **Risco:** implica reconstruir o
   `NextResponse` com cabeçalhos de pedido novos, e é exactamente aí que vivem os *cookies* de
   refrescamento da sessão do `@supabase/ssr` — mexer mal ali parte o login de forma
   intermitente. E o cabeçalho tem de ser **sobrescrito incondicionalmente** pelo middleware, ou
   um cliente pode forjá-lo.
2. **Uma função nova na BD**, `tmsi.me()`, devolvendo o perfil de quem chama (`auth.uid()`
   resolvido do lado do servidor) — a página deixa de precisar do `getUser()` de todo, e ganha o
   nome no mesmo pedido. **Custo:** é migração, arrasta execução do protocolo, e acrescenta
   superfície RPC (que o `CLAUDE.md` manda justificar com um chamador — aqui há-o).

**Nesta sessão não se fez nenhuma das duas.** O `getUser()` da página deixou de estar no caminho
crítico (corre dentro do `Promise.all`, em paralelo com a consulta de preços, que é mais lenta),
logo já não custa relógio — mas continua a ser uma chamada ao GoTrue por carregamento.

**75. Nome do artigo na consulta de preços — precisa de migração** — **MEDIDO 2026-09-24**, e
as duas vias sem migração **não existem**:

| Via | Resultado, medido |
|---|---|
| `v_branch_prices` já expor `name`/`category` | **não expõe** — 20 colunas, nenhuma delas |
| *Embed* do PostgREST, `products(name,category_id)` | **`http_400`**: `Could not find a relationship between 'v_branch_prices' and 'products' in the schema cache` |

O *embed* precisa de uma relação inferível. A vista é um `UNION ALL` de dois
`CROSS JOIN LATERAL` sobre uma função — **não há chave estrangeira para detectar**, e declarar
uma relação computada é criar objectos na BD, ou seja migração.

**A RLS não é o obstáculo:** a 0003 concede a `authenticated` exactamente `name` e `category_id`
entre as colunas seguras de `products`, logo `sales` e `agent` podiam lê-las. É só a vista não as
projectar.

**A migração seria pequena:** `p.name` e `p.category_id` na projecção de cada braço, com o alias
`p` já em âmbito. Arrasta o que a 0020 ensinou — `WITH (security_invoker = true)` obrigatório,
guarda das `reloptions`, execução do protocolo. **Impressão digital idêntica**, que é a condição
de aceitação: só se acrescentam colunas.

**Custo de não fazer:** um pedido por carregamento (o `v_products`, um dos oito). Barato — tabela
e RLS, sem `compute_price`.

**76. O `/auth/v1/user` duplicado: a via do middleware foi avaliada e REJEITADA** — **2026-09-24**,
substitui a opção 1 do item 74.

Passar a identidade por cabeçalho obriga a construir o `NextResponse` com
`{ request: { headers } }` em **dois** sítios: na criação inicial **e dentro do `setAll`** — que é
onde o `@supabase/ssr` reconstrói a resposta ao refrescar o token.

**O modo de falha é o pior possível:** injectar o cabeçalho só na construção inicial fá-lo
**desaparecer exactamente nos pedidos em que há refresh de sessão**. Não falha nos testes, não
falha no smoke, falha de vez em quando a um utilizador real — e o sintoma seria um logout
inexplicável. E como o `getUser()` só corre depois de o cliente estar construído, injectar o valor
exigiria reconstruir a resposta uma terceira vez e reaplicar à mão os cookies que o `setAll` já
tinha posto: reimplementar o fluxo de refresh.

**O ganho não o justifica.** São 2 pedidos de 8, e em **tempo de relógio ~zero** — desde
2026-09-23 esses dois correm dentro do `Promise.all`, em paralelo com a consulta de preços, que é
mais lenta. O ganho é de **carga** no GoTrue (0,141 s isolado, **1,232 s sob concorrência**), que
é real mas não paga o risco.

**Fica a opção 2 do item 74:** `tmsi.me()`, uma função que devolve o perfil de quem chama. Não
toca no middleware, e substitui `getUser()` **e** o `profiles` da página por uma chamada — **8 →
7**. É migração.

**77. O `/privacy` diz que os registos de acesso ficam 14 dias; ficam 90** — **REGISTADO
2026-09-24**, ao escrever as respostas da demo. O item 66 passou o `logrotate` a `rotate 90` a
20/09, e a página (`app/src/app/privacy/page.tsx`, «access logs (14 days)») e o
`docs/DATA-PROCESSING-NOTICE.md` não foram actualizados. Uma nota de tratamento de dados que
subdeclara a retenção é o erro no sentido errado. Correcção de texto, um commit de app. O
`DEMO-SCRIPT.md` avisa para dizer 90 de viva voz até lá.

**78. A guarda de documentos ignora ficheiros apagados e renomeados** — **REGISTADO
2026-09-24.** `scripts/hooks/commit-msg` só avalia entradas `M` do `git diff --cached
--name-status`: um `git rm docs/X.md`, ou um `git mv` que substitua um ficheiro por outro,
**passam sem verificação** — e perder um documento inteiro é o caso extremo do que a guarda existe
para apanhar. Visto ao promover o roadmap (a proposta saiu como `D`). Proposta: tratar `D` como
perda de 100%, e `R` comparando com o conteúdo do destino que existia em `HEAD`. Acrescentar ao
bloco `GG` o caso do `git rm`.

**79. `/products/[id]` desenha a coluna `Alert` a todos os papéis** — **REGISTADO 2026-09-24**,
cosmético. Custo e margem são condicionais a `canReadCosts`; o `Alert` não. **Não é fuga**
(medido por claims: `compute_price` devolve 0 alertas a `sales` e a `logistics`, 46 linhas cada),
mas é uma coluna sempre vazia para os papéis sem custos — e é o papel que vai ver a app na demo.
Um `canReadCosts &&` no `<th>` e no `<td>`.

**80. O aviso operacional é admin-only na app, não na BD** — **REGISTADO 2026-09-24.** A política
`config_write` de `tmsi.settings` deixa **admin e finance** escrever qualquer chave. O
`setPriceNotice`/`updateSetting` recusam a quem não é admin, mas um `finance` com o token dele e um
pedido directo ao PostgREST consegue desligar o aviso. Risco baixo (o finance já escreve a política
de margem, que é mais grave), mas é a distância entre o pedido («admin-only») e o que existe.
Fechar na BD = uma política por chave, ou `operational_price_notice` fora de `settings` — migração.
**Decisão do Pedro.**

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

**Correcção de estado (2026-09-19, achado da auditoria ⚠️2):** o parágrafo acima descreve a
decisão tomada *no momento da investigação* e ficou desactualizado no mesmo dia — **a correcção
acabou por ser implementada, ainda a 2026-09-16, pela migração 0014**
(`0014_audit_log_content_boundary.sql:50-62`): `revoke select` ao nível da tabela em
`tmsi.audit_log`, re-`grant` das 6 colunas seguras, e vista `tmsi.v_audit_log` a mascarar
`old_row`/`new_row` das linhas de `profiles` para quem não é `admin`. Aplicada em produção
(sondagem positiva a 19/09) e documentada no protocolo (`docs/VERIFICATION-PROTOCOL.md:1252`).
**Item 47 dá-se por fechado** pelo ângulo de privacidade. Falta-lhe prova automatizada: a 0014
não tem nenhuma asserção no smoke — ver o bloco novo do item 56.

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
é fictício, zero linhas reais). **[Verdadeiro em 2026-09-16, falso a partir do mesmo dia: a
carga do item 51 entrou nessa noite. Desde então `tmsi.products` tem 62 linhas, 49 delas
catálogo real `T-1001`–`T-1052`. A separação seed/real mantém-se — os 13 fictícios continuam
`inactive`/`discontinued` e a gama de identificadores não colide. Nota da auditoria de
2026-09-19, ⚠️7.]** Achado extra: 3 `price_overrides` residuais de sessões
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
**2026-09-24:** enquanto estiver aberto, a app mostra «Prices are operational, pending customs-duty
basis confirmation» no `/prices`, na impressão e no rodapé do export
(`tmsi.settings.operational_price_notice`, admin-only em `/config`, ausente = ligado). **Fecha
quando o despachante responder — e o admin desliga o aviso.**

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
