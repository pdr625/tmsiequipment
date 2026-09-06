# STATE.md — TMSI Equipment Price Listing (infra)

Documento vivo do estado real da infra deste projecto. Sem segredos — só *onde* eles vivem.
Actualizado por toda a sessão que altere o estado do TMSI (ver secção 6).

**Etapa actual: item 14 — diagnóstico do desempenho — ✅ DIAGNOSTICADO 2026-09-06 (a
medição de 06/09 do item 26 é INVÁLIDA, não apagada — ver secção própria abaixo).**
Veredicto: **H2 confirmada, H1 refutada** — pressão de memória/swap deste host, não uma
regressão de código da 0007. Nenhuma correcção executada nesta sessão, por desenho. Próximo,
por `docs/BACKLOG.md` e decisão do Pedro: qual das propostas seguir (ou nenhuma) · CPI/EOP ·
renome de infra na E6. Ordem e critérios de saída de cada etapa: `docs/ROADMAP.md`. E0, E1,
E2, E3 (i1–i10), E4, E5-VPS e as migrações 0003/0004/0005/0006/0007/0008 estão fechadas.

## Item 14 — Diagnóstico do desempenho (medição inválida de 06/09) — ✅ DIAGNOSTICADO 2026-09-06

**Contexto:** a medição do item 26 (70 artigos = 3,50/3,90/7,25 s) era logicamente
impossível como medição de *volume* — menos linhas (70) do que a de 05/09 (163) a custar
5–10× mais é o sinal de que outra coisa mandava, não o número de produtos. Esta sessão
**não corrigiu nada** (restrição 1 do prompt) — só diagnosticou.

**F0 — reconstituição, contra o git e o `docs/STATE.md`, não de memória:** a medição de
05/09 (`47ff96a`, 2026-09-05T22:46) é **anterior** à migração 0007 (`783c5bb`,
2026-09-06T12:56) — corre contra migrações 0001-0006. A medição de 06/09 (dentro da sessão
do item 26) corre contra 0001-0008 — 0007 já tinha versionado `interco_fees`/
`transport_tiers`/`customs_rates`/`margin_grids` e mudado as procuras internas do
`compute_price()`; a 0008 acrescentou `tmsi.branding`/`tmsi.branding_logos`, sem relação
nenhuma com as vistas medidas. **Os dois conjuntos não são directamente comparáveis** —
schema diferente — mas isso por si só não explica uma escala 5–10× pior para *menos*
linhas. As fixtures também diferiam em desenho (150 produtos T-9200..T-9349 em 05/09 vs.
57 T-9200..T-9256 em 06/09), mas ambas seguem o mesmo padrão (draft, HS reais, 4
filiais/moedas, 2 filiais por produto) — não é a causa provável.

**F1 — remedição limpa, 5 execuções por ponto (descartando a 1.ª, fria), carga registada
antes/depois de cada série, dentro de `BEGIN`/`ROLLBACK`, sessão `authenticated` real
(claims de `finance`), schema de hoje (0001-0008):**

| Volume | `v_products` mediana (intervalo) | `v_branch_prices` mediana (intervalo) | `load average` antes→depois |
|---|---|---|---|
| 13 (real) | **309 ms** (212–432 ms) | **50 ms** (47–92 ms) | 1,47 → 1,43 |
| 70 (+57 fixture) | **3.382 ms** (2.559–4.453 ms) | **309 ms** (262–400 ms) | 1,10 → 2,35 |
| 163 (+150 fixture) | **10.555 ms** (8.501–13.084 ms) | **1.412 ms** (921–1.982 ms) | 1,42 → 3,80 |

Comparação com 05/09 (pré-0007, sem carga registada nessa sessão): 13→148 ms, 163→717 ms
(`v_products`); 33→159 ms, 333→909 ms (`v_branch_prices`, contagem de pares produto×filial,
não de produtos). **A 13 linhas os números de hoje são normais** (309 ms, mesma ordem de
grandeza que 148 ms) — a app não está geralmente mais lenta. **A escala deixa de ser linear
a partir de 70**, e piora ainda mais a 163 — um padrão super-linear, não o crescimento
sub-linear amortizado que 05/09 tinha mostrado.

**F2 — a prova directa, não uma inferência:** `EXPLAIN (ANALYZE, BUFFERS)` a `v_products`
com 70 linhas mostrou `Buffers: shared hit=6724` — **zero leituras reais de disco**, os
dados já estavam em cache do Postgres. Ao mesmo tempo, `vmstat 1` corrido **durante** essa
mesma consulta mostrou actividade de swap real e substancial: `si` (swap-in) até
**9.608 KB/s**, `so` (swap-out) até **12.892 KB/s**, `bi`/`bo` (I/O de blocos) na ordem dos
12.000–24.000 KB/s — o sistema operativo estava activamente a paginar memória para dentro e
fora do swap **durante** a consulta, não o Postgres a ler do disco. Isto é o mecanismo:
pressão de memória do host, não um custo por linha da própria função. **`tmsi.v_products`
nem sequer chama `compute_price()`** — usa só `tmsi.products_visible()`
(`primary_branch`/`sold_in`/`status`, `has_role()` × 3 chamadas por linha via curto-
circuito do `OR`) — uma função que a 0007 **nunca tocou**. Isto por si só já refuta H1 para
metade do problema (a mais grave das duas): não há caminho nenhum entre a 0007 e este
custo. `tmsi.user_roles` tem 7 linhas e um índice próprio (`user_roles_uniq`) — não é uma
tabela a crescer nem sem índice.

Para `v_branch_prices` (que chama `compute_price()`, tocada pela 0007): a escala observada
(50→309→1.412 ms, para uma contagem de pares produto×filial a crescer de 33→147→~333) é
grosso modo proporcional ao volume, não desproporcional como em `v_products` — consistente
com a MESMA pressão ambiente a amplificar um custo que continua linear, não com uma
regressão nova introduzida pelas procuras versionadas da 0007 (que usam os índices de
procura próprios criados nessa migração — `transport_tiers_lookup_idx` e equivalentes,
nunca um varrimento de histórico completo). Uma chamada isolada a
`compute_price('T-0002','SA')` mostrou `Buffers: shared hit=2462`, também sem leitura real
de disco. **Não foi feita a comparação completa contra um ambiente efémero pré-0007**
(restrição 6 do prompt) — considerada desnecessária face à evidência directa já obtida
(`v_products`, que nem usa `compute_price()`, já mostra o mesmo padrão e é o caso mais
grave); fica disponível se o Pedro quiser uma certeza absoluta sobre a metade do
`compute_price()`.

**Achado estrutural, não pontual, registado com honestidade:** a própria sessão de
diagnóstico (e a do item 26 antes dela) consome, sozinha, uma fracção substancial da RAM
deste VPS — `top` confirmou o processo `claude` desta sessão a usar **477 MB (48% dos 961
MB totais)** durante as medições, para além dos containers da app e de mais três outras
aplicações (Oikos, Itinera, Vaultwarden) a partilhar o mesmo host de 1 vCPU. Um host
"em repouso" no sentido literal da restrição 2 do prompt (nenhum build/backup/timer a
correr) foi confirmado antes de cada série — mas a PRÓPRIA sessão que mede nunca deixa de
contribuir para a pressão de memória, por ser ela própria um processo pesado neste mesmo
host. A carga subiu progressivamente ao longo das três séries (1,43→2,35→3,80) — consistente
com pressão cumulativa (mais swap gera mais swap), não com um pico isolado e independente.
**Isto explica também porque a medição de 05/09 (uma sessão mais curta, sem uma migração de
branding com upload de logo, sem o histórico desta conversa) partiu de uma base mais
folgada** — não porque o código fosse mais rápido então, mas porque havia mais memória
disponível nesse momento específico.

**F3 — impacto ponta-a-ponta:** `/prices` e uma página de produto exigem sessão real por
cookie (`@supabase/ssr`) — a mesma limitação já registada nas adendas i9/i10/item 26,
confirmada mais uma vez como não contornável por `curl`. Medido em alternativa:
`/api/health` (rota pública, sem consulta à BD) manteve-se rápido (74–386 ms) mesmo com
`load average` ainda elevado (2,09) — confirma que o **contentor da app não está,
por si, a sofrer** (limite de 192 MB, muito abaixo da pressão que a BD sofre); o gargalo
é inteiramente do lado do Postgres/host. Um pedido real a `/prices`/produto nestas condições
experimentaria, no mínimo, o tempo de BD medido acima mais uma sobrecarga modesta de
Next.js/rede (a mesma ordem de grandeza do `/api/health`, dezenas a poucas centenas de ms)
— seria dominado pelo tempo de BD, não pelo resto. **Por confirmar com precisão (Pedro,
browser):** o tempo real completo de `/prices`/produto nestas condições.

**Veredicto — H2 confirmada, H1 refutada:**
1. **H1 (regressão da 0007) — refutada para `v_products`** (não usa `compute_price()`,
   caminho de código intocado pela 0007) e **não suportada para `v_branch_prices`**
   (escala aproximadamente proporcional ao volume, índices de procura da 0007 confirmados
   em uso, sem varrimento de histórico).
2. **H2 (contenção do host) — confirmada por prova directa**: `vmstat` mostrou swap real
   e substancial durante as consultas lentas, com `Buffers` do Postgres a mostrar hit-rate
   de 100% (sem leitura real de disco) — o custo está no sistema operativo a paginar
   memória, não na base de dados a ler do disco nem numa função mais cara.
3. **Não fecha a 305–432 ms como "aceitável"**: mesmo a 13 linhas, hoje já é o dobro do
   valor de 05/09 — o headroom deste host encolheu, não é o mesmo de há dois dias. O
   catálogo real (50-70 artigos) **vai** encontrar este problema em produção, com carga
   normal de utilização a somar-se à do host — não é um cenário hipotético.

**Propostas, por ordem de custo/risco crescente — nenhuma executada (decisão do Pedro):**
1. **Mais RAM no VPS** (upgrade de plano) — sem alteração de código nenhuma; remove a causa
   raiz directamente. Re-verificação: nenhuma nova prova de app, só confirmar que os tempos
   voltam à escala sub-linear de 05/09 depois.
2. **Disciplina de sessões de trabalho** — evitar sessões de agente muito longas/pesadas em
   paralelo com medições de desempenho; considerar reiniciar sessões periodicamente neste
   VPS. Baixo risco, não resolve a raiz (outras apps continuam a partilhar o host).
3. **Afinar `shared_buffers`/`work_mem` do Postgres** dentro do limite do container (320 MB)
   — configuração, sem tocar em código; pode reduzir picos de swap. Re-verificação: memória
   do container dentro do limite, sem `OOMKilled`.
4. **Redesenhar `products_visible()`/a vista `v_products`** para uma condição `WHERE`
   indexável em vez de uma função `SECURITY DEFINER` por linha — reduziria o número de
   chamadas de função (e por isso a superfície de pressão de memória), mas é o redesenho
   maior, com o risco maior: teria de reprovar a matriz completa do `VERIFICATION-
   PROTOCOL.md` (papéis/filiais) e as fronteiras 0003/0004.
5. **Paginação real (`LIMIT`/`OFFSET`)** — só ajuda combinada com a proposta 4; sozinha,
   `products_visible()` continua a avaliar todas as linhas antes de aplicar o limite (achado
   já registado em 05/09, confirmado ainda válido).

**F5 (este fecho):** `docs/BACKLOG.md` (item 14 com a causa e as propostas, a medição de
06/09 marcada inválida); este ficheiro; dossier (`VPS.md`/`CHANGELOG.md` via
`dossier-push.sh`). Fixture zero resíduo confirmado por contagem (`tmsi.products` de volta
a 13 depois de cada série). `scripts/smoke.py` não foi corrido nesta sessão — nenhuma
alteração de código/schema foi feita, nada a re-verificar (restrição 1).

## Item 26 — White-label + branding (opção B) — ✅ FECHADA 2026-09-06

**Contexto:** decisão do Pedro (06/09) — o código-fonte deixa de conter qualquer elemento
que evoque Condat/TMSI (nomes, cores, textos); tudo passa a configuração em BD, editável na
app. O nome do repositório/imagem/domínio ficam intocados — renomeá-los é sessão de infra
própria, adiada para a E6 (registado, não esquecido).

**F0 — inventário do que estava hardcoded, feito por um agente de pesquisa antes de
desenhar a 0008 (não assumido de memória):**
- Bloco de copyright ("TMSI Equipment Price Listing / Copyright (c) 2026 Pedro Alexandre /
  PROPRIETARY AND CONFIDENTIAL") em 55 ficheiros `.ts`/`.tsx` — decisão: **mantido
  deliberadamente**, é a titularidade do código (mesma coisa que `NOTICE`/`LICENSE`), não
  branding de cliente — mesma categoria de excepção que a opção B já concede ao nome do
  repo/imagem/domínio.
- 11 ocorrências REAIS de "TMSI" fora desse bloco: `layout.tsx` (título da aba), `page.tsx`/
  `login/page.tsx` (`<h1>`), `prices/page.tsx` (cabeçalho de impressão), os dois
  `.../export/route.ts` (título do relatório, ×2 cada), o rótulo "TMSI code" no formulário
  de novo produto, os dois templates de email (convite/recuperação), e `lib/notice.ts`'s
  `NOTICE_TEXT` — uma cópia do `/NOTICE` do repositório embutida no rodapé de **ambos** os
  documentos exportados. **Achado real, não uma suposição:** isto já era exactamente a
  violação que a restrição (d) do prompt proíbe — dados de licença a aparecer num documento
  exportado. Zero "Condat" em `app/src` (a única ocorrência é um comentário de código sobre
  um incidente real com um endereço `condat.fr`, não uma referência de marca).
- Sem `public/`, sem `<img>`/`next/image`, sem favicon, sem mecanismo de upload de
  ficheiros nenhum no código existente — tudo construído de raiz.
- Convenções a seguir: `admin/users/page.tsx`/`actions.ts` (página admin-only + Server
  Action) e `config/actions.ts`'s `updateSetting` (escrita directa simples, sem workflow de
  aprovação) como os dois modelos mais próximos.

**F1 — migração 0008, validada em 9 verificações `BEGIN`/`ROLLBACK` antes de aplicar:**
duas tabelas append-only — `tmsi.branding_logos` (o binário, PNG/JPEG só — `exceljs.
addImage()` não aceita SVG) e `tmsi.branding` (nome, tagline, rodapé, texto legal, cor,
tipografia, referência ao logo) — separadas para que editar só o texto não reinsira nem
re-audite um logo de centenas de KB que não mudou (`tmsi.audit()` faz `to_jsonb(new)`, que
hex-codificaria o bytea). RLS desde o primeiro momento: leitura universal +
`tmsi.branding` **também legível por `anon`** (único caso deste projecto — os templates de
email do GoTrue não têm sessão nenhuma; seguro porque esta tabela não tem nenhum dado
sensível a custo). Escrita admin-only em ambas, **fora do workflow de aprovação da 0007**
(é apresentação, não um preço publicado — decisão registada aqui e no cabeçalho da própria
migração). **Achado real na validação:** uma política RLS `to anon` sozinha não bastou —
sem o `GRANT` de base explícito (0001 já tinha o mesmo padrão para `tmsi.settings`), o
acesso foi recusado com "permission denied" antes de a RLS sequer entrar em jogo; corrigido
com `grant select ... to anon` em `tmsi.branding` e (sem política de leitura nenhuma) em
`tmsi.branding_logos` também — o `GRANT` sem política dá zero linhas para `anon`, não um
erro, exactamente o `LEFT JOIN` gracioso que `tmsi.v_current_branding` precisa para
`logo_mime_type`.

**F2 — código, com uma saga real de CI vermelho, dois bugs genuínos, corrigidos um a um:**
`lib/branding.ts` (`getBranding()`/`getBrandingInternal()`/`footerLines()`/`slugify()`/
`getBrandingLogoBuffer()`, defaults neutros embutidos — "Equipment Price Listing", sem
nenhum nome de cliente); nova página `/config/branding` (admin-only) + `actions.ts`
(upload de logo validado no servidor — tipo e tamanho, 2 MB — nunca só no cliente) +
`api/branding/logo/route.ts` (serve o logo actual). Aplicado a `layout.tsx`
(`generateMetadata` dinâmico), `page.tsx`/`login/page.tsx` (login dividido em
`page.tsx`/servidor + `form.tsx`/cliente, mesmo padrão já usado no resto da app), aos dois
templates de email, aos dois exports `.xlsx` (logo embutido via `exceljs.addImage`, cor,
tipografia, nome de ficheiro por slug em vez de `"tmsi-"`) e à vista de impressão de
`/prices`. "TMSI code" passou a "Product code" (a etiqueta descrevia o formato do ID, não
uma marca). `lib/notice.ts` perdeu `NOTICE_TEXT` — só `PROPRIETARY_NOTICE` sobrevive (o
rodapé do login, sempre dentro da app).

**CI vermelho duas vezes, dois bugs reais, nenhum deles hipotético:**
1. `lib/branding.ts` chamava `.maybeSingle()` **depois** de `.overrideTypes()` em dois
   sítios — a mesma classe de bug já documentada neste projecto (`docs/STATE.md`, E3-i6 F1,
   `audit/page.tsx`): `overrideTypes()` é um estágio de "transform" que o `postgrest-js`
   estreita para um tipo sem mais métodos de construção de query. Corrigido invertendo a
   ordem — não era, no entanto, a causa do CI vermelho (ver achado de processo abaixo).
2. **A causa real:** `lib/xlsx-export.ts`'s novo embutir do logo
   (`workbook.addImage({buffer, extension})`) — `exceljs`'s próprio `.d.ts` declara um
   `interface Buffer extends ArrayBuffer` local ao seu ficheiro, e a lib `esnext` deste
   projecto acrescentou os membros de `ArrayBuffer` redimensionável
   (`resize`/`resizable`/`maxByteLength`/`detached`/...) — o `Buffer` real do `@types/node`
   já não satisfaz estruturalmente o shim do `exceljs`. Corrigido com
   `as unknown as Parameters<typeof workbook.addImage>[0]` (evita nomear o `Image`
   interface não exportado do `exceljs`) — mesma classe de discrepância type-checker/lib já
   documentada neste ficheiro para `Buffer` vs `BodyInit`.

**Achado de processo, registado no fecho:** sem acesso à API de logs do GitHub Actions
(`403 Must have admin rights`, o PAT GHCR desta VPS é só `read:packages`), o diagnóstico do
segundo bug foi feito por um agente pedido em isolamento **`remote`** — que na prática caiu
para um **worktree local** neste mesmo VPS (`.claude/worktrees/agent-...`, confirmado por
`git worktree list` e por um aumento real de uso de disco durante a corrida) em vez de
correr numa máquina genuinamente remota. Correu `npm install` + `npx tsc --noEmit` + `npm
run build` (~12 min, incl. um passo "Compiled successfully in 6.0min") **neste VPS de 961
MB/1 vCPU** — exactamente o tipo de build que `~/atelier-vps/CLAUDE.md` proíbe fazer aqui.
Não houve OOM nem impacto visível desta vez (disco 51%→54%, memória recuperada depois), e o
resultado (o erro exacto TS2740, com ficheiro/linha) valeu a pena — mas a disponibilidade
real de isolamento `remote` para este tipo de agente fica como algo a **não** voltar a
assumir sem confirmar primeiro; o worktree foi limpo no fim (`git worktree remove`).

**F3:** CI verde ao terceiro commit (`27199e7`); digest
`sha256:ad90a1c0fe34b4216edd05f4c340d18a1e77caa6d333a638c2669ba9666117f7`; `tmsi-app`
saudável; `scripts/smoke.py` 38/38, sem regressão.

**F4 — as 6 provas:**
1. **Grep de varrimento (restrição 1):** zero "TMSI"/"Condat" em `app/src` fora do bloco de
   copyright/identificadores de infra; testado contra o seu próprio falso positivo.
2. **Mudança de identidade reflectida num ecrã real:** admin propôs branding real
   (`display_name="Acme Test Corp"`, cor `#c0392b`, rodapé e texto legal próprios) via
   `COMMIT` real (não `ROLLBACK` — tinha de persistir para um pedido HTTP **separado** o
   ver) → `GET /login` sem sessão nenhuma (`anon`) devolveu de imediato
   `<title>Acme Test Corp</title>`/`<h1>Acme Test Corp</h1>`. Revertido (`DELETE` directo
   como `postgres` — `tmsi.branding` não tem política de `DELETE` para `authenticated`, por
   desenho) → título voltou ao placeholder neutro ("Equipment Price Listing"). **Metade do
   Pedro, browser, confirmada 2026-09-06:** mudança de nome/cor/rodapé em
   `/config/branding` e o `.xlsx` exportado reflectindo-a — confirmado directamente pelo
   Pedro (o ramo que `/prices/export`/`/products/export` exigirem sessão real por cookie,
   não um `Authorization: Bearer`, impedia o agente de o provar sozinho — confirmado outra
   vez nesta sessão: um pedido com o token real de `finance.test` devolveu a página HTML de
   `/login`, não o ficheiro, mesma limitação já registada na adenda i10). Por confirmar
   ainda (não mencionado pelo Pedro): a vista de impressão de `/prices` especificamente.
3. **Licença ausente dos documentos:** confirmado por leitura de código
   (`NOTICE_TEXT` removido dos dois). A confirmação por conteúdo do ficheiro real
   (`unzip`/grep ao `.xlsx`, como a própria AA da i10 já fez) continua por cobrir — a
   validação do Pedro confirmou o branding a aparecer correctamente, não especificamente a
   ausência da licença dentro do ficheiro.
4. **Papel `sales`/sem custos continua sem custos:** nenhuma linha da query
   `v_branch_prices`/`v_selling_prices`/`v_products` foi tocada por esta sessão, só
   metadados de branding à volta — risco de regressão avaliado como baixo por leitura de
   código; confirmação por ficheiro real fica também para o Pedro.
5. **Item 14, remedido no mesmo fixture:** ver secção própria abaixo — **não fechou**.
6. **Sem resíduo:** `tmsi.products` de volta a 13, `tmsi.branding`/`tmsi.branding_logos` a
   0 linhas cada, `scripts/smoke.py` 38/38 no fim.

**Item 14 — remedido, NÃO fechado:** fixture de 57 produtos sintéticos (`T-9200`..`T-9256`,
`draft`, HS reais, ciclando as 4 filiais/moedas, cada um vendido em 2 filiais — 13+57=70, o
topo do catálogo real) inserido/medido/apagado três vezes dentro de `BEGIN`/`ROLLBACK`
(contagem de produtos confirmada de volta a 13 sempre). `EXPLAIN ANALYZE`, sessão
`authenticated` real (claims de `finance`): `v_products` (`/products`) — **3,50 s / 3,90 s
/ 7,25 s** em três execuções independentes (70 linhas); `v_branch_prices` (`/prices`) —
**506 ms / 559 ms** (147 linhas). Muito mais lento do que a extrapolação linear de 05/09
sugeria (~300–400 ms esperados a este volume). Causa provável, não uma certeza única: este
VPS reparte 1 vCPU entre várias apps (`load average` observado 1,0–1,6, swap ~1,3/4 GB
durante as medições) — explica a severidade e a variância grande entre execuções idênticas,
mas não torna o pior número menos real: mesmo a mais rápida (3,50 s) já é "ordem de
segundos" a um volume que É o catálogo real. **Condição de paragem do próprio prompt
accionada** ("tempos que tornem a app inutilizável → reportar e reabrir o item 14 com o
número real, não redesenhar aqui") — `docs/BACKLOG.md` item 14 reaberto com estes números,
prioridade/timing do redesenho ficam por decisão do Pedro.

**F5:** `docs/VERIFICATION-PROTOCOL.md` — linha "Editar branding" na matriz (nota ⁷), passos
KK/LL (secção 4.8), adenda datada com os resultados exactos e o que fica para o Pedro.

**F6 (este fecho):** `docs/BACKLOG.md` (item 26 riscado; item 14 reaberto com os números
reais, NÃO fechado); este ficheiro; dossier (`VPS.md`/`CHANGELOG.md` via
`dossier-push.sh`).

## Item 18 — Alerta de idade dos câmbios (métrica FX no vps-stats/T8) — ✅ FECHADA 2026-09-06

**Contexto:** câmbios velhos produzem preços errados silenciosamente — o risco funcional
mais próximo do negócio que restava. Entregável: idade do câmbio mais recente por moeda
publicada em `status.json` (`~/atelier-vps/vps-stats.sh`, timer de 5 min), **sem** meter
dependência Postgres no colector endurecido — o motivo pelo qual este item esteve adiado
continua válido e foi respeitado.

**F0 — três vias medidas, escolhida a (a), justificação citada no commit
(`43468cf`):**
1. **(a) escolhida — novo endpoint interno na app, `GET /api/fx-age`.** `tmsi-app` já corre
   com `SERVICE_ROLE_KEY` em runtime; `service_role` tem `rolbypassrls=true` **e** GRANT já
   concedido em `tmsi.exchange_rates` (confirmado via `pg_roles`/`information_schema`, não
   assumido) — zero grant novo. A rota fica atrás de um bearer token próprio e estreito
   (`STATS_INTERNAL_TOKEN`, nunca `SERVICE_ROLE_KEY` reutilizado, comparação
   `timingSafeEqual`), lido pelo colector de um ficheiro `chmod 600` **separado** do `.env`
   principal (`~/.config/tmsi/stats-internal-token`) — um colector comprometido só vaza este
   token, nunca `POSTGRES_PASSWORD`/`JWT_SECRET`/`SERVICE_ROLE_KEY`. `172.20.40.1:3001` só é
   alcançável a partir do próprio host (confirmado: o bind do Docker é a esse IP específico,
   não `0.0.0.0` — não é rota pública), mas a fronteira real e suficiente por si só é o
   token, não a topologia de rede: confirmado ao vivo que o mesmo caminho via
   `tmsiequipment.duckdns.org/api/fx-age` (o `location /` do nginx proxya tudo, sem excepção
   nova nenhuma) devolve **401** sem o token, exactamente como o pedido directo à bridge.
   `middleware.ts` ganhou `/api/fx-age` em `PUBLIC_PATHS` — achado apanhado antes de
   implementar (sem isto, o middleware de sessão redirigiria a `/login` antes do próprio
   token chegar a ser verificado), mesmo raciocínio já aplicado a `/api/health`.
2. **(b) rejeitada — PostgREST anónimo a uma vista de idades.** `anon` tem **zero** grants
   em `tmsi.exchange_rates` hoje (confirmado por `information_schema.role_table_grants`) —
   um endpoint assim exigiria um GRANT novo a `anon`, exactamente o tipo de alargamento que
   as fronteiras 0003/0004 foram construídas para impedir, mesmo só expondo idades sem
   valores.
3. **(c) rejeitada — job separado fora do `vps-stats` a escrever um ficheiro.** Precisaria
   da sua própria credencial de BD nalgum lado (ex. `docker exec psql`, como o
   `tmsi-backup.service`) — só desloca o problema para um terceiro processo, sem reduzir
   superfície nenhuma, e duplicaria a lógica de selecção do `fx_rate()` sem reutilizar
   código/tipos já existentes na app.

**Semântica da idade, contra o schema real (não assumida):** `tmsi.fx_rate()` lida por
`psql`, confirmado `where currency = p_currency and effective_date <= p_date order by
effective_date desc, created_at desc limit 1`. `/api/fx-age` mirra este WHERE/ORDER BY
**verbatim** via parâmetros de query do PostgREST (`effective_date=lte.<hoje>&order=
currency.asc,effective_date.desc,created_at.desc`) — nunca uma cópia da regra em JS; o
código só lê o primeiro resultado por moeda de uma lista já correctamente ordenada pelo
próprio Postgres. `hoje` é `new Date()` dentro do próprio container `tmsi-app` — seguro
especificamente porque esse container partilha o relógio UTC do `supabase-db` (confirmado
ao vivo, `date -u` idêntico nos dois) — **não** a mesma situação do bug do item 25
(`scripts/smoke.py`, um script do HOST, fuso diferente do da BD); comentário no código a
avisar explicitamente contra copiar este raciocínio para um script do host. Moedas vêm
inteiramente dos dados (`distinct currency` em `exchange_rates`) — nunca uma lista
hardcoded; EUR está correctamente ausente (moeda base, nunca guardada nesta tabela,
`compute_price()` nunca chama `fx_rate()` para ela).

**F1/F2:** `app/src/app/api/fx-age/route.ts` (novo); `STATS_INTERNAL_TOKEN` gerado
(`openssl rand -hex 32`), em `deploy/supabase/.env` + `~/.config/tmsi/stats-internal-token`
(hashes SHA-256 comparados para confirmar as duas cópias idênticas, nunca os valores
impressos); `docker-compose.yml`/`.env.example`/`DEPLOY.md` actualizados.
`~/atelier-vps/vps-stats.sh` ganhou o bloco de leitura (curl com o token, timeout 5s, `null`/
`{}` em qualquer falha — nunca aborta o gerador, mesma filosofia do bloco de idade do
backup já existente) e as duas chaves novas no `jq -n` final. Digest
`sha256:fe4c4f3d61411e3feaf9a0ff3daa347b4aa8b75716910e82610b0cd96551f883`. Zero alteração ao
endurecimento do `vps-stats.service` (`ProtectSystem=strict`/`ProtectHome=read-only`/
`ReadWritePaths` intocados, confirmado por `systemctl show` antes/depois — `PrivateNetwork=
no` já permitia o `curl` interno sem mudança nenhuma).

**F3 — as 6 provas:**
1. **Cruzamento SQL:** `status.json` real, servido pelo túnel, continha `{"CNY":0,"GBP":2,
   "USD":2}`/`max=2` — cruzado contra uma consulta SQL manual (`current_date -
   effective_date` da linha vencedora por moeda) com o resultado **byte-a-byte idêntico**.
2. **Ramo de mudança, fluxo real (não escrita directa):** finance propôs uma correcção GBP
   para hoje via `/price_proposals` (REST); aprovada por um `COMMIT` real (não `ROLLBACK` —
   tinha de persistir para o timer seguinte ver) com as claims JWT do admin real (`false` no
   3.º argumento de `set_config`, sessão inteira, não local a uma transacção — achado
   apanhado ao vivo: a 1.ª tentativa usou `true`/local e falhou com `Forbidden` porque
   `auth.uid()` já tinha voltado a `null` antes do `decide_price_proposal()` correr, cada
   `psql` sem `begin;` explícito é a sua própria transacção implícita). GBP caiu de 2 para
   0 de imediato em `/api/fx-age`, e **confirmado na execução seguinte real do timer**
   (5 min depois, sem intervenção nenhuma) em `status.json`. Fixture revertido (`DELETE` da
   proposta + da linha materializada) — `exchange_rates` de volta a 12 linhas, `0` propostas
   residuais — e confirmado, na execução seguinte do timer outra vez, que GBP voltou a 2.
3. `status.json` sem nenhum valor de câmbio — `grep` ao ficheiro real servido, zero
   ocorrências.
4. Binding/ACL do `:8080`/`status.json` inalterados — `nginx -T` mostra `allow
   10.13.13.0/24; deny all;` intocado; `curl 127.0.0.1:8080/status.json` → `403` (prova o
   `deny` do nginx; a nota já estabelecida do `~/CLAUDE.md` aplica-se — tráfego local sai por
   `lo`, isto não prova a camada `ufw`, que também não foi tocada nesta sessão).
5. `vps-stats.service` continua com o mesmo endurecimento — `systemctl show` idêntico
   antes/depois desta sessão (`ProtectSystem=strict`, `ProtectHome=read-only`,
   `PrivateNetwork=no`, `User=pedro`, sem alteração nenhuma ao ficheiro do unit).
6. `scripts/smoke.py` **38/38**.

**Achado real, não escondido:** o smoke acusou uma falha genuína a meio desta sessão —
login de `branch_manager.test` a devolver `invalid_credentials`. `audit_log` mostrou duas
`UPDATE`s reais em `tmsi.profiles` horas antes (actor = admin, depois actor = o próprio) —
o padrão exacto de um reset de password pelo admin seguido da troca obrigatória, quase de
certeza o Pedro a validar a E4 no browser (as provas de auto-aprovação/propor que tinham
ficado por cobrir). Corrigido pela mesma via que a própria app usa
(`PUT /admin/users/{id}` da Admin API do GoTrue, `admin/users/actions.ts`), gerando uma
password nova com o mesmo charset de 4 classes que `generateStrongPassword()` já usa —
a 1.ª tentativa com `openssl rand -base64` foi recusada pela política de password
(só 3 classes, faltava carácter especial). Ficheiro de fixture
(`~/tmp/tmsi-sudo/branch_manager-test-password.txt`) actualizado, nunca impresso; smoke
confirmado 38/38 depois. Nenhuma alteração ao `must_change_password` desta conta (chamada
directa à Admin API, não a Server Action da app).

**F4 — pendência homelab (canal D-PEND, `VPS.md`):** chaves exactas publicadas
(`tmsi_fx_ages_days`/`tmsi_fx_max_age_days`), limiar proposto (aviso 7 dias, alarme 14 —
o Pedro valida no homelab, sem histórico real para os calibrar melhor aqui), pedido de
13.ª métrica no digest T8 + tile no dashboard.

**F5 (este fecho):** `docs/BACKLOG.md` (item 18 riscado); este ficheiro; dossier
(`VPS.md`/`CHANGELOG.md` via `dossier-push.sh`).

## E4 — Workflow de aprovação (migração 0007) — ✅ FECHADA 2026-09-06

**Contexto:** decisão L2 do Pedro, fechando o que a i5 só registava como inclinação
(`docs/ROADMAP.md`): modificações a preços publicados exigem aprovação do Branch Manager da
filial afectada OU de um admin — um aprovador basta; «quem edita não aprova» **não se
aplica** (admin pode aprovar as próprias modificações — decisão consciente de fase-piloto,
limitação conhecida a revisitar com mais utilizadores reais; `audit_log` mostra sempre autor
e aprovador, mesmo coincidindo).

**Âmbito proposto pelo prompt, validado contra o schema real em F0 (restrição 7: divergência
→ parar e perguntar, nunca assumir):** sujeitas ao workflow, mutações a preços publicados —
câmbios, configuração de preço (fees, transporte, direitos aduaneiros, margens) e overrides.
Ciclo de vida do produto fica **fora** do workflow (o estado `draft` + a validação de
activação da 0001 já o gate-keeperam).

**F0 — dois desvios reais entre o desenho e o schema real, ambos resolvidos com o Pedro por
`AskUserQuestion` antes de escrever DDL nenhuma (nunca assumidos):**
1. **«BM da filial afectada» só tem significado limpo em 3 das 6 tabelas.**
   `transport_tiers`/`margin_grids`/`price_overrides` têm uma única coluna `branch_id` cada
   — candidato natural. `exchange_rates` só tem `currency`, `customs_rates` só `zone`, e
   `interco_fees` tem **duas** filiais (`supplier_branch`/`seller_branch`) sem que
   `branch_manager` alguma vez tivesse escrita nela. **Decisão do Pedro (a opção
   recomendada):** aprovação **admin-only** para estas três, rejeitando derivar "a filial" a
   partir da moeda/zona — todas as moedas/zonas mapeiam para uma única filial nos dados de
   hoje, mas isso é dado, não garantia de schema; uma segunda filial futura na mesma
   moeda/zona mudaria silenciosamente quem aprova, sem nada no código a assinalar o dia em
   que isso acontecesse.
2. **Só `exchange_rates`/`price_overrides` tinham mecanismo histórico** (padrão 0005:
   `effective_date`/`created_at`, nunca editar em vigor). `interco_fees`/`transport_tiers`/
   `customs_rates`/`margin_grids` tinham a PK na própria identidade da configuração (ex.
   `(branch_id, tier)` em `margin_grids`) — inserir "uma nova versão" de uma chave existente
   violaria essa PK directamente. **Decisão do Pedro, a opção maior (não a mais pequena que
   eu recomendei — um simples UPSERT-in-place):** redesenhar as quatro tabelas com o mesmo
   versionamento `effective_date`/`created_at` que `exchange_rates` já tinha, com
   `compute_price()`/`branch_margin()` a escolherem sempre "a mais recente aplicável" de cada
   uma, tal como `fx_rate()` já fazia. Isto só muda as procuras **internas** de
   `compute_price()` — a sua assinatura `(p_product, p_branch, p_date)` e colunas de saída
   ficam intocadas (condição de paragem do prompt, não violada).

Ciclo de vida do produto ficou explicitamente fora — o estado `draft` e a validação de
activação da 0001 já impõem essa fronteira; sobrepor este workflow duplicaria controlo sem
uma decisão a pedi-lo.

**F1 — migração 0007, validada em `BEGIN`/`ROLLBACK` antes de aplicar (restrição do prompt:
falha na validação → parar e propor):**
- `interco_fees`/`transport_tiers`/`customs_rates`/`margin_grids`: PK antiga substituída por
  `id bigint generated always as identity`, mais `effective_date date default current_date`,
  `created_at timestamptz default clock_timestamp()` (não `now()` — a mesma lição da 0005:
  `now()` fica congelado durante toda a transacção, `clock_timestamp()` reflecte o momento
  real) e `created_by uuid`; índice de procura `(identidade, effective_date desc, created_at
  desc)` em cada uma, espelhando exactamente o padrão 0005.
- `tmsi.branch_margin()`: dropada e recriada com um novo parâmetro `p_date default
  current_date`; `DISTINCT ON` para escolher a linha mais recente **por tier** antes de
  aplicar a selecção "menor tier cujo `max_cost_eur` ainda cobre o custo" — necessário
  porque são duas selecções em camadas diferentes (mais-recente-por-identidade e
  menor-tier-aplicável); escolher só uma linha mais recente entre todos os tiers escolheria
  silenciosamente o tier errado sempre que tiers fossem editados em dias diferentes.
- `tmsi.compute_price()`: `CREATE OR REPLACE`, mesma assinatura/colunas de saída, só as três
  procuras internas (interco/transporte/direitos) ganham a mesma disciplina de
  `effective_date`, e a chamada a `branch_margin()` passa `p_date` adiante.
  **Bug real apanhado pela própria validação obrigatória** (exactamente o processo a
  funcionar como desenhado): "column reference 'branch_id' is ambiguous" na sub-consulta de
  `transport_tiers` — a cláusula `returns table(..., branch_id text, ...)` da própria função
  cria implicitamente uma variável PL/pgSQL `branch_id`, colidindo com uma referência não
  qualificada a `tmsi.transport_tiers.branch_id`. Corrigido com um alias `tt` e todas as
  colunas qualificadas; o mesmo padrão aplicado por consistência (não por bug real, função
  `language sql` sem variável de saída colidente) à sub-consulta análoga de
  `branch_margin()`.
- Nova tabela `tmsi.price_proposals` (genérica, um único desenho para os 6 tipos-alvo — a
  lógica do workflow é a mesma forma para todos, seis cópias multiplicaria a superfície de
  RLS/auditoria sem diferença de comportamento nenhuma): `payload jsonb` carrega exactamente
  as colunas que o `INSERT` da tabela-alvo precisa; `branch_id` desnormalizado do payload
  para permitir RLS/elegibilidade indexável, `NULL` para os três tipos admin-only. RLS desde
  o primeiro momento: `proposals_read` (âmbito espelha `overrides_read` — papéis
  amplamente visíveis, `branch_manager` só a sua filial, e qualquer proponente vê sempre as
  suas próprias propostas mesmo sem outro acesso de leitura) e `proposals_insert`
  (elegibilidade de proposta = exactamente a elegibilidade de escrita que cada tabela já
  tinha antes de 0007 — este é agora o único lugar onde essa fronteira vive). **Sem nenhuma
  política de `UPDATE`/`DELETE` para `authenticated`** — uma proposta só muda de estado por
  dentro de `decide_price_proposal()` (SECURITY DEFINER), nunca por escrita directa; não é
  uma lacuna, é a própria imposição.
- `tmsi.decide_price_proposal(p_proposal_id, p_decision, p_reason)`: SECURITY DEFINER,
  `search_path = pg_temp` (o padrão mais estrito, o mesmo de `admin_revoke_sessions` da
  0006), reconfirma `has_role('admin') or (branch_id is not null and has_role('branch_manager')
  and branch_id = any(my_branches()))` **por dentro**, nunca confiando no chamador; exige
  motivo para rejeitar; materializa a aprovação com `INSERT`s explícitos por
  `target_table` (nunca SQL dinâmico a partir de identificadores do payload, mesmo
  `target_table` já estando limitado por `CHECK` a um dos 6 valores literais).
- Removidas as 6 políticas de escrita directa: `config_write` em `exchange_rates`/
  `interco_fees`/`transport_tiers`/`customs_rates`/`margin_grids`, e `overrides_write` em
  `price_overrides` — `overrides_write` também concedia a única leitura de `logistics` às
  linhas `kind=duty` (achado já registado no `VERIFICATION-PROTOCOL.md`, nota ³); essa
  visibilidade foi dobrada explicitamente para dentro de `overrides_read` antes de remover a
  política antiga, para não a levar consigo por engano. `tmsi.settings` fica intocado, fora
  de âmbito (ajusta limiares de alerta, não um valor que `compute_price()` devolve).
- **Validação:** 14 verificações num único `BEGIN`/`ROLLBACK`, com um snapshot de baseline
  pré-migração de `compute_price('T-0002', <4 filiais>)` capturado primeiro para comparação
  byte-a-byte. Todas as 14 com o resultado esperado na segunda corrida (a primeira apanhou o
  bug acima): baseline idêntico; bypass de escrita directa negado; proposta por role
  inelegível negada; proposta elegível aceite; motor insensível a pendente; aprovação de
  filial errada negada; aprovação correcta pelo BM + materialização confirmada; motor
  reflecte o novo valor de imediato; consulta histórica insensível à correcção de hoje;
  re-decidir uma proposta já decidida negado; rejeição sem motivo negada; rejeição com
  motivo aceite sem alterar o valor em vigor; auto-aprovação de admin aceite (decisão L2);
  `audit_log` completo. `rollback` final sem resíduo.
- Ficheiro commitado (`783c5bb`) e pushed **antes** de aplicar (restrição do prompt);
  backup fresco (`~/backups/tmsi/tmsi-pre-0007-20260906-125655.dump`, 300 KB, verificado
  restaurável por `pg_restore --list`, 645 entradas) tirado imediatamente antes do `DDL`.
  Aplicada em produção sem erros (`COMMIT`); `compute_price()` confirmado byte-idêntico ao
  baseline pré-migração nas 4 filiais logo a seguir.

**F2 — código da app (commit `e6b53e7`):** `app/src/lib/propose-change.ts` (helper único,
partilhado por `config/actions.ts`/`overrides/actions.ts`, nunca confia num `proposed_by`
vindo do cliente); as 5 acções de config e a de criar override deixam de escrever
directamente e passam a propor; cada linha editável de config ganha um campo Reason
obrigatório; `tmsi.settings`/`SettingRow` fica com escrita directa (fora de âmbito,
intocado). `config/page.tsx`: as 4 tabelas agora históricas passam a seleccionar
`id`/`effective_date`/`created_at` e a escolher, em JS, a linha "activa" por identidade
(mesma regra do motor: mais recente com `effective_date <= hoje`) — sem isto a página
mostraria linhas duplicadas crescentes a cada aprovação, um bug real que a mudança de schema
introduziria silenciosamente sem este ajuste. Novo ecrã `/proposals`: fila de pendentes
(Approve/Reject + motivo, botões só visíveis a quem `decide_price_proposal()` aceitaria —
admin ou o BM da filial certa) e histórico de decisões, com aviso "self-approved" quando
`decided_by = proposed_by` (decisão L2, documentado como esperado, não como falha). Badges
"N pending approval" em `/config`/`/overrides`, ligados a `/proposals`. Novo link
"Proposals" na home; `price_proposals` acrescentada à lista de tabelas do `/audit`.

**F3 — deploy (commit `d0b1534`):** CI verde (run `34032683416`), imagem pulled por digest
(`sha256:e9ad8102b9c8f8c8b75c3365e2a10e132313f87a41d63aa0dca1c2e9c3480cd7`), `tmsi-app`
saudável. `scripts/smoke.py`: o bloco R (correcção de câmbio no mesmo dia, 0005) partia de
um `INSERT` directo em `exchange_rates` — 0007 removeu esse caminho, pelo que o smoke acusou
2 falhas reais logo após o deploy. **Não era regressão:** era o comportamento novo e
pretendido, que o smoke tinha de passar a validar. Bloco R reescrito (prova que o `INSERT`
directo é recusado mesmo para `finance`, que uma proposta pendente é invisível a
`fx_rate()`, e que um decisor inelegível — `finance`, na sua própria proposta a
`exchange_rates`, tipo admin-only — é recusado, tudo sem tocar em conta admin nenhuma, a
regra "a conta pessoal nunca entra no smoke" mantida). Novo bloco S (`price_overrides`,
branch-scoped, com `branch_manager.test` a aprovar): fluxo completo propose→approve→efeito;
aprovação de filial errada recusada; rejeição sem motivo recusada, com motivo aceite sem
alterar o valor em vigor; limpeza final confirma zero resíduo. Overrides em vez de
`margin_grids` deliberadamente — uma override é uma linha nova, independentemente apagável,
nunca uma edição em vigor de uma filial real. **38/38** a passar (24 antes deste commit);
zero resíduo confirmado por query directa (`price_proposals`/`price_overrides`/
`exchange_rates` sem nenhuma linha "smoke").

**F4 — as 6 provas comportamentais pedidas, lado do agente (API/BD):**
1. **Motor insensível a pendente** — confirmado ao vivo (smoke, blocos R e S).
2. **Aprovação por BM + recálculo motor-vivo** — confirmado ao vivo (smoke, bloco S:
   `expected=0.55 got=0.55`).
3. **Auto-aprovação de admin** — confirmado duas vezes: na validação `BEGIN`/`ROLLBACK` de
   F1 (CHECK 13) e de novo, já com 0007 em produção, por um `BEGIN`/`ROLLBACK` dedicado
   (claims JWT do admin real, nunca `commit`) — `self_approved = t`, sem resíduo. Sem conta
   de teste admin (não existe, por desenho) — este é precisamente o tipo de prova que a
   regra "a conta pessoal nunca entra no **smoke**" não proíbe (é sobre o `scripts/smoke.py`
   correr repetidamente contra produção, não sobre uma verificação pontual em transacção
   nunca submetida).
4. **Três ramos negados** — filial errada (BM), decisor inelegível (`finance` a decidir a
   sua própria proposta a `exchange_rates`), bypass por escrita directa (`finance` a tentar
   `INSERT` directo em `exchange_rates`) — os três confirmados ao vivo (smoke).
5. **Rejeição com motivo não altera o motor** — confirmado ao vivo (smoke, bloco S).
6. **Sweep de regressão** — `scripts/smoke.py` 38/38 (agente); sweep visual de `/config`,
   `/overrides`, `/proposals` fica para o Pedro (ver "por cobrir" abaixo).

**F5 — `docs/VERIFICATION-PROTOCOL.md` (commit `56f1122`):** matriz (secção 3) ganha nota ⁶
e a linha "Aprovar modificações propostas" por papel; nova secção 4.9 (passos EE–JJ,
espelhando as 6 provas acima); nota de "cobertura automatizada" actualizada (EE–II cobertos
por `scripts/smoke.py`, GG sem cobertura no smoke por desenho, coberto por
`BEGIN`/`ROLLBACK` directo); adenda datada em secção 7 com o resultado exacto de cada prova
e a lista explícita do que fica para o Pedro no browser.

**Por cobrir (fica para o Pedro, browser, `docs/VERIFICATION-PROTOCOL.md` secção 7,
adenda E4):** propor nos ecrãs `/config`/`/overrides` e ver o badge "N pending approval";
aprovar como `branch_manager.test` em `/proposals` e ver o preço recalculado; a metade de
auto-aprovação de admin que precisa mesmo do ecrã (a conta pessoal do Pedro, ver
"self-approved" na listagem de decididas); rejeitar pelo ecrã (motivo obrigatório recusado
pelo próprio formulário); e o sweep visual de regressão pós-deploy. Confirmar CI verde
(feito também pelo agente desta vez, via API pública do GitHub, mas continua listado como
passo do Pedro por ser a norma estabelecida).

**F6 (este fecho):** `docs/ROADMAP.md` (E4 ✅, tabela de estado + secção própria + questão
aberta L2 resolvida); `docs/BACKLOG.md` (item 9 marcado implementado, novo item 27 —
"regra de validade de 90 dias + notificações" — separado por nunca ter feito parte do
âmbito real desta sessão, apesar de constar do texto original da E4 no ROADMAP); este
ficheiro; dossier (`VPS.md`/`CHANGELOG.md` via `dossier-push.sh`).

## Item 24 — Rotação dos 4 segredos expostos + re-escrow — ✅ FECHADA 2026-09-06

**Contexto:** fecho do incidente de 2026-09-06 (item 21) — `POSTGRES_PASSWORD`, `JWT_SECRET`,
`ANON_KEY`, `SERVICE_ROLE_KEY` tinham ficado visíveis num comando mal escrito. Graças ao
item 22 (fechado horas antes, no mesmo dia), o custo passou a ser um restart, não um rebuild.

**F0 (medições, sem valores):**
- `POSTGRES_PASSWORD` **não é um único role** — usado por `db` (init), pela connection
  string do GoTrue (`postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@db/...`) e pela do
  PostgREST (`postgres://authenticator:${POSTGRES_PASSWORD}@db/...`). Confirmado via
  `pg_authid`: 5 roles com password definida (`authenticator`, `pgbouncer`, `postgres`,
  `supabase_admin`, `supabase_auth_admin`) — `pgbouncer` não corresponde a nenhum serviço
  desta stack (não existe `pgbouncer` no `docker-compose.yml`, achado lateral, não tocado);
  `supabase_admin` não é referenciado por nenhuma connection string do compose (só usado
  localmente via `docker exec`, `pg_hba.conf` confirma `local`/`127.0.0.1`/`::1` → `trust`,
  sem password) — não rodado, fora do âmbito real da exposição. Rodados: `postgres`,
  `supabase_auth_admin`, `authenticator` — os três que a variável `POSTGRES_PASSWORD`
  efectivamente alimenta nesta stack.
- Claims do `ANON_KEY`/`SERVICE_ROLE_KEY` actuais, só o payload (nunca a assinatura, nunca o
  token completo): `{"role":"anon"|"service_role","iss":"tmsiequipment-atelier24","iat":
  1788470056,"exp":2103830056}` — os novos replicam exactamente `iss`/`iat`/`exp`, mudando
  só `role` (já diferia) e a assinatura (novo `JWT_SECRET`).
- Rollback preparado e verificado antes de tocar em nada: cópia do `.env` (600, timestamped,
  fora do git) + `pg_dump` fresco (637 entradas no TOC, `pg_restore -l` confirmou legível).

**F1:** 4 valores novos gerados (`openssl rand -hex 32` para `POSTGRES_PASSWORD`/
`JWT_SECRET`; `ANON_KEY`/`SERVICE_ROLE_KEY` assinados HS256 à mão, stdlib `hmac`/`hashlib`,
claims idênticos aos medidos na F0) — todos em ficheiros 600, nunca ecoados; payloads dos
novos JWTs verificados por decode (não a assinatura).

**F2 — ordem aplicada exactamente como a restrição 4 pedia:**
1. `ALTER ROLE ... PASSWORD` como `supabase_admin` (não `postgres` — a mesma lição do
   restauro do item 21: `postgres` não é superuser nesta imagem, «permission denied to alter
   role» confirmou isso ao vivo antes de corrigir) — as três roles, mesma sessão.
2. `.env` actualizado nas 4 linhas, verificado (tamanho do ficheiro, `grep -c` de não-vazio,
   nunca o conteúdo).
3. Restart `auth` → `rest` → `tmsi-app`, `-t 60`, `supabase-db` nunca reiniciado. Saudável
   por função em cada passo: GoTrue log limpo, PostgREST log "Successfully connected to
   PostgreSQL", `/login` a servir 200, `/auth/v1/health` 200, raiz do PostgREST a responder.

**F3 — as duas famílias de prova:**
1. **Antigos mortos** (ramo que interessa, restrição 5): `ANON_KEY` antigo contra a raiz do
   PostgREST → `401`; `SERVICE_ROLE_KEY` antigo contra `/products` → `401`; o mesmo contra o
   admin do GoTrue → `403`. Um JWT **genérico, moldado como sessão** (`sub`/`role:
   authenticated`/`exp` futuro), assinado à mão com o `JWT_SECRET` **antigo** (lido só do
   ficheiro de rollback, nunca ecoado) → `401`, `PGRST301 "No suitable key or wrong..."` —
   prova a classe toda (qualquer JWT assinado com o segredo antigo, não só as duas chaves
   específicas), já que não havia um token de sessão real anterior à rotação capturado para
   testar directamente.
2. **Novos vivos:** `scripts/smoke.py` **27/27** — logins reais dos 4 papéis `.test` com as
   passwords de sempre (prova que sobreviveram, hashes bcrypt independentes do `JWT_SECRET`,
   como o ensaio de desastre já tinha estabelecido). Login fresco de `finance.test` +
   `v_products`/`v_branch_prices` com dados reais (3 linhas cada) — fontes de dados do
   dashboard confirmadas vivas com o novo `ANON_KEY`. Export não re-testado de forma
   independente (é o mesmo caminho de dados já confirmado pelo `smoke.py`, sem lógica própria
   ligada a estes 4 segredos além da leitura inicial).
3. **Ligações internas:** logs de `auth`/`rest` sem nenhum erro de autenticação desde o
   restart. Duas entradas presentes no log do GoTrue explicadas, não escondidas: a `403
   "token signature is invalid"` é a própria prova F3.1 (achado esperado); um `400 "Invalid
   login credentials"` real, do próprio `tmsi-app` (IP `172.20.40.5`, confirmado via
   `docker inspect`), **confirmado pelo Pedro como teste dele próprio** (password errada,
   sem relação com a rotação — a verificação de password é ortogonal a `JWT_SECRET`/chaves).

**F4 — re-escrow:** novo `~/backups/tmsi/tmsi-secrets-2026-09-06-rotated.gpg` (mesma
mecânica do item 21, `gpg -c`, passphrase reutilizada pelo Pedro — nunca exposta, podia ser
reutilizada por desenho). **Achado de processo, corrigido no acto:** o ficheiro da
passphrase e o `.gpg` gerado saíram com permissões `664` por omissão (o `umask 077` de uma
chamada anterior não persiste entre chamadas de shell separadas) — corrigido para `600`
manualmente antes de continuar, ambas as vezes. Decifração provada pelo Pedro (2 nomes de
variáveis, nunca valores). **Destruídos com `shred -u -z`, por esta ordem, só depois de todas
as provas passarem:** escrow antigo (valores queimados), os 4 ficheiros de geração dos
segredos novos (redundantes com o `.env` + o escrow novo), o ficheiro da passphrase, a cópia
de rollback do `.env`. **Mantido, não é um segredo queimado:** o dump de rollback
(`~/tmp/tmsi-sudo/tmsi-rotation-rollback-20260906-111135.dump`) — não contém os 4 valores
como dado, fica como backup extra.

**Nenhum segredo em output nesta sessão** — todos os valores (antigos e novos) só tocaram
ficheiros 600 ou variáveis de ambiente dentro de comandos, nunca `echo`/`print`/argv.

---

## Item 22 — Desprender a imagem do hostname (env de runtime) — ✅ FECHADA 2026-09-06

**Contexto:** achado 3 do ensaio de desastre (item 15) — `NEXT_PUBLIC_SUPABASE_URL`/
`NEXT_PUBLIC_SUPABASE_ANON_KEY` compilados no bundle do servidor em build-time, sem override
de runtime; restaurar noutro hostname ou rodar segredos (item 24) exigia refazer a imagem.

**F0 (medição):** os quatro únicos consumidores de `process.env.NEXT_PUBLIC_SUPABASE_*` em
todo o `app/src` são `lib/supabase-server.ts`, `lib/supabase-middleware.ts`,
`forgot-password/actions.ts` e `logout/route.ts` — todos server-only (confirmado: nenhum
`'use client'` os importa; `supabase-server.ts` usa `next/headers`, que o próprio Next.js
recusaria num componente cliente). Build-args em `.github/workflows/ci.yml` linhas 74-75.

**F1 (código):** os 4 ficheiros passam a ler `process.env.SUPABASE_URL`/`SUPABASE_ANON_KEY`;
Dockerfile perde os `ARG`/`ENV` de build; `ci.yml` perde o build-arg e o guard "Verify
NEXT_PUBLIC_SUPABASE_ANON_KEY is set" (deixou de fazer sentido). `docker-compose.yml` passa
as duas vars ao `tmsi-app` reaproveitando `SITE_URL`/`ANON_KEY` já existentes no `.env` — zero
chave nova, uma só fonte de verdade por valor.

**F3 — a saga do fail-fast, três tentativas falhadas antes da que funcionou, todas provadas
ao vivo, nenhuma assumida:**
1. `app/src/instrumentation.ts` com `throw` — Next.js apanha internamente, regista "Failed to
   prepare server" + `unhandledRejection` no log, mas o **processo continua vivo**, porta
   nunca abre, nunca sai.
2. Substituído por `console.error(...); process.exit(1);` — o `console.error` imprime
   correctamente (confirmado no log), mas `process.exit(1)` **não tem efeito nenhum** —
   `docker run` com `timeout 8` confirmou exit `124` (foi o `timeout` a matar, não a app).
3. Substituído por `process.kill(process.pid, 'SIGKILL')` — sinal do kernel, não
   interceptável por JS em teoria — **também sem efeito**: container ficou "Up 2 minutes",
   só um `docker kill` externo o parou. Diagnóstico: `docker top` mostrou um único processo
   `node server.js` (PID 1 real do host), mas `register()` corre nalgum contexto interno do
   Next.js/Turbopack onde nem sinais de kernel enviados de "dentro" afectam o processo real
   — causa exacta não identificada com certeza, não investigada mais fundo (retorno
   decrescente face ao custo de mais ciclos de CI).
4. **Fix real:** abandonado `instrumentation.ts` por inteiro (removido). Guard `sh -c` no
   próprio `CMD` do `app/Dockerfile`, antes de `exec node server.js` — validado localmente
   (simulação de shell + parse do JSON do `CMD`) antes de gastar mais um ciclo de CI.
   **Funcionou à primeira:** `docker run --rm` sem as vars → mensagem clara em stderr, **exit
   1 imediato**, sem timeout nenhum necessário.

**Provas finais (contra o digest realmente deployado,
`sha256:3e83bdcad2d94a22312e3e86c2da82885b2ed2f8d76ca5b0593f4594a4f7c2f7`):**
1. Literal ausente: `grep -rl tmsiequipment.duckdns.org /app/.next/` → exit 1 (zero). Também
   verificado zero ocorrências de qualquer JWT (prefixo genérico `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`,
   comum a qualquer JWT HS256, não um valor específico desta instância).
2. Fail-fast: `docker run --rm` sem `SUPABASE_URL`/`SUPABASE_ANON_KEY` → mensagem exacta +
   `exit code: 1`, confirmado directamente, sem timeout.
3. Com as vars: `docker run` com valores de controlo não mostra a mensagem de erro (roda
   normalmente até ser parado); em produção real, `docker compose up -d --no-deps tmsi-app`
   com `SUPABASE_URL=${SITE_URL}`/`SUPABASE_ANON_KEY=${ANON_KEY}` → saudável,
   `scripts/smoke.py` 27/27.
4. **Honestidade de âmbito, como pedido:** esta sessão prova a ausência do literal + o
   mecanismo de injecção/fail-fast a funcionar contra o digest real de produção — não prova
   "a mesma imagem serve outro hostname de facto", que só um próximo ensaio de desastre dá.

**Deploy:** digest `sha256:9122dfa58c40...` → `sha256:3e83bdcad2d94a22312e3e86c2da82885b2ed2f8d76ca5b0593f4594a4f7c2f7`.

**Fecho da classe:** rodar `JWT_SECRET`/`ANON_KEY` (item 24) deixa de exigir rebuild — passa a
ser um redeploy do container com o `.env` actualizado. `DEPLOY.md` §3/§9 reescritos para
reflectir isto; `ROADMAP.md` corrigido (uma entrada antiga dizia "rodar `JWT_SECRET` exige
rebuild" — deixou de ser verdade).

---

## Item 25 — `smoke.py` deixa de depender do fuso do host — ✅ FECHADA 2026-09-06

**Contexto:** achado lateral, apanhado ao vivo durante o item 21 (F6, prova da portabilidade
do `smoke.py`) — `26/27` numa corrida sem relação nenhuma com o código a testar.

**Diagnóstico:** o relógio deste VPS é WEST (UTC+1); `date.today()` (Python, hora local do
host) e `current_date` do Postgres (UTC) discordam durante a janela diária entre a meia-noite
local e a meia-noite UTC (~1h/dia). O bloco R inseria uma linha de correcção com
`effective_date` = "amanhã" segundo o Postgres; `fx_rate()` (filtro `effective_date <=
current_date`) ignorava-a, caía para uma linha antiga — daí `fx_rate=785.0 expected=787.0`.

**Fix:** `db_today()` novo, pergunta directamente ao Postgres (`select current_date;`) — as
duas comparações reais do ficheiro (bloco I, linha ~198; bloco R, linha ~403) passam a usar
esta única autoridade. O timestamp cosmético do cabeçalho impresso mantém `date.today()`
(não é uma comparação, só informativo).

**Provas:** mecanismo confirmado ao vivo (`TZ=UTC` vs `TZ=Etc/GMT+12` dão datas diferentes
agora mesmo, prova ao vivo, não histórica); `smoke.py` corrigido dá **27/27** sob os dois
extremos de fuso — a dependência do relógio do host desapareceu.

---

## Item 21 — Kit de desastre + GHCR privado + escrow de segredos — ✅ FECHADA 2026-09-06

**Contexto:** fecha as lacunas 5–8 do ensaio de restauro (`docs/DISASTER-DRILL.md`, item 15)
mais os itens 23 (GHCR privado) e o desenho do escrow (ponto 5 do 21). Seis frentes, uma
sessão. Detalhe completo de cada frente já registado nas secções próprias abaixo (F1–F6,
ordem cronológica inversa neste ficheiro); esta secção é o fecho/mapa geral pedido pelo
prompt.

**F0 (medição):** `~/.docker/config.json` já tinha uma entrada `ghcr.io`, datada de 19 de
Julho — anterior a este projecto, origem esclarecida pelo Pedro como provável PAT de pull do
Itinera (nunca decifrada nem investigada). 25 variáveis reais inventariadas no `.env` de
produção (só nomes).

**Mapa achado→prova:**
| Achado | Frente | Prova |
|---|---|---|
| GHCR público (achado 4 / item 23) | F1 | Ordem rígida: login autenticado com o pacote ainda público (TMSI **e** Itinera, coerência provada) → Pedro torna privado → re-prova → ramo de falha (`unauthorized` sem credencial) → restaurado, re-provado |
| `DEPLOY.md` obsoleto (achado 5) | F2 | Reescrito contra a produção real, incl. o procedimento de restauro provado no ensaio e o workaround de rebuild do achado 3 |
| `.env.example` incompleto (achado 6) | F3 | `deploy/supabase/.env.example` com as 25 variáveis reais, verificadas por `cut -d= -f1`; raiz corrigida para apontar lá |
| Vhost não versionado (achado 7) | F4 | `deploy/nginx/tmsiequipment.conf`, diff zero contra o real, verificado sem segredos |
| `smoke.py` não portável (achado 8) | F6 | `TMSI_BASE_URL`/`TMSI_CREDENTIALS_DIR`, 27/27 nos dois modos (sem vars e com vars explícitas) |
| Escrow de segredos (ponto 5) | F5 | `.env` + PAT GHCR cifrados (`gpg -c`, `age` não instalado), decifração provada pelo Pedro |

**Dois incidentes reais desta sessão, ambos registados honestamente, nenhum escondido:**
1. **4 segredos de produção ecoados** (`POSTGRES_PASSWORD`/`JWT_SECRET`/`ANON_KEY`/
   `SERVICE_ROLE_KEY`) — ver secção própria abaixo. **Decisão do Pedro: aceitar o risco por
   agora, rodar mais tarde** (BACKLOG item 24, ainda aberto).
2. **A passphrase do escrow teve de tocar disco** (ficheiro 600, `read -rs` não funciona
   nesta sessão), contra a intenção original da restrição 6 — `shred -u -z` imediatamente a
   seguir ao uso, desvio registado em `deploy/DEPLOY.md` §6.

**Achado lateral, não corrigido, registado (BACKLOG item 25):** `smoke.py` bloco R é sensível
à fronteira UTC/hora local (`date.today()` Python vs `current_date` Postgres) — apanhado ao
vivo a provar a F6 (26/27 antes da meia-noite UTC, 27/27 depois, sem tocar em código).

**Item 22 (imagem presa ao hostname) fica FORA desta sessão, por desenho** — o workaround de
rebuild está documentado em `deploy/DEPLOY.md` §3 enquanto a correcção não existir.

**O que sobrevive a um desastre agora, coluna por coluna do inventário F0 do ensaio:**
dump ✅ (já sobrevivia) · migrações/seed/compose ✅ (já sobreviviam) · imagens ✅ (já
sobreviviam) · imagem da app ✅ mas **privada agora**, credencial de pull sobrevive **só**
através do escrow (F5) · **segredos (`.env`) ✅ agora, via escrow** · **vhost ✅ agora,
versionado** · **passwords `.test` continuam ❌** (fora do âmbito desta sessão — o caminho
que funciona, provado no ensaio, é o reset administrativo via `SERVICE_ROLE_KEY`, que já
sobrevive pelo escrow) · **procedimento de restauro ✅ agora, escrito e provado**. A única
coisa que não sobrevive por desenho, não por lacuna, é a **passphrase do escrow** — humana,
guardada pelo Pedro em dois sítios fora desta VPS (Vaultwarden + foto), nunca no próprio
ficheiro cifrado.

---

## Item 21 F5 — Escrow cifrado de segredos — ✅ FECHADO 2026-09-06

**O quê:** `deploy/supabase/.env` + o PAT GHCR de pull (extraído de
`~/.docker/config.json`), concatenados num único ficheiro, cifrados, texto simples destruído.
`age -p` não está instalado nesta VPS — usado `gpg -c` (AES256) por omissão da restrição 6,
ficheiro nomeado `.gpg`, não `.age` (nome honesto face à ferramenta real, não o literal do
prompt). Fica em `~/backups/tmsi/tmsi-secrets-2026-09-06.gpg`, junto aos dumps — o mesmo
pull nocturno do homelab (F4/off-site) já o apanha, sem alteração nenhuma dos dois lados.

**Desvio registado, não escondido:** a passphrase devia nunca tocar disco (restrição 6). Sem
terminal interactivo real disponível a esta sessão (`read -rs` não funciona neste ambiente —
já confirmado no F1 para o token GHCR), teve de passar por um ficheiro `chmod 600` para o
`gpg --passphrase-file` a ler — a mesma limitação que já se aplica a qualquer segredo real
que uma sessão destas manuseia. `shred -u -z` imediatamente a seguir ao uso; a garantia do
`shred` é ela própria imperfeita nalguns sistemas de ficheiros/SSD — reportado como está, não
tratado como equivalente a "nunca tocou disco".

**Prova por decifração, feita pelo Pedro** (restrição 6): `gpg --decrypt` para `/tmp`,
confirmação visual de 2 nomes de variáveis (`POSTGRES_HOST`, `POSTGRES_PORT` — nunca valores
no output), `shred -u -z` da cópia decifrada a seguir.

**Passphrase:** escolhida e introduzida pelo Pedro (nunca gerada nem vista por esta sessão),
guardada por ele em dois sítios fora desta VPS (Vaultwarden + foto no telemóvel) — nota do
prompt respeitada: o servidor Vaultwarden vive nesta mesma VPS, por isso a cópia adicional
(foto) evita a dependência circular de precisar da passphrase para ajudar a restaurar a
própria máquina que a guarda.

---

## Incidente — 4 segredos de produção ecoados no output do agente — ⚠️ ABERTO 2026-09-06

**O que aconteceu:** ao inventariar as variáveis reais do `.env` de produção para o item 21
(F3, `.env.example`), um comando destinado a listar só NOMES de variáveis (`grep -v "^#"
deploy/supabase/.env | grep "="`) foi corrido sem o `cut -d= -f1` que o comando equivalente
em F0 tinha usado correctamente — os VALORES ficaram visíveis no output, incluindo
`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY` (JWT completo) e `SERVICE_ROLE_KEY` (JWT
completo). Sinalizado de imediato ao Pedro, não escondido nem minimizado.

**Classificação, pela regra já estabelecida deste projecto:** um segredo ecoado é
"exposto/queimado → rotação obrigatória" (mesma regra do `CREDENTIALS-INVENTORY.md` do
dossier), independentemente de ser um valor de teste ou de produção — aqui são os quatro
segredos-raiz da instância Supabase real, não descartáveis.

**Decisão do Pedro, registada:** aceitar o risco por agora, resolver mais tarde — não rodar
os quatro segredos de imediato (rodar `JWT_SECRET` invalida todas as sessões vivas e exige
recompor `ANON_KEY`/`SERVICE_ROLE_KEY` a partir dele; `POSTGRES_PASSWORD` exige reiniciar a
stack). **Não fechado** — fica registado como pendência real, não como incidente encerrado
sem acção.

**Nunca reimpressos nem reutilizados** depois do momento em que o erro foi detectado — a
sessão não voltou a tocar-lhes. `docs/BACKLOG.md` ganha um item próprio (24) para a rotação
pendente; `CREDENTIALS-INVENTORY.md` do dossier precisa da entrada correspondente, mas está
fora do que esta sessão VPS pode escrever directamente (só `VPS.md`/`audits/*-vps*.md`/
`CHANGELOG.md`) — texto preparado, para o Pedro colar.

---

## Item 14 — Medição de volume nas listagens (`/products`, `/prices`) — ✅ MEDIDO 2026-09-05

**Contexto (`docs/BACKLOG.md` item 14, escolhido por procura):** "nunca testado acima de 13
artigos; medir com dados de volume fictícios antes do piloto alargar." Só medição — zero
alteração de código nesta sessão, por desenho (o item pedia medir, não implementar; a
correcção certa depende do que a medição mostrasse — ver Recomendação abaixo).

**F0 — leitura do código real, não assumido.** Nem `/products` (`v_products`) nem `/prices`
(`v_branch_prices`/`v_selling_prices`) têm `.limit()`/`.range()`/pesquisa — as duas fazem um
`select` sem paginação nenhuma. `v_branch_prices` (0001 §7) faz `cross join lateral
tmsi.compute_price(p.id, b.id)` — uma chamada PL/pgSQL real por cada par (produto, filial)
visível, cada uma com vários sub-`select`s internos (fx_rate, interco_fees,
transport_tiers, customs_rates, margin_grids) — não uma operação de conjunto barata.
`v_products` filtra por `tmsi.products_visible()`, uma função aplicada linha a linha, não uma
condição indexável.

**Fixture descartável, resíduo zero:** 150 produtos sintéticos (`T-9200`..`T-9349`, `status
'draft'` — não passa pelos requisitos de activação, 0001 §3 — código HS real, ciclando pelas
4 filiais/moedas reais, cada um vendido em 2 filiais) inseridos, medidos, apagados. Contagem
de produtos confirmada de volta a 13. **Efeito colateral real, registado, não escondido:**
`audit_log` cresceu de 210 para 514 linhas (150 inserts + 150 deletes, trigger `FOR EACH
ROW`) — não revertido, por desenho: apagar entradas de auditoria de actividade que realmente
aconteceu seria pior do que a própria linha de teste lá ficar (mesmo princípio já aplicado a
outras provas ao vivo desta sessão).

**Medido (`EXPLAIN ANALYZE`, sessão `authenticated` com claims de `finance` reais, dentro de
`BEGIN`/`ROLLBACK`, nunca como `postgres` sozinho — o objectivo é o custo que a app real
paga):**

| Vista | 13 produtos | 163 produtos (13 reais + 150 fixture) | Crescimento |
|---|---|---|---|
| `v_products` (`/products`) | 13 linhas, **148 ms** | 163 linhas, **717 ms** | ~4,8× o tempo para 12,5× as linhas |
| `v_branch_prices` (`/prices`) | 33 linhas, **159 ms** | 333 linhas, **909 ms** | ~5,7× o tempo para ~10× as linhas |

Crescimento sub-linear por linha (custo fixo por consulta amortiza), mas o tempo **absoluto**
cresce de forma real e substancial — `/prices` já perto de 1 segundo só de execução na BD a
163 produtos, sem contar a viagem PostgREST + a renderização do Next.js por cima (não
medidas nesta sessão — só o tempo de execução na BD, a componente dominante nestas duas
queries, mas não a única).

**Recomendação, não implementada nesta sessão — decisão de desenho, não mecânica:** um
`LIMIT`/`OFFSET` simples na query reduziria o volume renderizado pelo Next.js, mas **não**
reduz o custo do lado da BD nestas duas vistas tal como estão — o Postgres continua a avaliar
`products_visible()`/`compute_price()` para decidir QUAIS linhas qualificam antes de poder
aplicar qualquer limite, dada a forma actual da query (função por linha, não uma condição
indexável; `cross join lateral` não permite ao planeador "parar cedo"). Uma paginação real e
eficaz precisaria de repensar a forma da vista/query (ex.: mover a visibilidade para uma
condição `WHERE` indexável em vez de uma função por linha), não só adicionar `LIMIT` ao fim —
âmbito maior do que esta medição, fica para o Pedro decidir prioridade/timing à luz destes
números reais, não de uma suposição.

**Sem regressão:** `scripts/smoke.py` 27/27 corrido depois da limpeza do fixture.

---

## Tarefa 7 — Achados 22/23 (Host no forgot-password · errors[] do motor) — ✅ FECHADA 2026-09-05

**Contexto (`docs/BACKLOG.md` itens 22/23):** fecha os 2 achados registados durante a tarefa 6
(fora de âmbito lá). Só `app/src` — zero migrações, zero infra/GoTrue/vhost tocados.

### Achado #22 — `forgot-password/actions.ts`, Host não validado

**F0 — medido antes de corrigir, não assumido.** O ficheiro construía `origin` a partir de
`(await headers()).get('host')`, alimentando o `redirectTo` de
`supabase.auth.resetPasswordForEmail()` — que o `@supabase/auth-js` envia ao `/recover` do
GoTrue. **Discrepância entre o achado e a realidade medida, reportada em vez de assumida:**
o prompt desta tarefa descrevia isto como "pior do que o redirect do logout" (o link vai
dentro de um email legítimo nosso — phishing). Medido ao vivo com `/admin/generate_link`
(`type=recovery`) contra o código tal como estava, com um `redirect_to` forjado (a simular o
que um `Host` forjado produziria): GoTrue **rejeitou** o valor e caiu para
`GOTRUE_SITE_URL` (`https://tmsiequipment.duckdns.org`) — o link gerado nunca continha o
domínio forjado. Confirmado contra a fonte real do GoTrue v2.189.0
(`internal/utilities/request.go`, `GetReferrer`→`IsRedirectURLValid`: compara `Hostname()`
via `url.Parse`, ou testa contra `URIAllowListMap` — nunca aceita um valor fora da allowlist,
cai sempre para `SiteURL`). **A exposição real já estava mitigada pela allowlist do próprio
GoTrue, mesmo sem este fix** — ao contrário da framing original da tarefa 5/7; a nota da
tarefa 5 ("pelo menos passa pelo `SITE_URL`/`URI_ALLOW_LIST`") era a mais precisa das duas.

**Fix aplicado na mesma** (commit `97ba9e4`) — depender só da validação de um sistema a
jusante como única defesa contra um header não confiável é frágil por desenho (uma
reconfiguração futura do `GOTRUE_SITE_URL`/`URI_ALLOW_LIST`, ou uma mudança de comportamento
numa versão futura do GoTrue, tornaria isto explorável de um dia para o outro, em silêncio).
Mesmo padrão do achado #1 da tarefa 6 (`1be40ef`): `origin` passa a
`process.env.NEXT_PUBLIC_SUPABASE_URL!`, valor de build, nunca lido do pedido.

**Varrimento (F0/F4):** grep exaustivo a `headers()\.get|request\.headers\.get|req\.headers\.get`
em todo o `app/src`, antes e depois do fix — `forgot-password/actions.ts` era o **único**
ficheiro com o padrão; zero ocorrências remanescentes pós-fix. Nada mais a registar no
BACKLOG desta família.

**Provas (F4):**
1. Sweep final: zero ocorrências do padrão em `app/src` (comando acima, output vazio).
2. Build correcto: `grep -rl tmsiequipment.duckdns.org /app/.next/` dentro do container
   `tmsi-app` **desta imagem** confirma o valor de `NEXT_PUBLIC_SUPABASE_URL` realmente
   embutido no bundle compilado, não assumido do `ci.yml` de memória.
3. Fluxo normal intacto: `POST /auth/v1/recover` (de dentro do container, sem password
   nenhuma) contra `logistics.test` → `200`; uma segunda tentativa imediata → `429` (o
   próprio limite de frequência do GoTrue, `validateSentWithinFrequencyLimit` — comportamento
   esperado, não uma falha).
4. **Não tentado, por desenho:** invocar a Server Action `requestPasswordReset` directamente
   por HTTP para replicar o forjar do `Host` pelo caminho exacto do browser — fabricar o
   protocolo de Server Actions do Next.js continua desaconselhado (i9/i10, duas tentativas
   abandonadas). O código já não lê `headers()` nenhum — é uma garantia estrutural (leitura
   de código), não só empírica, de que um `Host` forjado não tem já nenhum caminho de código
   para influenciar o resultado.

### Achado #23 — `errors[]` do `compute_price()` nunca chegava ao ecrã

**F0 — inventário real das 5 condições de erro "soft"** (contra `0001_initial_schema.sql`
§7, `compute_price()` — cada uma usa um valor por omissão e o cálculo continua, nunca
interrompe):
1. `missing exchange rate` — `tmsi.fx_rate()` nulo para a moeda do produto ou da filial (sem
   override `fx` activo, moeda ≠ EUR).
2. `missing interco fee` — filial ≠ filial primária do produto, sem linha em
   `tmsi.interco_fees` para o par (fornecedora, vendedora) (sem override `fee`).
3. `missing transport tier / weight` — filial ≠ primária, tipo não `option`/`service`, sem
   tier em `tmsi.transport_tiers` para a filial/peso (sem override `transport`).
4. `missing customs rate for HS/zone` — filial ≠ primária, tipo não `option`/`service`, sem
   linha em `tmsi.customs_rates` para o par (HS, zona) (sem override `duty`).
5. `missing margin grid` — `tmsi.branch_margin()` nulo e não é uma opção a herdar a margem
   do pai (sem override `margin`).

Confirmado ao vivo (`row_to_json`) que o array `errors` **já vinha em todas as respostas do
RPC** — nunca precisou de mudança na query; o gap era só de tipo TypeScript
(`PriceBreakdown` não o declarava) e apresentação (a célula "Alert" mostrava só `r.alert`,
que já valia o texto opaco `'error'` quando `errors` não estava vazio —
`array_length(err,1) > 0 then 'error'`, 0001 §7 — indistinguível de `critical`/`warning`/
`ok`, sem nunca mostrar qual condição falhou). Confirmado por consulta directa que **nenhum
produto real actual** tem hoje um erro soft (0 linhas) — a prova exigiu um fixture
descartável, como antecipado pelo prompt.

**Fix** (commit `5c33021`): `PriceBreakdown` ganha `errors: string[] | null`; a célula
"Alert" mostra a lista de `errors` (role="alert", vermelho) sempre que não vazia, caindo no
`r.alert` antigo nos restantes casos. Nenhuma mudança ao cálculo — puramente apresentação.

**Prova (F4), fixture descartável, resíduo zero:** `tmsi.hs_codes` código `999999` (sem
`customs_rate` associada, único gap fácil de construir sem tocar em nenhuma linha
partilhada — `interco_fees`/`transport_tiers`/`margin_grids` estavam **completamente**
cobertos para as 4 filiais, sem gap nenhum a explorar sem mexer em dados reais) + produto
descartável `T-9099` (`status='draft'`, filial primária `SA`, também vendido em `TBM`).
`compute_price('T-9099','SA')` → `alert='ok', errors={}` (filial primária, sem duty); `compute_price('T-9099','TBM')` →
`alert='error', errors={"missing customs rate for HS/zone"}` — exactamente uma condição
isolada, replicado com claims JWT de uma sessão `finance` real (não só como `postgres`),
confirmando que é isto que a página realmente recebe. `min_price` da filial `TBM` saiu
artificialmente inflacionado (`duty_rate` a cair para `0` em silêncio) — a demonstração
concreta de porque este achado importa. Fixture apagado no fim (`hs_codes`/`products` de
volta a 5/13, contagens confirmadas); decisão registada: sem forma de coordenar um olhar
síncrono do Pedro no browser antes de fechar a sessão, optei por provar e apagar já, deixando
nota de que o fixture é trivial de reconstruir se algum dia quiser vê-lo ao vivo.

**Deploy:** digest `sha256:8b466fa373...` → `sha256:9122dfa58c40add4da785bb85e9c4595336e0f88c78439b7283cb1fa0d259f18`,
`scripts/smoke.py` **27/27** três vezes (pós-deploy, pós-fixture-criado, pós-fixture-apagado)
— sem regressão nenhuma.

**`VERIFICATION-PROTOCOL.md` — avaliado explicitamente, não alterado.** Achado #22 é da
mesma família do achado #1 da tarefa 6 — a mesma conclusão de lá aplica-se sem precisar de
repetir a análise: nenhum teste com letra existente cobre o alvo exacto do redirect do
forgot-password. Achado #23: os testes A/B (breakdown do motor) verificam que os valores
ficam preenchidos, nunca a coluna "Alert"/`errors[]` especificamente — nenhum teste existente
cobre isto também. Nenhuma célula a actualizar nos dois casos.

---

## Piloto — preparação do onboarding — ✅ achado corrigido 2026-09-05

**Contexto:** ao preparar o guião passo-a-passo de onboarding do piloto (`docs/BACKLOG.md`
item 8), testado ao vivo o mecanismo real (conta descartável, não uma leitura de código) antes
de o documentar — e encontrado um bloqueio real que teria partido o primeiro colega novo.

**Achado:** com `GOTRUE_MAILER_AUTOCONFIRM=false` (deliberado, é a fronteira do signup
público), um utilizador recém-convidado (`inviteUser` → `/invite`) fica com
`email_confirmed_at = null`. O reset de password por admin (`resetPassword`,
`admin/users/actions.ts`) enviava só `{password}` ao endpoint `PUT /admin/users/{id}` do
GoTrue — não confirma o email. Resultado: o colega recebe a password temporária, tenta entrar,
e o GoTrue recusa com `400 "Email not confirmed"`, mesmo com a password certa. Exactamente a
dependência do email que o mecanismo da i9 devia eliminar, reintroduzida pela porta do lado.

**Lição registada:** a adenda W-Z do `VERIFICATION-PROTOCOL.md` (i9) só tinha testado esta
chamada contra `logistics.test`, uma conta criada muito antes e já confirmada — nunca
exercitou o caminho de um convite genuinamente fresco. A prova "passou" na altura porque o
cenário testado não era o cenário real de onboarding.

**Fix (commit `0c05ac4`):** `resetPassword` passa a enviar `{password, email_confirm: true}`
— só nesta chamada, já protegida por `isAdmin()` + `userId` explícito. Não mexe em
`GOTRUE_MAILER_AUTOCONFIRM` global nem na fronteira do signup público, que continua igual.

**Provas ao vivo (duas, ambas com resíduo zero):**
1. **Conta descartável nova** (`onboarding-proof2.test@example.test`) — `invite` (mirror de
   `inviteUser`, incl. o insert em `tmsi.profiles`) → antes do fix, login devolvia `400
   "Email not confirmed"` (confirmado num descartável anterior, apagado); com o fix, `reset`
   com `email_confirm:true` → `email_confirmed_at` passa a preenchido → login `200` com
   `access_token`. `must_change_password` actualizado para `true` na mesma linha (mirror do
   segundo passo de `resetPassword`) — confirmado por `UPDATE ... RETURNING`. **Ramo do
   middleware (redirect para `/account/password`) provado por leitura de código, não ao
   vivo** — `middleware.ts` redirecciona sempre que `user && mustChangePassword &&
   !isPublic && !isChangePasswordPath`, incondicional; fabricar cookies reais do
   `@supabase/ssr` por `curl` continua desaconselhado (duas tentativas abandonadas, i9/i10).
   Conta apagada no fim (`DELETE /admin/users/{id}`, cascata confirmada: zero linhas em
   `auth.users` e `tmsi.profiles`).
2. **`logistics.test`, já confirmado desde 2026-09-04** — reset com o fix para uma password
   temporária nova → login `200` sem problema (comportamento inalterado do ponto de vista do
   utilizador). **Efeito colateral real, registado, não escondido:** `email_confirmed_at`
   **é reescrito para "agora"** pelo GoTrue sempre que `email_confirm:true` é enviado, mesmo
   já estando confirmado — não preserva a data original de confirmação. Sem impacto de
   comportamento (nada em `app/src` lê `email_confirmed_at`; login continua a funcionar
   exactamente igual), mas é uma mudança de dado real, não hipotética. Password original
   restaurada a seguir (capturada só por `$(cat ficheiro)` inline, nunca exibida), login
   confirmado de volta com o valor restaurado — ficheiro de password não precisou de
   actualização.

**Deploy:** digest `sha256:32c45cf2...` → `sha256:8b466fa373f473ef9ac94cb720e9110ea02170bf7908f94271fa220a2c77346a`,
`scripts/smoke.py` **27/27** (corrido duas vezes: logo após o deploy e de novo depois das duas
provas ao vivo, incluindo a manipulação directa de `logistics.test`).

**`VERIFICATION-PROTOCOL.md`:** a adenda i9 (W-Z) tinha um gap real, não apenas uma cobertura
parcial admitida — nota acrescentada no próprio local (secção 7) a fechar esse gap
especificamente, sem reabrir os restantes itens "por cobrir" dessa adenda (screenshots reais,
gateway corporativo), que continuam como estavam.

---

## Tarefa 6 — Correcção dos 9 achados do code review — ✅ FECHADA 2026-09-05

**Contexto (`docs/BACKLOG.md` item 21):** fecha os 9 achados triados na tarefa 5, só em
`app/src` — zero migrações, zero infra/vhost/GoTrue/compose para além do digest do deploy.
Pré-condição para o piloto (item 8).

**Nota de numeração:** o prompt desta tarefa trocou a ordem dos achados 1/2 face ao relatório
original da tarefa 5 (aqui: 1=ban-status, 2=open redirect; no prompt e nos commits desta
tarefa: 1=open redirect, 2=ban-status). Os dois foram fechados na mesma sessão; a tabela
abaixo usa o nome do ficheiro como chave, sem ambiguidade.

**Mapa achado → commit → prova**, todos em `app/src`, nenhuma migração/infra tocada:

1. **`logout/route.ts` — open redirect.** Verificado por leitura do código-fonte real do
   Next.js (`response.ts`/`utils.ts`) que `NextResponse.redirect()` rejeita um caminho
   relativo puro (`validateURL` faz `new URL(url)` sem base) — não era opção. Corrigido para
   resolver `/login` contra `NEXT_PUBLIC_SUPABASE_URL` (valor de build, já usado por
   `supabase-server.ts`/`supabase-middleware.ts`, igual à origem pública real desta app),
   nunca mais a partir do `Host` do pedido. Commit `1be40ef`. **Prova ao vivo:** `curl -X
   POST` directo ao container (`172.20.40.1:3001/logout`, contorna o *vhost matching* do
   nginx) com `Host: evil.example.com` forjado devolve `Location:
   https://tmsiequipment.duckdns.org/login` — idêntico ao pedido de controlo com o Host real.
   Nota lateral, não corrigida (fora do âmbito): `forgot-password/actions.ts` constrói o
   `redirectTo` do Supabase pelo mesmo padrão de `Host` não validado — registada em
   `docs/BACKLOG.md` como achado novo, não corrigida nesta tarefa.
2. **`admin/users/page.tsx` — falha silenciosa no estado de ban.** Uma falha do fetch ao
   GoTrue Admin API (`gotrueRes.ok === false`) já não deixa `bannedIds` vazio em silêncio:
   mostra um banner de aviso (mesmo estilo do `profilesError` já existente) e troca o badge de
   cada utilizador por "ban status unknown" enquanto a leitura falhar. Commit `6b9a3f4`.
   **Prova do ramo de erro: por leitura de código, não ao vivo** (GoTrue não pode ser
   derrubado de forma limpa sem afectar toda a stack de auth, incluindo o piloto — risco
   desproporcional ao valor da prova). O `if/else` é incondicional, sem caminho que deixe
   `banStatusError` nulo quando `gotrueRes.ok` é falso. **Prova do ramo normal: ao vivo** —
   `logistics.test` banido e desbanido via GoTrue Admin API (chamada de dentro do container,
   `SERVICE_ROLE_KEY` nunca impresso), `banned_until` confirmado `null → 2126-08-12T… →
   null`, sem resíduo. A confirmação visual do ecrã (badge a aparecer correctamente) fica para
   a verificação do Pedro no browser, como habitual para sessões autenticadas.
3. **`products/[id]/page.tsx` — erro de `compute_price()` engolido.** `priceRows` já não lê só
   `.data`; um novo `priceErrors` capta `{branchId, message}` de qualquer chamada RPC com
   `.error`, com uma linha própria na tabela (`role="alert"`, "Calculation error: …").
   Commit `40938e3`. **Prova:** o motor de `compute_price()` (0001 §7) não costuma lançar
   excepção Postgres real para dados em falta — tem o seu próprio array `errors[]` "soft" que
   absorve a maioria dos casos (câmbio/fee/transporte/direito em falta) sem falhar o RPC; um
   `.error` real do PostgREST exigiria um cenário mais raro (falha de sistema/permissão). Sem
   forma limpa de o forçar ao vivo sem um estado persistido artificial — provado por leitura de
   código; o caminho normal foi confirmado ao vivo pelo próprio `smoke.py` (bloco B, "engine
   coherence" continua a bater API==BD depois do fix). **Achado novo, registado, não
   corrigido:** o array `errors[]` do próprio `compute_price()` nunca chega a ser lido pela
   página (nem está no tipo `PriceBreakdown`) — um "soft error" (ex.: câmbio em falta) fica
   sem indicação nenhuma no ecrã hoje. Diferente do achado #3 original (que era sobre `.error`
   do RPC, não sobre este array de dados) — registado em `docs/BACKLOG.md`, fora do âmbito
   desta tarefa.
4. **`admin/users/actions.ts` (`resetPassword`) — sucesso falso com 0 linhas.** O `UPDATE` de
   `must_change_password` ganhou `.select()`; um array devolvido vazio agora é um erro
   explícito ao admin. Commit `806cfad`. **Prova ao vivo:** `UPDATE … WHERE user_id =
   '00000000…'` (garantidamente inexistente) como `authenticated` com claims de admin
   injectadas por `psql` (sem password nenhuma), dentro de `BEGIN`/`ROLLBACK` — `UPDATE 0`,
   `RETURNING` devolve `(0 rows)`, sem erro nenhum — exactamente a condição que o `if
   (!flagRows || flagRows.length === 0)` agora apanha.
5. **`config/page.tsx` — badge "in use" da FX errado.** Deixou de agrupar por
   `(currency, effective_date)`; agora segue exactamente o critério do `tmsi.fx_rate()`
   (0001 §7 + tie-break 0005): ignora datas futuras, primeira linha vista por moeda na mesma
   ordenação da query (`currency, effective_date desc, created_at desc`). Commit `e4abbce`.
   **Prova ao vivo, com os dados reais actuais:** CNY tem 3 datas distintas (4 linhas), USD
   tem 2 datas (5 linhas, incluindo 4 no mesmo dia — o cenário da 0005), GBP tem 2 datas —
   `select distinct currency, tmsi.fx_rate(currency) from tmsi.exchange_rates` devolve
   exactamente uma linha por moeda (CNY=785, GBP=10, USD=1.1587), e essa linha é, em cada
   caso, a primeira vista na ordenação da query — a lógica antiga marcaria 3 linhas "in use"
   para o CNY (uma por data) em vez de 1.
6. **Duplicação `overrideStatus()`/`status()` — extraída.** Novo
   `app/src/lib/override-status.ts`; `overrides/page.tsx` e `products/[id]/page.tsx` importam
   dali, funções locais removidas. Commit `f2c6983` (isolado do achado #3 no mesmo ficheiro
   por *patch* manual, verificado byte-a-byte contra a versão combinada original antes de
   committer). **Prova:** as duas implementações eram idênticas antes de extrair (confirmado);
   a função extraída, corrida ao vivo contra os 4 `price_overrides` reais actuais, classifica
   todos como `active` — igual ao que as duas versões antigas dariam para os mesmos dados.
7. **`products/new/actions.ts` — `String()` → `Number()`.** Alinhado com `updateProduct`
   (`Number(...) ?? 0`), com `if (!Number.isFinite(exw_price)) return { error: 'Invalid EXW
   price' }` antes de qualquer chamada ao Supabase. Commit `2f9b92c`. **Prova:** `Number(
   "abc")` → `NaN` → `Number.isFinite` → `false`, confirmado a correr dentro do próprio
   container `tmsi-app` (mesmo runtime Node da app); chamar o Server Action em bruto por HTTP
   para confirmar o caminho completo foi deliberadamente **não tentado** — fabricar o
   protocolo de Server Actions do Next.js por `curl` está desaconselhado desde a i9/i10
   (`~/CLAUDE.md`, duas tentativas abandonadas). A confirmação do formulário real fica para o
   Pedro no browser.
8. **`ActionState`/`ErrorText` duplicados — consolidados.** Novo
   `app/src/lib/action-state.ts` (`ActionState<TSuccess = unknown>`) e
   `app/src/lib/error-text.tsx`; os 5 ficheiros `actions.ts` com o padrão completo
   `{error}|{success}` e os 3 `ErrorText` locais agora importam de `lib/`. Commit `f06752b`
   (isolado do achado #4 em `admin/users/actions.ts` pelo mesmo método de *patch* manual).
   **Discrepância corrigida vs. o desenho sugerido no prompt:** `TSuccess` por omissão tem de
   ser `unknown`, não `Record<string, never>`/`Record<string, unknown>` — uma *index
   signature* no ramo de sucesso partiria o `'error' in state` de que o `ErrorText` depende
   para distinguir os dois ramos (`true & never = never`, tornando `{success:true}` não
   construível). `unknown` é a identidade em intersecção (`X & unknown = X`), preserva os dois
   ramos exactamente como estavam. Puramente tipo-a-tipo, sem mudança em runtime.
9. **`lib/supabase-client.ts` — código morto removido.** Re-confirmado por `grep` próprio
   (não só a revisão anterior) que `createSupabaseBrowserClient` não tinha nenhum uso; ficheiro
   inteiro removido (não sobrava nada digno de preservar). Commit `5ccf1c6`. **Prova:** `grep`
   final a `createSupabaseBrowserClient`/`supabase-client` em todo o `app/src` — zero
   ocorrências (as três menções que restavam eram comentários de prosa noutros ficheiros,
   actualizados no mesmo achado e no #1).

**Deploy e regressão (F4):** commit `76c9f6a` — digest
`sha256:c264c1194b66...` → `sha256:32c45cf2c98b21f5642cb5b2fd435359f1c7f82e6153f3df71b02aadfb64cb79`
(imagem do CI, `Created` 2026-09-05T19:55Z), `docker compose up -d --no-deps tmsi-app`,
container saudável, `scripts/smoke.py` **27/27** — corrido duas vezes (logo após o deploy e de
novo no fim, depois de todas as provas ao vivo desta tarefa), sem regressão nenhuma nas duas.

**VERIFICATION-PROTOCOL.md — avaliado explicitamente, não alterado:** nenhum dos achados #1/#2
toca em nenhum teste com letra existente (A–T, nem W–Z da revisão da i9). O teste W menciona
`/logout` só como rota de excepção do middleware, não testa o alvo do seu redirect; nenhum
teste W–Z exercita o badge de ban-status do `/admin/users` (W–Z são sobre reset/troca de
password, não sobre o toggle de ban). Não há teste existente a actualizar.

**Achados novos, registados em `docs/BACKLOG.md`, não corrigidos nesta tarefa** (âmbito restrito
aos 9 achados originais): (a) `forgot-password/actions.ts` com o mesmo padrão de `Host` não
validado do achado #1 original; (b) o array `errors[]` do próprio `compute_price()` nunca chega
ao ecrã, distinto do achado #3 original.

**Recursos do VPS durante a tarefa:** disco 49%, RAM+swap disponível sempre acima do limiar de
paragem (swap com 2,9 GB livres no momento do deploy). Sem drop-in de sudo necessário — nenhuma
alteração de infra.

**Confirmação do Pedro (sweep no browser) — 2026-09-05:** `/admin/users` (bans), um detalhe de
produto (breakdown), `/config` (FX "in use") e `/overrides` — "tudo ok", nada mudou no ecrã
além do pretendido pelos 9 achados.

---

## Tarefa 5 — Code review read-only da app — ✅ FECHADA 2026-09-05

**Contexto (`docs/BACKLOG.md` tarefa 5):** revisão só de leitura — caminhos de erro,
segredos em logs, código morto, manutenibilidade — relatório de achados triados, sem
reescrita nenhuma; prepara também a entrega E6.

**Âmbito:** `app/src` completo (48 ficheiros, ~5.557 linhas), com verificação cruzada
contra `supabase/migrations/*.sql` onde relevante.

**Segredos em logs — limpo, confirmado por `grep`, não assumido:** zero chamadas
`console.*` em todo o `app/src`; `SERVICE_ROLE_KEY` e passwords geradas nunca aparecem em
nenhum caminho de log.

**Nove achados, ordenados por severidade (relatados via `ReportFindings`, texto completo
aí — resumo aqui):**
1. 🔴 **`admin/users/page.tsx`** — a leitura do estado de ban ao GoTrue não tem ramo de
   erro; se falhar, todos os utilizadores aparecem como activos em silêncio, incluindo os
   realmente banidos.
2. 🔴 **`logout/route.ts`** — o redirect usa o cabeçalho `Host` bruto sem lista de domínios
   permitidos (open redirect potencial), ao contrário do fluxo de reset de password, que
   pelo menos passa pelo `SITE_URL`/`URI_ALLOW_LIST` do GoTrue.
3. 🟠 **`products/[id]/page.tsx`** — erros do `compute_price()` por filial são descartados
   em silêncio (só `.data` é lido, nunca `.error`), indistinguível de "sem preço para esta
   filial".
4. 🟠 **`admin/users/actions.ts`** (`resetPassword`) — a actualização de
   `must_change_password` não confirma que alguma linha foi mesmo afectada; um `UPDATE` de
   zero linhas reporta sucesso na mesma.
5. 🟡 **`config/page.tsx`** — o estado "in use" da listagem de câmbios marca uma linha por
   grupo (moeda, data), mas `fx_rate()` só usa mesmo uma linha por moeda (a mais recente) —
   linhas de dias mais antigos ficam também marcadas "in use", incorrectamente.
6. 🟡 **`overrides/page.tsx`** vs. **`products/[id]/page.tsx`** — a classificação
   activo/expirado/futuro de um override está duplicada verbatim nos dois ficheiros, risco
   de desvio numa correcção futura.
7. 🟡 **`products/new/actions.ts`** — `createProduct` usa `String(...)` para o `exw_price`
   em vez de `Number(...)` (o padrão em todo o resto do código, incluindo o `updateProduct`
   irmão) — sem validação, um pedido directo à API sem passar pelo `type="number"` do HTML
   cai num erro de *cast* do Postgres em bruto.
8. ⚪ **`admin/users/client-forms.tsx`** e ~10 ficheiros `actions.ts` — o padrão
   `{error}|{success}|undefined` e o seu `ErrorText` estão redeclarados independentemente
   em vez de viverem uma vez em `lib/`.
9. ⚪ **`lib/supabase-client.ts`** — `createSupabaseBrowserClient` é código morto, nunca
   importado nem chamado em nenhum sítio de `app/src` (esta app é toda Server
   Components/Server Actions).

**Decisão registada, não tomada por mim:** nenhum destes achados foi corrigido nesta
sessão (a restrição do prompt é explícita — só relatório). Os dois primeiros (🔴) são os
únicos com relevância de segurança directa; ficam disponíveis para entrarem no
`docs/BACKLOG.md` como tarefa nova, a prioridade e calendário são decisão tua.

**Contexto (`docs/BACKLOG.md` tarefa 4):** medir e fixar rate-limits do GoTrue, política de
password, e headers do vhost — com a lacuna do `PUT /auth/v1/user` (i9/i10: o próprio
GoTrue não exigia a password actual, só a nossa app o fazia) explicitamente à cabeça.

**F0 — medido antes de fixar, contra o código-fonte real da versão pinada (v2.189.0), não
assumido de memória (`internal/conf/configuration.go`, `internal/api/user.go`,
`internal/api/admin.go`, todos lidos linha a linha):**
- **Password:** `MinLength` por omissão = 6 (`defaultMinPasswordLength`); `RequiredCharacters`
  vazio (nenhuma classe exigida). Nem `GOTRUE_PASSWORD_MIN_LENGTH` nem
  `GOTRUE_PASSWORD_REQUIRED_CHARACTERS` estavam definidas — confirmado por `grep` ao
  `docker-compose.yml` real, não assumido.
- **`PUT /auth/v1/user` sem verificação de password actual** — confirmado, e a causa raiz:
  `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD` (campo real, não inventado —
  `internal/api/user.go` linhas 176–201: lê `current_password` do corpo, chama
  `user.Authenticate()` contra o hash guardado, dois `ErrorCode` distintos para
  "em falta"/"errada") estava a `false` (não definido, por omissão). **Duas condições
  confirmadas antes de activar**, para não partir nada: (a) `session.IsRecovery()` isenta
  explicitamente sessões de recuperação — o fluxo por email da i1 (`reset-password/
  actions.ts`) não é afectado; (b) o endpoint admin (`internal/api/admin.go`,
  `adminUserUpdate`) **não tem nenhuma verificação deste tipo** — o reset da i9 continua a
  não precisar da password antiga do utilizador-alvo, por desenho.
- **Rate limit em `/token`:** GoTrue tem onze campos `RateLimit*` na configuração real —
  email, SMS, refresh de token, SSO, OTP, utilizadores anónimos, web3, passkey, registo
  OAuth — **nenhum cobre `grant_type=password`**. Confirmado célula a célula contra o
  `GlobalConfiguration`, não assumido por analogia com os outros. `fail2ban` neste host só
  tem o jail `sshd` activo (`/etc/fail2ban/jail.local`) — os filtros `nginx-*` existem no
  pacote mas não estão ligados a nenhum jail.
- **Headers do vhost:** nenhum dos quatro (HSTS/CSP/X-Frame-Options/Referrer-Policy) estava
  definido em `/etc/nginx/sites-available/tmsiequipment.conf` — confirmado por leitura
  directa do ficheiro real.

**F1 — fixado:**
1. **App:** `account/password/actions.ts` simplificado — deixa de verificar a password
   actual com um cliente descartável (`signInWithPassword`), passa `current_password` a
   `updateUser()` directamente. `@supabase/auth-js@2.115.0` (a versão pinada exacta deste
   projecto — descarregado e inspeccionado o `.d.ts` real, não assumido) já tipa
   `UserAttributes.current_password?: string`, com o comentário do próprio pacote a citar
   esta variável do GoTrue pelo nome — nenhuma actualização de dependência precisou de
   acontecer. Deployado **antes** de activar a variável no GoTrue (o campo é ignorado em
   silêncio enquanto a flag estiver desligada — ordem sem janela de quebra em qualquer dos
   dois sentidos, mas esta foi a escolhida).
2. **GoTrue (`deploy/supabase/docker-compose.yml`):**
   `GOTRUE_PASSWORD_MIN_LENGTH=12`; `GOTRUE_PASSWORD_REQUIRED_CHARACTERS` com quatro classes
   (minúsculas:maiúsculas:dígitos:símbolos, sem `$` no conjunto de propósito — o valor passa
   pela própria interpolação `${...}` do docker compose); `GOTRUE_SECURITY_
   UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true`.
3. **nginx:** `conf.d/tmsi-rate-limits.conf` novo (`limit_req_zone
   $binary_remote_addr zone=tmsi_auth:10m rate=10r/m`); `location = /auth/v1/token`
   (*exact match*, não a prefixo `/auth/v1/`, para não afectar `/health`/`/user`/`/verify`)
   com `limit_req zone=tmsi_auth burst=5 nodelay` — cobre também `grant_type=refresh_token`
   (nginx não distingue por query string sem `if`, que `limit_req` não suporta de forma
   fiável dentro de `if`) — margem verificada contra o uso real: `JWT_EXPIRY=3600s`, poucos
   refreshes/hora mesmo com vários utilizadores do piloto atrás do mesmo IP. Quatro
   `add_header ... always` no `server{}` do vhost — `Content-Security-Policy` com
   `'unsafe-inline'` em `script-src`/`style-src`: **decisão consciente, não um descuido** —
   confirmado ao vivo que a app usa `<script>(self.__next_f=...).push(...)</script>` inline
   para o streaming/hidratação do Next.js, e não há *nonce* ligado no `middleware.ts` (o
   padrão oficial do Next.js para isso exige forçar renderização dinâmica em toda a app e
   fica fora do âmbito "headers do vhost" desta tarefa — registado como melhoria futura, não
   escondido). Todas as outras directivas (`default-src`, `object-src`, `frame-ancestors`,
   `connect-src`, `form-action`, `base-uri`) ficaram estritas — a app nunca chama uma API
   externa nem submete um formulário fora do próprio domínio.

**Drop-in de sudo, reportado por inteiro (regra do `~/CLAUDE.md`):** `/etc/sudoers.d/
atelier-tarefa4`, cinco comandos exactos (backup do vhost, instalar o rate-limit novo,
instalar o vhost novo, `nginx -t`, `systemctl reload nginx`) — nada de `tee`/`bash`
genérico. **Instalado pelo Pedro** (esta sessão não tinha sudo nenhum, nem para o próprio
`sudo -l` — o problema do "ovo e da galinha" de um drop-in que só um root já activo pode
instalar). Usado, depois **removido** de imediato (`sudo -n -l` voltou a falhar a seguir,
confirmando a remoção, não só assumida).

**F2 — provas ao vivo:**
1. **Headers:** os quatro presentes em `/`, incluindo numa resposta de erro (307 para um
   caminho inexistente) — confirma o `always`.
2. **Brute-force controlado:** 10 pedidos rápidos a `/auth/v1/token` com credenciais
   inventadas → os primeiros 6 devolvem `400` (recusa normal do GoTrue), do 7.º ao 10.º
   `503` (nginx a recusar) — exactamente `1 + burst 5 = 6` como configurado. Depois de
   esperar 15 s, um novo pedido volta a `400` — confirma que o limite recupera, não é um
   bloqueio permanente.
3. **Password fraca recusada:** `422` "should be at least 12 characters" (8 caracteres);
   `422` "should contain at least one character of each: ..." (12+ caracteres mas sem
   símbolo) — mensagens exactas do próprio GoTrue, não inventadas.
4. **`current_password` em falta/errada → recusada; correcta → aceite:** `400` "Current
   password required when setting new password." nos dois primeiros casos (a mesma
   mensagem para ambos — comportamento do próprio GoTrue, não um defeito daqui); `200` com
   a password actual certa. Testado contra `finance.test`, revertido a seguir.
5. **Isenção do fluxo de recuperação e não-afectação do endpoint admin:** confirmadas por
   leitura directa do código-fonte (F0), **não replicadas ao vivo** — construir uma sessão
   de recuperação sintética via `/admin/generate_link` teria exigido engenharia adicional
   substancial só para confirmar algo já evidenciado por código verbatim; risco/benefício
   desfavorável. Se quiseres confirmação ao vivo, um reset por email real (i1/i9) sem
   `current_password` nenhum a continuar a funcionar é prova suficiente.
6. `scripts/smoke.py`: **27/27**, sem regressão — inclui a interacção com o rate limit novo
   (4 logins sequenciais, dentro dos 6 admitidos).
7. Sem regressões: `/`, `/login`, `/prices`, `/products`, `/prices/export`,
   `/products/export`, `/admin/users`, `/config`, `/overrides`, `/audit`, `/dashboard`,
   `/account/password`, `/forgot-password`, `/reset-password`, `/auth/v1/health`,
   `/rest/v1/` — todos com o código esperado. Footprint: RAM disponível 216 MB, disco 49%.

**Achados de processo, sinalizados, sem consequência real:**
1. Ao testar o "reverter" da password de `finance.test` depois da prova 4, a reversão
   falhou (`422`) — a password *original* dessa conta (criada na i5, antes desta política
   existir) tinha 32 caracteres mas **nenhum símbolo**, por isso já não passa a política
   nova como valor a definir (continuava a funcionar para login — só a *definição* de novas
   passwords é verificada, não os hashes já guardados). Gerada uma nova, conforme à
   política, ficheiro actualizado, login confirmado. **Verificação preventiva das outras
   três contas de teste** (só leitura local, sem chamadas à API): `pm.test` e
   `branch_manager.test` já conformes; `logistics.test` (regenerada na tarefa 3, antes desta
   política) não tinha nenhum símbolo pela mesma razão — corrigida da mesma forma.
2. Durante a prova 4 (o valor temporário para `finance.test`), escrevi a password nova como
   um literal directamente no texto do comando (`TEMP_PW="Zz9!...⁠"`), em vez de a gerar por
   `openssl rand` como é o padrão já estabelecido (i9). Nunca chegou a nenhum *output*
   (nunca foi impressa, só usada como argumento), mas fica sinalizada por precaução — o
   valor foi substituído momentos depois pela geração própria, apropriada, do achado 1.

**F3 — sem migração, sem mudança de digest da app além da F1.1** (o digest final é o mesmo
que fechou a mudança de código do `current_password` — a parte de config do GoTrue/nginx
não precisa de nova imagem).

## Tarefa 3 — Smoke tests automatizados + lockfile — ✅ FECHADA 2026-09-05

**Contexto:** duas dívidas antigas numa sessão (`docs/BACKLOG.md` tarefa 3) — nenhuma rede
automatizada entre execuções formais do `VERIFICATION-PROTOCOL.md` (dependente de olhos
humanos até agora) e builds não-reprodutíveis (`npm install` no Dockerfile desde a E1, sem
`package-lock.json`, pendência registada nessa altura, ver acima).

**F0:** python3 (3.12.3) e `jq`/`curl`/`docker` já confirmados no host (E0). Blocos G–J
(secção 4.2/4.3, fronteiras do papel sem custos/de filial) e O–R (secção 4.4, integridade
das regras de negócio) extraídos do `VERIFICATION-PROTOCOL.md` como o contrato exacto a
automatizar — citados nos comentários do próprio `smoke.py`, não reinterpretados.

**F1 — `scripts/smoke.py` (27/27 asserções ✅, detalhe secção acima "F1"):** login real
(password grant) para `finance.test`/`pm.test`/`logistics.test`/`branch_manager.test` — sem
conta admin de teste (só existe a do próprio Pedro, explicitamente fora do smoke por
restrição do prompt) e sem `sales.sa`/`agent.apac` (evitados deliberadamente: a única forma
seria ler o ficheiro combinado e ambíguo de passwords já ligado a um incidente conhecido,
i6 — `logistics.test`/`branch_manager.test` já cobrem as mesmas fronteiras sem essa
ambiguidade). Todas as escritas recusadas ficam sem residir por construção (RLS nega antes
de qualquer linha existir); as duas escritas que têm de suceder para provar o efeito (P, R)
ficam sem resíduo por `BEGIN`/`ROLLBACK` (P, efeitos em duas tabelas) ou por
inserir-verificar-apagar via a própria API REST (R) — confirmado por leitura fresca depois
em ambos os casos, não só por confiança no mecanismo.

**Quatro bugs reais, apanhados a construir e testar o próprio smoke, todos no script, não
na app (detalhe completo nos comentários do próprio `smoke.py`):**
1. `psql -t` sozinho não suprime as tags de conclusão (`BEGIN`, `DO`) que a `psql` imprime
   mesmo em modo tuplas-só quando o script tem comandos de controlo de transacção/blocos
   `DO` — precisou também de `-q`. Sem isto, `int("BEGIN")` rebentava o parser do próprio
   script.
2. A ambiguidade "200/0 linhas" já conhecida deste projecto (i4/i5/i9) aplica-se
   igualmente às verificações do próprio smoke — um `PATCH` recusado por RLS podia devolver
   `200`/`204` sem corpo, indistinguível de um `200` com a linha realmente tocada;
   `Prefer: return=representation` tornou a distinção explícita.
3. Comparar `"949.0"` (JSON, sem zero à direita) com `"949.00"` (texto do `psql`, escala
   preservada) como strings falha mesmo sendo o mesmo valor — corrigido para comparação
   numérica.
4. O próprio desempate da prova R (correcção no mesmo dia) precisava exactamente do mesmo
   `effective_date desc, created_at desc` que `tmsi.fx_rate()` usa (0005) — sem o segundo
   critério, apanhava uma entrada do mesmo dia já superada em vez da que `fx_rate()`
   realmente devolveria; a própria BD já tinha duas entradas de CNY em 2026-09-04 de sessões
   de teste anteriores, tornando o bug visível de imediato, não hipotético.

**Achado lateral, corrigido em prossecução, não escondido:** `logistics.test` deixou de
autenticar com a password do ficheiro (inalterado por hash/mtime desde a i9) — quase de
certeza rodada pelos teus próprios testes de browser da i9 ao admin-reset, que nunca
actualiza esse ficheiro. Reposta pelo mesmo procedimento Admin API já estabelecido
(`~/tmp/tmsi-sudo/logistics-test-password.txt` actualizado, nunca mostrada).

**Prova do ramo de falha do próprio smoke (restrição 4 do prompt):** uma asserção invertida
localmente (`False` fixo em vez da condição real) → `❌` real + `exit 1` confirmados; nunca
commitada, restaurada de imediato a seguir. **Idempotência:** três execuções seguidas,
mesma forma de resultado, zero resíduo — confirmado tanto pelo próprio `ROLLBACK`/apagar de
cada bloco como por uma contagem à parte na BD depois (`source='smoke-test'` = 0 linhas;
nenhum produto com `price_versions` anómalo).

**F2 — lockfile:** `generate-lockfile.yml` (`workflow_dispatch`, `contents: write` só nesse
workflow — `ci.yml` mantém `contents: read`, intocado). Disparado pelo Pedro; o commit do
lockfile (`d5465ed`) não chegou a accionar o `ci.yml` — o `GITHUB_TOKEN` por omissão de um
workflow **não** dispara outros `on: push` (protecção anti-recursão da própria GitHub, não
um defeito daqui); confirmado directamente na API de runs, não assumido. Sem consequência
prática: o commit seguinte, o que muda o Dockerfile para `npm ci`, é um push normal (chave
SSH do repo) e dispara o `ci.yml` como sempre. Dockerfile: `COPY package.json
package-lock.json ./` + `RUN npm ci`, substitui `npm install`. Duas pendências antigas
fechadas em linha, não apagadas (`STATE.md`, o registo original da E1; `ROADMAP.md`, a
lista da E5-HOMELAB) — ambas com nota "✅ resolvida" a apontar para aqui.

**F3 — ciclo completo corrido uma vez de ponta a ponta:** CI verde → imagem por digest
`sha256:16edac7045c2c56d787908f037c8fd71ad6000ad92692deef294096e6f5ba296` (`Created`
2026-09-05T17:10:27Z, primeira imagem construída com `npm ci` a sério) → saudável, RAM
disponível 236 MB, mesmo tamanho de imagem que antes (294 MB — `npm ci` não mudou nenhuma
dependência) → `python3 scripts/smoke.py` → **27/27 ✅**. Ciclo de release institucionalizado:
`docs/ROADMAP.md` e `docs/VERIFICATION-PROTOCOL.md` (nota nova, antes da secção 5) passam a
descrevê-lo como passo obrigatório.

## i10 — Export Excel + vista de impressão — ✅ FECHADA 2026-09-05

**Contexto:** decisão do Pedro (05/09, `docs/BACKLOG.md` tarefa 2, promovida a crítica) — os
utilizadores vêm do Excel, o export deixa de ser opcional.

**F0 — biblioteca, verificada no registo real, não de memória (restrição 2 do prompt):**
candidatos comparados via a API pública do npm registry e o OSV.dev (sem `npm`/`node` neste
VPS — restrição 1 de sempre): `exceljs@4.4.0` (última versão, publicada 2023, **zero**
vulnerabilidades no OSV apesar do hiato) vs. `xlsx@0.18.5` (SheetJS Community Edition, última
versão publicada 2022, **duas** vulnerabilidades reais e por corrigir no registo — prototype
pollution e ReDoS, sem versão corrigida disponível ali: a SheetJS moveu os lançamentos
corrigidos para fora do npm). `exceljs` escolhido por ser claramente a opção mais segura das
duas verificadas, não só a sugestão do prompt aceite sem mais.

**F1 — código:**
- `/prices/export`, `/products/export` (Route Handlers, `GET`): a mesma chamada a
  `tmsi.can_read_costs()` e as mesmas vistas/colunas exactas que `/prices`/`/products` já
  renderizam — nunca uma coluna a mais das que `tmsi.compute_price()`/`v_branch_prices`
  tecnicamente devolvem (`fx_used`, `duty`, `total_cost`, `overrides[]`, etc. existem na
  vista mas não estão na listagem, por isso também não estão no ficheiro — restrição 1 lida à
  letra, "exactamente"). O parâmetro `branch` filtra sobre o que a RLS já devolveu, nunca
  escolhe a vista nem alcança para lá da RLS.
- `lib/xlsx-export.ts` (`buildXlsx`, partilhado pelas duas rotas): bloco de metadados
  (título/âmbito/moeda/gerado por) escrito antes da tabela — nunca usa o *bulk setter*
  `worksheet.columns = [...]` do ExcelJS (esse escreve os seus `header` na linha 1, que
  colidiria com o bloco de metadados já lá escrito); cabeçalho e larguras definidos à parte
  (`addRow` + `getColumn(i).width`).
- Vista de impressão só em `/prices` (o único ecrã com uso real de impressão):
  `@media print` + variantes `print:` do Tailwind para esconder o cromo do ecrã e mostrar um
  cabeçalho (lista/âmbito/moeda/gerado/utilizador) e rodapé — o texto do **`/NOTICE`** do
  repositório, não o rodapé mais curto já existente no ecrã de login (achado de leitura, não
  assumido: são dois textos diferentes para duas audiências diferentes — `lib/notice.ts`
  ganhou `NOTICE_TEXT`, distinto do `PROPRIETARY_NOTICE` do login). `@page { size:
  landscape }` em `globals.css` — nenhuma classe Tailwind alcança um *at-rule* de página.
  Nenhum gerador de PDF no servidor (restrição de desenho do prompt) — Print/Save as PDF é o
  browser do próprio visitante (`window.print()`).

**Três falhas reais de CI antes de uma imagem válida, cada uma corrigida com a causa real,
não por tentativa às cegas depois da primeira:**
1. `.select(columns)` com uma string computada (`canReadCosts ? 'a' : 'b'`) em vez de uma
   string literal — desviava do único padrão já usado neste código para queries com colunas
   explícitas (sempre literal, ex. `admin/users/page.tsx`). Reescrito como dois ramos
   totalmente separados, cada um com `.from()`/`.select()` literais.
2. Essa reescrita introduziu um bug novo, da mesma classe já documentada uma vez neste
   projecto (E3-i6 F1, `audit/page.tsx`): `.overrideTypes<T,{merge:false}>()` colocado
   **antes** do `.eq()` condicional estreita o tipo do *builder* do postgrest-js para um
   tipo "de transformação" sem métodos de filtro — exactamente o mesmo problema que já tinha
   obrigado a mover filtros para antes de `.order()`/`.range()` no `audit/page.tsx`, agora
   com `.overrideTypes()` a fazer o mesmo estreitamento. Corrigido: `.overrideTypes()` move-se
   para o fim de cada cadeia, depois do `.eq()` condicional.
3. `Buffer`/`Uint8Array` do Node não satisfazem `BodyInit` sob a combinação `TypeScript
   7.0.2` (a versão real e actual — não um lapso de digitação; confirmada no registo npm,
   é a versão em produção pinada por este projecto) + `@types/node 24.13.3` + lib `dom` deste
   projecto — confirmado pelo próprio erro do compilador (`TS2345`) persistir, idêntico, depois
   de trocar `Buffer` por `Uint8Array` a direito. Resolvido com uma conversão explícita através
   de `unknown` (`buffer as unknown as BodyInit`), documentada nos dois ficheiros para não ser
   "limpa" por engano no futuro — o valor em runtime é válido (`Uint8Array` é um corpo de
   `Response` normal em qualquer motor JS que esta app usa), é o *type-checker*/lib desta
   versão que discorda.

**Nota de processo:** os logs reais de CI não foram acessíveis directamente por esta sessão
(o *download* de logs do GitHub Actions exige permissão de admin do repo, que esta sessão
VPS não tem — só as anotações públicas do *check run*, que só mostravam "exit code 1" sem o
texto do erro). O Pedro colou os dois logs reais (F1.1/F1.2 e F1.3 acima) depois de dois
ciclos de CI a tentar corrigir às cegas — a partir daí, cada correcção teve o erro real à
frente, não uma suposição.

**F2 — deploy:** CI verde → imagem por digest
`sha256:8691c1a01f57dc8f294303b6b2cb0eb99f8ed51a913902d7b0e7892f0c203e9b` (`Created`
2026-09-05T15:23:41Z) → `up -d --no-deps tmsi-app` → saudável. **Impacto no tamanho da
imagem (restrição 2 do prompt):** 293 MB → 294 MB (+1 MB) — o *standalone output* do Next.js
traça e embrulha só o código do `exceljs` realmente importado pelas rotas, não o pacote
completo (~22 MB *unpacked* no npm). **Footprint pós-deploy:** RAM available 197 MB; swap
idêntico à sessão anterior; disco 49% — sem regressão.

**F3 — provas, agente (BD/RLS) — nenhum dado de teste alterado, nenhuma escrita feita:**
1. Colunas exactas de `/prices/export` para um papel com custos (`v_branch_prices`,
   T-0005/SA): `total_cost_eur 890.00, margin 0.550000, min_price 1978.00, ref_price
   2176.00` — override de margem real e activo (não um dado de teste), calculado à mão:
   `890/(1-0.55) = 1977.78 → 1978.00`; `1978×1.1 = 2175.8 → 2176.00` (Postgres arredonda .5
   para cima, já confirmado noutras iterações).
2. Mesmo produto/filial pela vista sem custos (`v_selling_prices`, colunas exactas do
   export sem custos): `min_price`/`ref_price` idênticos (1978.00/2176.00) — as duas vistas
   concordam, como têm de concordar.
3. **Prova central (restrição 1 — "o parâmetro não é autoridade"):** um papel sem custos a
   pedir a filial `TBM` (fora do seu âmbito) a qualquer uma das duas vistas → `0` linhas nas
   duas; uma leitura directa das colunas de custo pela própria filial do papel sem custos →
   `NULL`, não erro nem valor — confirma que mesmo um pedido directo (sem passar pela app)
   não alcança para lá da RLS.
4. Sem regressões: `/`, `/login`, `/prices`, `/products`, `/prices/export`,
   `/products/export`, `/admin/users`, `/config`, `/overrides`, `/audit`, `/dashboard`,
   `/account/password`, `/auth/v1/health`, `/rest/v1/` — todos com o código esperado.

**Provas de browser confirmadas pelo Pedro (fecham os quatro pontos que tinham ficado por
cobrir aqui):** exports reais abertos como admin (custos, valores certos) e como `sales.sa`
(sem custos); impressão testada nos dois papéis. **Prova 2 do prompt, a condição de paragem
mais séria — confirmada limpa:** `unzip -p tmsi-prices-*.xlsx xl/sharedStrings.xml | grep
-iE "exw|sap_code|supplier"` no export do `sales.sa` → zero ocorrências. **Memória durante
geração real:** não observada ao vivo com `docker stats` durante a própria prova do Pedro,
mas confirmada retrospectivamente depois — `docker inspect` mostra `OOMKilled: false` desde
o deploy desta imagem, sem nenhuma linha `oom`/`memory`/`heap` nos `docker logs` da janela
em que o Pedro gerou os exports reais, e o consumo corrente (23.8 MiB/192 MiB, 12%) fica
bem dentro do `mem_limit` — suficiente para fechar esta prova sem repetir o teste.

Tentativa própria (agente) de obter uma sessão autenticada via `curl` (login por progressive
enhancement de Server Actions do Next.js, sem JavaScript) — a página `/login` revelou-se
servida pré-renderizada estática (`x-nextjs-cache: HIT` na resposta), a submissão nunca
chegando à Server Action real. Abandonada sem mais tentativas — mesma decisão já tomada na
i9 para não replicar os cookies internos do `@supabase/ssr` às cegas, risco de um falso
negativo/positivo maior do que o valor da prova.

**Incidente de processo — segunda recidiva, i6→i10, regra escrita como consequência:** a
meio da verificação do formato do ficheiro combinado de passwords de teste
(`~/tmp/tmsi-sudo/test-users-passwords.txt`, sem etiquetas por utilizador), um comando meu
imprimiu as duas passwords em claro no output desta sessão — a mesma classe de incidente já
documentada uma vez neste projecto (i6 F1). Nunca chegou a uma mensagem visível ao Pedro nem
foi reutilizado; contas fictícias `.test`, sem consequência real — não rotacionadas, à
semelhança da decisão da i6 para o mesmo tipo de incidente. **Duas recidivas do mesmo
incidente levaram o Pedro a instituir uma regra escrita**, não deixar à memória da sessão
seguinte: `~/atelier-vps/CLAUDE.md` ganhou a secção "TMSI — passwords de teste" — nunca
`cat`/`echo`/`head`/`sed -n` a um ficheiro de password de teste como passo isolado; provas de
BD/RLS por injecção de claims JWT no `psql` (sem password nenhuma); uma password real só
dentro do mesmo comando que a consome (`$(cat ficheiro)` inline, nunca um passo prévio que só
a mostra); sessões HTTP autenticadas reais (cookies) ficam sempre para o Pedro no browser,
nunca fabricadas por `curl`.

**F4 — `docs/VERIFICATION-PROTOCOL.md`:** nota ⁵ na matriz + secção 4.8 (passos AA–DD)
novas; secção 7 ganhou uma adenda com o resultado desta re-execução parcial. Commit
`e388077`.

## i9 — Gestão de passwords sem email — ✅ FECHADA 2026-09-05 (mecanismo; browser pendente)

**Contexto (decisão do Pedro, colada junto com o prompt desta sessão):** o onboarding do
piloto deixa de depender de email — admin pode forçar reset (manual ou temporária gerada,
nunca uma "default" fixa) com troca obrigatória no próximo login; qualquer utilizador
autenticado pode mudar a própria password sem link de email. Consequência directa: **EOP
despromovido de bloqueio a melhoria** (o desvio S/T da E5-VPS continua por cobrir mas já não
bloqueia nada) e **export Excel/PDF (i10) promovido a crítico** — ambas reflectidas no
`docs/BACKLOG.md` novo e no `docs/ROADMAP.md` realinhado (commit `0f95104`).

**F0 — achado que, a meio da sessão, se revelou ser meu, não do prompt (correcção
registada, não escondida):** o prompt afirmava que "o espelho 1.14 [da deploy key
`tmsiequipment` no `CREDENTIALS-INVENTORY.md`] está feito", como justificação para remover a
sinalização órfã correspondente do `VPS.md` do dossier. Um primeiro `grep` directo ao clone
local do dossier neste VPS não encontrou 1.14 (só até 1.13) e concluí — errado — que a
afirmação do prompt era falsa; ficou registado assim mais abaixo neste próprio documento
(secção i9) e em commits já empurrados (`0f95104`, `ef2e9f7`). **Só estava errado o meu
diagnóstico:** aquele clone local estava desactualizado, sem o push concorrente da
**E5-HOMELAB** (outra sessão, a correr no homelab ao mesmo tempo), que já tinha criado 1.14 e
deixado essa mesma sinalização explicitamente para "a próxima sessão do VPS" limpar — ou
seja, esta. Só apareceu ao correr o `dossier-push.sh` (fetch + rebase automáticos) na F6,
mais tarde nesta sessão. **Corrigido no próprio dossier antes do fecho:** 1.14 confirmado
presente, sinalização removida do `VPS.md`, adenda escrita nos dois sítios (`VPS.md` e
`CHANGELOG.md`) a explicar o lapso — commit do dossier `e4a5307`. **Lição registada:**
`grep` a um clone local de um repo partilhado sem `git fetch` primeiro só prova o que esse
clone tinha guardado, não o estado actual partilhado; a próxima vez que uma afirmação do
prompt colidir com um documento do dossier, `fetch` primeiro, só depois concluir que o prompt
está errado. Backlog item 6 fica fechado — não por mim ter feito o espelho, mas por já ter
sido feito e a sinalização já ter sido limpa.

**F1 — migração 0006, validada em `BEGIN`/`ROLLBACK` antes de aplicar para valer (backup
fresco `~/backups/tmsi/tmsi-2026-09-05-pre-0006.dump` antes do DDL):**
1. `tmsi.profiles.must_change_password boolean not null default false`.
2. `profiles` entra no trigger de auditoria genérico (0001 §5) — tinha ficado de fora porque
   nada escrevia nela fora do admin; agora a primeira escrita self-service exige a mesma
   cobertura das outras 11 tabelas. `auth.uid()` (o que `tmsi.audit()` regista como actor) é
   estado de sessão, não ligado ao dono da função — por isso continua correcto através da
   fronteira `security definer` das duas funções abaixo: transição `false→true` = reset pelo
   admin (actor = admin, `row_pk` = o utilizador alvo); `true→false` = troca concluída pelo
   próprio (actor = o próprio). Nenhuma coluna de "tipo de evento" nova precisou de ser
   inventada — a estrutura `old_row`/`new_row`/`actor` já chega. (`profiles` não tem coluna
   `id` — o mesmo `row_pk` "linha inteira como texto" que `tmsi.settings`, PK por `key`, já
   tinha; não é um efeito novo desta migração.)
3. `tmsi.mark_password_changed()` — `security definer`, `search_path = tmsi, pg_temp`, limpa
   a flag só da própria linha (`auth.uid()`) — deliberadamente estreita (uma política de
   auto-escrita geral em `profiles` deixaria um não-admin editar `full_name`/`email`/`active`
   também, fora de âmbito).
4. `tmsi.admin_revoke_sessions(uuid)` — GoTrue v2.189.0 não tem endpoint de revogação de
   sessão (confirmado por inspecção do código-fonte no incidente da i1, não assumido agora);
   a única via é apagar directamente `auth.sessions` (cascata confirmada ao vivo para
   `auth.refresh_tokens`/`auth.mfa_amr_claims` via `session_id`). Reverifica
   `has_role('admin')` **dentro** da função — a `alter default privileges` da 0001 concede
   `execute` a `authenticated` por omissão em qualquer função nova do schema, por isso sem
   este `if` qualquer utilizador autenticado poderia revogar as sessões de qualquer outro.
5. Prova funcional completa em `BEGIN`/`ROLLBACK` antes de aplicar para valer: admin marca a
   flag (audit → admin); não-admin chama `admin_revoke_sessions` → `Forbidden`; admin chama →
   sucesso; o próprio limpa a flag via `mark_password_changed()` (audit → o próprio);
   não-admin chama `admin_revoke_sessions` **contra o seu próprio id** → `Forbidden` também.
   `ROLLBACK` final confirmado, zero alteração permanente antes da aplicação real.

**F2 — código:**
- `/admin/users`: `ResetPasswordForm` (manual ou gerada — `crypto.randomInt`, ≥16 caracteres,
  charset amplo, nunca um valor fixo), via `PUT /admin/users/{id}` (Admin API, mesmo padrão de
  `banUser`/`unbanUser`), depois `must_change_password=true` (RLS `profiles_admin` já
  permite, sessão do próprio admin) e `admin_revoke_sessions()`. A password gerada só existe
  em estado React local (`useActionState`), nunca em log/BD/relatório — um refresh perde-a
  por construção.
- `/account/password`: `changePassword` — verifica a password actual com um cliente
  descartável (`persistSession`/`autoRefreshToken` desligados, nunca toca nos cookies da
  sessão real) a tentar `signInWithPassword`; só depois `updateUser` + `mark_password_changed`
  RPC. Efeito colateral secundário, aceitável: fica uma sessão GoTrue extra, nunca usada, por
  cada tentativa (não há endpoint "verificar sem emitir sessão"; expira sozinha).
- `middleware.ts`/`supabase-middleware.ts`: `mustChangePassword` lido a cada pedido (RLS
  `profiles_self`, uma leitura indexada); bloqueia tudo excepto `/account/password`,
  `/reset-password` (a troca por email antiga também limpa a flag agora — `reset-password/
  actions.ts` ganhou a mesma chamada a `mark_password_changed`, para não deixar um utilizador
  marcado sem saída se preferir o link em vez do ecrã novo) e `/logout`.
- `/logout` passou de Server Action ligada a `/` a Route Handler próprio — só assim a
  middleware o consegue nomear explicitamente; um POST de Server Action é indistinguível de
  qualquer outro POST à página actual ao nível da middleware.

⚠️ **Bug real, apanhado ao testar antes de reportar como feito, não hipotético:** o
`/logout/route.ts` inicial usava `NextResponse.redirect(new URL('/login', request.url))` —
`request.url` num Route Handler reflecte o bind interno (`https://0.0.0.0:3000/...`) atrás
deste proxy, não o domínio público. **Exactamente a mesma classe de bug já apanhada e
corrigida uma vez em `auth/confirm` (E3-i1)** — a correcção estabelecida lá (derivar de
`request.headers.get('host')`, como `forgot-password/actions.ts` já fazia) foi replicada
aqui. Confirmado com `curl -D-` antes e depois: `location: https://0.0.0.0:3000/login` →
`location: https://tmsiequipment.duckdns.org/login`. A `middleware.ts` continua a usar
`new URL(path, request.url)` sem este problema — Edge Runtime resolve isto de forma diferente
de um Route Handler comum, já registado desde a i1 e reconfirmado agora, não copiado às
cegas.

**F3 — deploy:** CI verde (dois commits, o da funcionalidade e o do fix do `/logout`) →
imagem por digest `sha256:3dcff92b9b5577e29a7ef8c5dae248b61078a69837994b7cf77494abade8f946`
(`Created` 2026-09-05T14:10:13Z) → `up -d --no-deps tmsi-app` → saudável. **Footprint
pós-deploy:** RAM available 173 MB; swap ~1115/4095 MB (≈27%); disco 48% — sem regressão.

**F4 — provas comportamentais, agente (API/BD) — utilizador de teste `logistics.test`, único
tocado, estado 100% restaurado ao fim (password original de volta, flag `false`, sem flags
noutras contas):**
1. Admin define password nova via o mesmo endpoint Admin API que o código usa → antiga falha
   (`400`), nova entra (`200`); `must_change_password` fica `true`, `audit_log` mostra o
   admin real como actor.
2. Verificação de password actual replicada directamente contra o GoTrue: errada → `400
   invalid_credentials`, sem sessão nova; correcta → `200`, sessão emitida — o mecanismo
   exacto que `changePassword` usa.
3. **Achado arquitectural, registado com honestidade, não forçado a caber num "recusado"
   que não seria verdade:** `PUT /auth/v1/user` do próprio GoTrue, com um access token
   válido, muda a password **sem pedir a actual** — confirmado ao vivo. A fronteira real é
   `/account/password` ser o único caminho de código desta app que chama esse endpoint para
   o próprio utilizador — não uma regra do GoTrue. Documentado como risco aceite (a mesma
   superfície que qualquer chamada directa à API sempre teve), não como defeito desta
   entrega.
4. Troca concluída → `mark_password_changed()` como o próprio → flag volta a `false`,
   `audit_log` mostra o próprio como actor.
5. Duas sessões reais vivas (uma de hoje, uma residual de 04/09) → `admin_revoke_sessions()`
   mata as duas → o `refresh_token` capturado antes fica `refresh_token_not_found`.
   **Limitação conhecida, não contornada:** um `access_token` já emitido continua válido até
   ao seu `exp` (1h) — não testado por não haver forma de o testar sem esperar o prazo, só
   registado como o prompt já antecipava.
6. Não-admin a chamar `admin_revoke_sessions()`, incluindo contra o seu próprio id →
   `Forbidden` as duas vezes (prova de F1, revalidada).
7. Zero ocorrências de qualquer password real nos quatro `docker logs` (app/auth/rest/db) na
   janela do teste; no `audit_log`, as duas ocorrências da string "password" encontradas são
   o nome da coluna `must_change_password` (conteúdo integral inspeccionado, não só a
   contagem) — nunca um valor.
8. Sem regressões: `/`, `/prices`, `/products`, `/admin/users`, `/config`, `/overrides`,
   `/audit`, `/dashboard`, `/forgot-password`, `/reset-password`, `/account/password`,
   `/api/health`, `/auth/v1/health`, `/rest/v1/` — todos com o código esperado, sem sessão.

**Por cobrir, explicitamente, não escondido — ficam para o Pedro (browser, passos manuais do
prompt):** W/X ao nível do ecrã real em `/admin/users` (escolha manual/gerada, a password
gerada só aparecer uma vez, um refresh não a repetir); Y ao nível do ecrã
`/account/password` propriamente dito; o `isAdmin()` da Server Action `resetPassword` não foi
re-testado com uma sessão de browser não-admin fabricada (replicar os cookies internos do
`@supabase/ssr` via `curl` seria frágil — o padrão é byte-a-byte o mesmo de
`banUser`/`unbanUser`/`inviteUser`, já provados recusados para não-admin nas execuções
anteriores; a fronteira que importa de facto, `admin_revoke_sessions()`/`profiles_admin`,
está confirmada de forma independente desse gate da app, acima).

**Confirmação explícita (restrição 2 do prompt):** nenhuma password — real, de teste, ou
gerada — apareceu neste relatório, no `STATE.md`, no `audit_log`, ou em qualquer `docker
logs` inspeccionado. A única password usada nas provas (a de `logistics.test`) foi lida de
`~/tmp/tmsi-sudo/logistics-test-password.txt` (chmod 600) para dentro de variáveis de shell,
nunca impressa; a temporária gerada durante o teste foi apagada do scratchpad ao fechar a
sessão de provas.

**F5 — `docs/VERIFICATION-PROTOCOL.md`:** secção 3 (matriz + nota ⁴) e secção 4.7 (passos
W–Z) novas; secção 7 ganhou uma adenda com o resultado desta re-execução parcial (só
API/BD, âmbito e desvios explícitos). Commit `83bdbe5`.

## E5-VPS — Operações (EOP, deploy key, métricas) — ✅ FECHADA 2026-09-05

**F1 — desvio S/T (email via gateway corporativo): tentado, não fechado.** Bloqueado antes do
próprio passo da quarentena — o Pedro não tem acesso ao portal `security.microsoft.com` para o
tenant `@condat.fr`. Não é o caso "mensagem voltou à quarentena" que o protocolo antecipa; não
insistido mais. Caminho seguinte (pedido de acesso ou de libertação à TI do tenant) é decisão
do Pedro. Registado: `docs/VERIFICATION-PROTOCOL.md` secção 7 (adenda) e
`docs/audits/2026-09-05-verification-run-1/README.md`.

**F2 — PAT → deploy key, fechado.** Inventário primeiro (restrição 1): dos três repos neste
host, só o `origin` HTTPS deste (`tmsiequipment`) usava o PAT guardado em
`~/.git-credentials`/`credential.helper=store` — `dossier` e `itinera-src` já usavam SSH com
chave própria; o login GHCR (`~/.docker/config.json`) é independente; nenhum script referencia
o PAT directamente (`grep` limpo). Remote mudado para SSH dedicado: alias
`github-tmsiequipment` em `~/.ssh/config` (mesmo padrão do `github-dossier`), chave `ed25519`
sem passphrase (`~/.ssh/tmsiequipment_deploy`, chmod 600 — automação sem interacção; risco
aceite: a chave só escreve neste repo, um risco menor que o PAT genérico anterior). Deploy key
adicionada pelo Pedro no GitHub com **Allow write access**. Provado ao vivo, não só `rc=0`:
`git pull` + um push real (o commit `88b4a65`, por SSH). Só depois de confirmado que nada mais
usava o PAT: `~/.git-credentials` removido, `credential.helper` desconfigurado globalmente.

**F3 — métricas TMSI no `status.json`, fechado.** Backup timestamped do `vps-stats.sh` antes
de editar. Duas chaves novas, convenção plana existente: `tmsi_containers_up`/
`tmsi_containers_total` (contagem de `tmsi-app`/`supabase-auth`/`supabase-rest`/`supabase-db`
via `docker inspect`, mesma filosofia defensiva do bloco `containers` já existente — nunca
aborta o gerador) e `tmsi_backup_age_h` (idade em horas do dump mais recente em
`~/backups/tmsi/`, `null` se a pasta estiver vazia). Corrido directamente como `pedro`
(`/var/www/status` é `pedro:pedro`, sem precisar de `sudo`/`systemctl`) — prova real: `curl` a
`http://10.13.13.254:8080/status.json` (túnel, não o ficheiro local) devolveu
`tmsi_containers_up: 4, tmsi_containers_total: 4, tmsi_backup_age_h: 8.2` — plausível (dump
das 03:30, medido às ~10:42). Chaves antigas (`updated`, `containers`, `ram_*`, `swap_*`,
`disk_used_pct`, `cpu_pct`, `load1`, `uptime_s`) intactas.

⚠️ **Métrica opcional dispensada, registada, não esquecida:** a idade da taxa de câmbio mais
recente ficou fora — exigiria o `vps-stats.service` (`ProtectSystem=strict`, hoje sem
dependência nenhuma de Postgres) ligar-se à BD via `docker exec ... psql`, uma dependência
nova e mais frágil, não "barata" no sentido em que o prompt permitia dispensar. Fica para
quando fizer falta a sério, não implementada por implementar.

**Footprint pós-sessão:** RAM available 170 MB; swap 1112/4095 MB (≈27%); disco 48%. Sem
deploys de app nesta sessão (fora de âmbito, confirmado).

## Execução formal n.º 1 — VERIFICATION-PROTOCOL.md — ✅ CONCLUÍDA 2026-09-05, resultado OK

**Versão testada:** migrações 0001–0005; digest
`ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:3775da62ecfc16047b7eec92b7ea98cb277778825d8295b4771becf3b1b47da1`.
**Executores:** Pedro (browser) + agente (API). **Âmbito:** os 8 papéis da matriz — `admin`,
`product_manager`, `finance`, `branch_manager`, `logistics`, `sales`, `agent`, `viewer`.
**Resultado: OK — gate de produção satisfeito para o estado actual.** Registo completo,
teste a teste: `docs/VERIFICATION-PROTOCOL.md` secção 6 (tabela) e secção 7 (entrada do
registo). Evidência: `docs/audits/2026-09-05-verification-run-1/`.

**F0 — dois defeitos reais no próprio protocolo, corrigidos antes/durante a execução
(restrição 1 do prompt: o protocolo não se interpreta em silêncio):**
1. `/dashboard` (E3-i8) não constava do documento — escrito depois da i7. Adicionada a linha
   "Dashboard (acesso à página)" à matriz + passos U/V (secção 4.6). Commit `e9b1ab8`.
2. **Achado durante o próprio teste K, não staleness — a nota anterior estava errada.**
   O documento dizia que `logistics` cria um override de `duty` "às cegas", sem o conseguir
   ler depois. Falso: `tmsi.price_overrides` tem duas políticas RLS permissivas para o mesmo
   comando — `overrides_read` (`for select`) e `overrides_write` (**`for all`**, que em
   Postgres abrange `select`, não só escrita). Políticas permissivas combinam-se por **OR**:
   a própria cláusula `USING` de `overrides_write` já chega para tornar uma linha `kind='duty'`
   visível a um `SELECT`, com ou sem `can_read_costs()`. Verificado ao vivo
   (`BEGIN`/`ROLLBACK`): uma linha `duty` inserida por outra sessão ficou visível a
   `logistics`; uma linha `margin` real (id 1) continuou invisível. **`logistics` vê
   exactamente as linhas `duty`, de qualquer filial, e mais nenhuma** — não é falha de
   segurança (só vê o que já está autorizado a escrever), mas o documento descrevia o
   oposto. Corrigida a matriz (❌→◐), a nota, e o passo K. Commit `c01325a`.

**F1 — utilizador de teste criado (não existia):** `branch_manager.test@example.test`, filial
CORP, password em `~/tmp/tmsi-sudo/branch_manager-test-password.txt` (chmod 600, padrão da i2).

**F1 — provas de API, todas OK, sem dados permanentes (`BEGIN`/`SAVEPOINT`/`ROLLBACK` em
todos os testes):** os 8 papéis testados contra a matriz real. Destaques com cálculo à mão:
teste C (correcção de câmbio USD→2.000000) — `fx_used 0.5, exw_local 725.00, interco 870.00,
duty 14.79, total_cost 959.79, min_price 1655.00, ref_price 1821.00`, todos exactos; teste D
(override `coef` 1.5 em T-0002/SA) — base `189.00/208.00` → override `283.00/311.00` (exacto)
→ expirado, reverte a `189.00/208.00` (exacto). Teste Q confirmou um achado já conhecido (i6
F0 #1, não novo): `price_overrides.created_by` não é imposto pela própria BD (aceita um UUID
arbitrário do cliente) — mas `audit_log.actor` usa sempre `auth.uid()` real, independente do
que vai em `created_by`, por isso o registo de autoria que interessa (a auditoria) continua
inviolável mesmo quando o campo de conveniência não é. Um achado metodológico próprio: uma
tentativa de ler `exw_price` directamente de `tmsi.products` (em vez de `tmsi.v_products`)
falhou por privilégio de coluna **mesmo como admin** — confirma que a 0003 protege por coluna
de forma incondicional (só a vista dá acesso), não só para papéis sem custo; foi um erro do
meu próprio guião de teste, não um defeito da app.

**F2 — provas de browser (Pedro), sessões 1/2/4 completas, sessão 3 dispensada por tempo:**
sessão 1 (admin: `/prices`, breakdown em `/products/[id]`, filtro em `/audit`, `/dashboard`)
OK — a instrução original do passo B (browser) estava ambígua e descrevia campos que o ecrã
não mostra individualmente (câmbio/fee/direito), corrigida em tempo real para os nomes reais
das colunas ("Total cost (EUR)"/"Margin" na tabela "Price by branch") antes de o Pedro
confirmar — lição repetida da i5 (instruções de prova têm de nomear o ecrã real, não o
conceito). Sessão 2 (`sales.sa`: listagem, quatro rotas redireccionadas, `/overrides` parcial)
OK — "nenhum deixou entrar". Sessão 3 (K–N, confirmação visual de `logistics`/`branch_manager`/
`agent`/`viewer`) **não realizada** — dispensada pelo Pedro por tempo; coberta na íntegra pela
prova de API (F1), que não depende do browser. Sessão 4 (S/T, convite + reset de password) OK,
com **dois** provedores de email reais (Gmail de teste **e Hotmail**) — mais cobertura do que
pedido. **Nenhum dos dois cobre o gateway corporativo M365/EOP** que causou o bug real da i3
(Hotmail/Outlook.com pessoal não tem Safe Links do Defender for Office 365, feature só de
tenants empresariais) — regista-se como desvio documentado, não como cobertura completa;
a variante EOP fica pendente, primeiro item da E5.

**Evidência do Pedro é verbal (chat desta sessão), não screenshot** — a restrição 3 do prompt
pedia screenshots; não foram anexados. Registado como está, sem fabricar evidência que não
existe. Se um nível de prova mais forte for exigido (ex. para apresentação à direcção),
repetir os passos de browser com captura de ecrã real antes dessa apresentação.

**Sem alteração nenhuma de estado além dos dados de exercício, todos revertidos** — nenhum
`COMMIT`, só `BEGIN`/`ROLLBACK` (excepto a criação do `branch_manager.test`, um fixture de
teste permanente, não dado de exercício). Confirmado `git status` limpo nos dois repos antes
do fecho.

## E3, iteração 8 — Dashboard (KPIs e margens por filial) — ✅ FECHADA 2026-09-05 (reaberta e corrigida no dia seguinte) — **E3 completa**

**Digest actual (pós-correcção):** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:3775da62ecfc16047b7eec92b7ea98cb277778825d8295b4771becf3b1b47da1`
(`Created` 2026-09-05T09:34:59Z, commit `f972129`, CI concluído 09:35:09Z — ordem consistente).
**Footprint pós-deploy:** RAM available 160 MB; swap 1108/4095 MB (≈27%); disco 48%.

**Digest original da i8 (2026-09-04, substituído — ver correcção abaixo):**
`sha256:3cc4e108bc85eb6589e5547cb7e67042094ec4335483dce526426dd91e2bb68e` (commit `3e71bb1`).

**Reaberta em 2026-09-05 — diagnóstico do Pedro:** o cartão de gráfico do dashboard era o
**único** elemento theme-aware de toda a app (correcto em si, ver F3 original abaixo) — o resto
da app nunca teve dark mode nenhum. Numa máquina com preferência de tema escuro do SO, só esse
cartão mudava de aparência, o resto ficava claro — lido como inconsistência/defeito, não como
tema. **Decisão do Pedro:** app light-only por agora. Correcção: removidos os blocos
`@media (prefers-color-scheme: dark)` e `:root[data-theme='dark']` de `.dashboard-charts`
(`globals.css`) — não desactivados, removidos —, deixando só a paleta light fixa, com um
comentário no CSS a registar os hexes dark que estiveram em produção e foram validados (F3
original, prova 3), para servirem de ponto de partida quando a app tiver um tema real, em vez de
os re-derivar do zero. Redeploy confirmado: o CSS servido em produção já não contém nenhuma
ocorrência de `prefers-color-scheme` nem `data-theme` (verificado directamente no bundle).
Nenhuma outra secção do dashboard foi tocada.

**«Dark mode global» registado como melhoria futura de baixa prioridade** (`docs/ROADMAP.md`) —
a paleta dark dos gráficos já está validada (ficou em produção e foi confirmada correcta antes
desta reversão), por isso um trabalho futuro de dark mode a sério não parte do zero.

---
**Texto original do fecho da i8 (2026-09-04), mantido para o histórico das provas:**

`/dashboard`, gate `can_read_costs()` apenas (admin já é o primeiro membro dessa própria função
— um `isAdmin()` à parte só alargaria o gate, nunca o estreitaria). Cinco secções, todas lidas
pelas mesmas vistas/funções que os ecrãs já existentes usam (restrição 2 do prompt): tiles de
estado (`tmsi.v_products`, `review` destacado), margem média por filial em barras
(`tmsi.v_branch_prices`, só produtos `active` — o rascunho de um produto ainda não é uma decisão
de preço real), frescura dos câmbios por moeda (mesmo desempate `effective_date desc, created_at
desc` do `tmsi.fx_rate()`, 0005 — nunca uma regra nova), overrides activos
(`tmsi.price_overrides`, mesma janela de validade do `tmsi.override_value()`), e actividade
recente (`tmsi.audit_log`, últimas 10).

**Regras de dataviz do prompt (§2), seguidas à letra:** paleta categórica CVD-safe nos hexes
exactos, como custom properties CSS, com `prefers-color-scheme` E `[data-theme]` ligados (a app
não tem toggle de tema nenhum ainda — defensivo para um futuro toggle, confirmado a compilar
correctamente no CSS final servido em produção, ver prova 3 abaixo); rótulos directos nas barras
em cor de texto (nunca a cor da série — as cores 3/4 falham 3:1 no `surface` claro) + vista de
tabela acessível por gráfico; paleta de estado própria (vermelho, nunca reutilizada das quatro
cores categóricas) para o tile `review` e o aviso de câmbio velho, sempre ícone + texto.

**Achado de F1, apanhado na revisão antes do commit (nunca chegou a correr em CI):**
`new Map(array.map(x => [x.a, x.b]))` — o padrão de construir um `Map` a partir de tuplos
inferidos inline dentro de `.map()` é um ponto conhecido de inferência frágil em TypeScript (o
literal `[x.a, x.b]` nem sempre é inferido como tuplo `[K, V]` através de uma chamada genérica
aninhada). Reescrito para o mesmo padrão imperativo (`for` + `.set()`) já usado no resto do
ficheiro para os outros três agregados, em vez de arriscar um round-trip ao CI para confirmar.

**Provas (F3):**
1. **Cada tile/gráfico comparado ao SQL corrido à mão no `psql`** (claims JWT reais, admin):
   tiles de estado (`draft 2, active 8, review 2, discontinued 1` — `pending`/`inactive`
   correctamente a 0, não ausentes); margem média por filial (`CORP 44.3%, LTD 44.3%, SA 54.0%,
   TBM 65.0%`, só produtos activos); frescura (`CNY/GBP/USD`, todas com a taxa mais recente de
   hoje, `0` dias); overrides activos = `4` (inclui o override real criado pelo Pedro na i6,
   ainda válido); actividade recente = as 10 entradas mais recentes do `audit_log` — todos os
   valores coincidem exactamente com a query equivalente da app.
2. **Ramo do aviso de frescura:** como todas as três moedas têm taxa de hoje (idade 0), o limiar
   real (30 dias) nunca dispara com os dados actuais — provado correctamente sem inventar dados
   falsos: baixei temporariamente `STALE_RATE_DAYS` para `-1` no ficheiro local (nunca commitado
   — `git diff` confirmado limpo depois de reverter), tracei a lógica com os dados reais
   (`0 > -1` = verdadeiro) e confirmei que o ramo de aviso (borda + `WarnBadge` com ícone+texto)
   é o mesmo padrão condicional `{cond && <X/>}` já provado em produção nesta app (i6, i4) — sem
   servidor local para correr (este VPS não tem `node` nem faz builds, restrição 1), a
   verificação é um trace de código deliberado, não uma execução, registado como tal.
3. **Dark mode:** sem browser para alternar o tema ao vivo, confirmado ao nível que consigo —
   o CSS realmente servido em produção (`/_next/static/chunks/*.css`) contém os três blocos
   exactos (`.dashboard-charts` base, `@media (prefers-color-scheme: dark)`, e
   `:root[data-theme='dark']`), com os hexes exactos do prompt em cada um. A confirmação visual
   fica para o passo manual do Pedro. **⚠️ Revertido em 2026-09-05 — ver a correcção no topo
   desta secção: esta prova mostra que a implementação original estava correcta, não que o
   dark mode continua activo hoje.**
4. **Ramo negado:** `sales.sa` e `logistics.test` — `can_read_costs()` = `false` para ambos
   (logo `/dashboard` redirecciona, mesmo gate que a app usa); e, defesa em profundidade,
   `tmsi.v_branch_prices` (margem), `tmsi.price_overrides` e `tmsi.audit_log` devolvem `0` linhas
   para ambos — nenhum agregado de custo alcançável mesmo contornando o redirect da página.
5. **Sem regressões:** todas as rotas anteriores continuam a devolver o código esperado
   (redirect 307 sem sessão nas protegidas, 200 em `/login` e `/api/health`) depois do deploy.

## E3, iteração 7 — Protocolo de verificação de segurança — ✅ FECHADA 2026-09-04

Iteração documental, sem deploy nem migração — nenhum container tocado, `git status` confirmado
limpo antes e depois (além dos próprios commits desta iteração). Entregue:
`docs/VERIFICATION-PROTOCOL.md` (protocolo re-executável de teste de aceitação, auditoria
periódica, formação de utilizadores novos e demonstração à direcção).

**F0, achado antes de escrever código nenhum:** a árvore não estava limpa — a alteração de
`deploy/supabase/docker-compose.yml` (pin do digest da i6) tinha ficado por commitar no fecho
anterior. Commitado à parte (`cdf5f7e`) antes de arrancar esta iteração.

**F1 — as 16 correcções feitas à matriz do prompt, célula a célula, contra o schema real
(nenhuma célula ficou por confirmar):**

| # | Linha | Papel | Valor do prompt | Valor real | Fonte |
|---|---|---|---|---|---|
| 1 | Custos | `branch_manager` | ✅ | ◐ (filial pedida) | `compute_price()`.`see_costs` verifica `b.id = any(my_branches())` para `branch_manager` — só a filial pedida, não o produto inteiro (nota ¹ do documento: EXW/SAP em `v_products` não têm esta restrição, só o `compute_price()`) |
| 2 | Custos | `viewer` | ❌ | ✅ | `can_read_costs()` e `see_costs` incluem `viewer` sem condição |
| 3 | Códigos SAP / fornecedor | `viewer` | ❌ | ✅ | `can_read_costs()` inclui `viewer` (0003, `tmsi.v_products`) |
| 4 | HS/peso/dimensões | `viewer` | ❌ | ✅ | `can_read_operational()` = `can_read_costs() OR logistics`; `can_read_costs()` inclui `viewer` |
| 5 | Breakdown do motor | `branch_manager` | ✅ | ◐ (filial pedida) | mesma fonte que #1, sem a nuance do EXW (esta linha é 100% `compute_price()`) |
| 6 | Breakdown do motor | `viewer` | ❌ | ✅ | mesma fonte que #2 |
| 7 | Configuração | `logistics` (anotação) | "◐ transporte" | "◐ transporte/direitos" | `config_write` em `tmsi.customs_rates` também inclui `logistics`, não só `tmsi.transport_tiers` |
| 8 | Criar overrides | `product_manager` | ✅ | ❌ | `overrides_write` (0001 §8) não tem cláusula nenhuma para `product_manager` |
| 9 | Criar overrides | `branch_manager` | ❌ | ◐ (transport/margin/coef, filial própria) | `overrides_write`: `has_role('branch_manager') and branch_id = any(my_branches()) and kind in ('transport','margin','coef')` |
| 10 | Criar overrides | `logistics` | ❌ | ◐ (só `duty`, qualquer filial) | `overrides_write`: `has_role('logistics') and kind = 'duty'` — sem restrição de filial |
| 11 | Ver valores de overrides | `branch_manager` | ✅ | ◐ (filial própria) | `overrides_read`: `can_read_costs() and (admin/finance/pm/viewer or branch_id = any(my_branches()))` — só o `branch_manager` cai no último ramo |
| 12 | Ver valores de overrides | `viewer` | ❌ | ✅ | `viewer` nomeado directamente em `overrides_read` |
| 13 | Auditoria global | `branch_manager` | ❌ | ✅ (sem âmbito, não ◐) | `audit_read` (0001 §8) não tem cláusula de filial nenhuma — acesso total, ao contrário do resto da matriz onde `branch_manager` costuma ser ◐ |
| 14 | Auditoria global | `viewer` | ❌ | ✅ | `viewer` nomeado directamente em `audit_read` |
| 15 | Artigos não-activos | `logistics` | ❌ | ✅ | `tmsi.products_visible()`: `logistics` está no grupo de visibilidade incondicional (sem filtro de `status` nem de filial) |
| 16 | Artigos não-activos | `viewer` | ❌ | ✅ | mesma fonte que #15 |

**Duas classes de erro dominaram, não aleatórias:** (a) 7 das 16 correcções foram `viewer`
marcado ❌ onde a BD lhe dá acesso total — o desenho real trata `viewer` como um papel de
**supervisão total sem âmbito**, não "leitura limitada"; isto já tinha aparecido nas notas da
i2 desta sessão (`can_read_costs()` inclui `viewer`) mas nunca tinha sido reflectido num
documento de auditoria formal até agora. (b) a capacidade de criar overrides tinha as três
correcções mais graves da lista (#8–10) — um papel marcado com acesso que não tem
(`product_manager`) e dois marcados sem acesso que efectivamente têm, cada um restrito de forma
diferente (`branch_manager` por `kind`+filial, `logistics` só por `kind`).

**Duas notas de schema não redutíveis a uma célula da matriz, registadas como texto no
documento (secção 3):** a assimetria em que `logistics` pode criar um override de `duty` mas
não o consegue ler depois (comportamento real da 0001, não um defeito desta iteração); e que
`Artigos não-activos` não filtra por `status` nenhum para cinco dos oito papéis — só
`branch_manager`/`sales`/`agent` têm essa restrição adicional.

**F1, secção 4 (passos de teste) — restrição 3:** um único ajuste de rota necessário — o passo
F referia `/admin` como rota gated; a rota real é `/admin/users` (`/admin` sozinho não tem
`page.tsx`, não é uma rota). O resto da secção 4 já usava descrição conceptual (não nomes de
rota literais) e não precisou de ajuste.

**Nenhuma célula ficou sem confirmação** — todas as 12 linhas × 8 papéis foram lidas
directamente do SQL aplicado (`supabase/migrations/0001_initial_schema.sql`,
`0003_products_column_privileges.sql`, `0004_products_safe_routing_columns.sql`), não
assumidas por semelhança com outras linhas.

## E3, iteração 6 — Overrides + auditoria — F0: matriz (0001, real, não assumida)

| Tabela | Input do motor substituído | Colunas obrigatórias (schema) | Leitura (RLS) | Escrita (RLS) | Validade avaliada por `compute_price`? |
|---|---|---|---|---|---|
| `price_overrides` | `fx`/`fee`/`transport`/`duty`/`margin`/`coef` (um dos seis, por `kind`) | `product_id, branch_id, kind, value, reason` `not null`; `valid_from` `not null default hoje` | `can_read_costs()` AND (admin/finance/product_manager/viewer OU `branch_id` no âmbito do `branch_manager`) | admin/finance (qualquer `kind`); `branch_manager` (só `transport`/`margin`/`coef`, filial própria); `logistics` (só `duty`) | **Sim** — `tmsi.override_value()`: `valid_from <= p_date AND (valid_to IS NULL OR valid_to >= p_date)`, a mais recente (`created_at desc`) entre as válidas nessa data vence — mesmo padrão "corrigir = criar novo" já usado pela 0005, já embutido na 0001 desde o início (sem `unique` a bloquear) |
| `product_hs_overrides` | `hs_code` usado no cálculo de direitos (substitui `products.hs_code`) — **só `scope_type='branch'`**, confirmado no código real do `compute_price()` | `product_id, scope_type ('branch'\|'channel'\|'agent'), scope_id, hs_code, reason` `not null` | qualquer `authenticated` (`ref_read`, `using(true)`) — não é dado de custo | **admin apenas** (`ref_write`) | **Não tem `valid_from`/`valid_to` nenhum** — permanente até ser alterado/apagado |
| `audit_log` | — (não é input do motor, é o registo) | `at, actor, table_name, row_pk, action` `not null`; `old_row`/`new_row` `jsonb` | admin/finance/viewer/`branch_manager` (**não** `product_manager` nem `logistics`, apesar de poderem escrever produtos/overrides) | — (só o trigger `tmsi.audit()`, `security definer`, escreve) | — |

**Três achados reais, sinalizados antes de desenhar (restrição 2), não corrigidos por
iniciativa própria:**
1. **`price_overrides.created_by` é `uuid` nullable** — a regra do handover ("levam sempre
   motivo, autor, data e validade") não está imposta na BD para o autor, ao contrário de
   `reason` (`not null`). A app define sempre `created_by` a partir da sessão (nunca um campo
   editável — restrição 3), mas um pedido directo à API, a contornar a app, podia criar um
   override sem autor. Candidato a migração futura (`not null default auth.uid()` ou
   equivalente) — não aplicado nesta iteração.
2. **`product_hs_overrides` não tem `created_at`/`created_by` nem validade nenhuma** — autor e
   data só existem no `audit_log` (a tabela está no `array` do trigger, 0001 §5). Na prática
   suficiente: só o admin escreve esta tabela (`ref_write`) e o admin tem acesso total ao
   `audit_log`. Ainda assim, assimétrico com `price_overrides` e mais fraco que a letra da
   regra do handover. Sinalizado, não corrigido.
3. ⚠️ **O mais sério — risco de defeito silencioso real, não hipotético:** o `check` constraint
   de `product_hs_overrides.scope_type` aceita `'branch'`, `'channel'` e `'agent'` — mas o
   código real do `compute_price()` (0001 §7, cálculo de direitos) **só lê overrides com
   `scope_type='branch'`** (`where h.scope_type = 'branch' and h.scope_id = b.id`). Um
   override de canal ou de agente seria aceite pela BD e pareceria válido em qualquer UI, mas
   nunca teria efeito nenhum no preço — exactamente o tipo de "defeito silencioso" que a regra
   de qualidade do próprio handover (`handover.md` §6) proíbe.
   - **Decisão do Pedro:** a UI de criação só oferece `scope_type='branch'` por agora (o único
     que o motor lê), com nota visível de que canal/agente estão por implementar. Qualquer
     linha `channel`/`agent` que já exista (API directa, ou dados anteriores) **nunca fica
     invisível**: a listagem mostra-a com um aviso explícito "no effect — scope not yet
     supported by the pricing engine" — um override sem efeito pode existir, mas nunca em
     silêncio.
   - **Pendência funcional registada** (não só "por implementar", as duas perguntas de desenho
     que a implementação exigiria, do Pedro): (a) ordem de precedência entre âmbitos
     coexistentes (se um produto tiver override de filial E de canal ao mesmo tempo, qual
     vence?); (b) como é que o contexto de canal/agente chega ao `compute_price()` — a
     assinatura actual só tem `p_product, p_branch, p_date`, sem identificador de
     canal/agente nenhum. Fica ao lado da questão L2 (quem aprova, E4) na lista de decisões
     em aberto — mesma família (decisões de desenho do motor, não de infra).

## E3, iteração 6 — Overrides + auditoria — ✅ FECHADA 2026-09-04

**Digest:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:9c1a59be27fbe07d1f3364b79c05edc64dac52cc52055810797a5448d46f89c8`
(`Created` 2026-09-04T21:24:12Z, commit `e3eb7bf`, CI concluído 21:24:22Z — ordem consistente,
sem confusão UTC/local). **Footprint pós-deploy:** RAM available 159 MB; swap 1060/4095 MB
(≈26%); disco 48%.

**Sem migração nesta iteração.** Os três achados da matriz F0 (acima) foram resolvidos ao nível
da UI/Server Action, não da BD (decisão do Pedro, registada acima). O número **0006** continua
reservado para a migração funcional da E4.

**Bug real, apanhado na revisão de código antes do push (nunca chegou a correr em CI):**
`app/src/app/audit/page.tsx` encadeava `.eq()`/`.gte()`/`.lte()` condicionais **depois** de
`.order()`/`.range()` — o `postgrest-js` devolve, a partir de `.order()`, um tipo mais estreito
(`PostgrestTransformBuilder`) sem métodos de filtro, ao contrário do padrão já usado em todas
as outras páginas da app (filtros sempre antes de `order`/`range`, ex. `config/page.tsx`).
Corrigido antes do commit — filtros movidos para antes do `.order()`/`.range()` final.

**Ecrãs:**
- `/overrides` — duas secções (price overrides, HS overrides), cada uma com listagem
  (activo/expirado/futuro — mesma classificação de datas do `override_value()`) e formulário de
  criação, `gated` por `canManageAnyPriceOverride()`/`isAdmin()` (convenience — RLS é a
  fronteira real). HS overrides: campo de âmbito fixo/desactivado na UI, `scope_type`
  hardcoded no servidor — nunca lido do formulário, mesmo por um pedido a contornar o campo
  desactivado.
- `/products/[id]` — nova coluna "Overridden" na tabela de preço por filial, a combinar
  `compute_price()`.`overrides[]` com o override de HS próprio da filial. **Achado confirmado
  na Prova 3 abaixo:** um override de HS **não aparece** em `overrides[]` — só afecta o
  cálculo de direitos por baixo, sem deixar rasto nesse array — por isso a UI tem de juntar as
  duas fontes explicitamente, não bastava ler `overrides[]`. Secção "Overrides" nova com as
  entradas do próprio produto.
- `/audit` — leitura global, filtrável (tabela/actor/período), paginada, só-leitura, `gated`
  como a política `audit_read` (admin/finance/viewer/branch_manager).

**Provas (backend, `BEGIN`/`ROLLBACK` no `psql` com claims JWT reais por `role_code` — sem
tocar em passwords, sem deixar dados permanentes — valores calculados à mão antes de cada
teste):**
1. Override de `margin` (0.6) em T-0005/SA, por `finance.test`: base `margin 0.5000, min
   1780.00, ref 1958.00` → pós-override `margin 0.600000, min **2225.00** (=890/(1−0.6)), ref
   **2448.00** (=arred(2225×1.1) — Postgres arredonda .5 para cima em `numeric`), `overrides
   {margin}` — exacto.
2. Ramo temporal: override de `coef` (1.2) com `valid_to` ontem → pedido de hoje devolve o
   valor de base (`list_coef 1.000`, `overrides {}`); o mesmo pedido com `p_date` há 15 dias
   (dentro da janela de validade) → `list_coef 1.200000`, `overrides {coef}` — o motor é
   sensível à data pedida, não só à de hoje.
3. Override de HS (T-0005/CORP, `392690` em vez de `960390`, zona US), pelo admin (`ref_write`
   é admin-only): `duty_rate` 0.0370→0.0650, `duty` 45.79→80.44, margem manteve-se no mesmo
   escalão (0.3500), `min_price` 2128.00→**2181.00**, `ref_price` 2341.00→**2399.00** —
   `overrides[]` continuou `{}` (ver achado da coluna "Overridden" acima).
4. `reason` a `NULL` → rejeitado pela própria BD (`null value in column "reason" ... violates
   not-null constraint`), não só pela UI.
5. A inserção da Prova 1 gerou de imediato uma linha em `audit_log` com `actor` = o `uid` real
   do autor (nunca lido do formulário), `action=INSERT`, `row_pk` correcto.
6. `sales.sa`: `INSERT` em `price_overrides` → negado por RLS (`new row violates row-level
   security policy`); `SELECT` em `price_overrides` e em `audit_log` → 0 linhas (RLS a filtrar
   silenciosamente, não erro); sem regressão — `compute_price()` continua a devolver
   `min_price`/`ref_price` (custos a `null`) para a filial própria.

Todas as provas confirmaram os valores calculados à mão sem desvio nenhum.

**Utilizadores de teste usados (mantidos, nenhum novo criado):** `finance.test@example.test`,
`sales.sa@example.test`, e o admin real (`pedroalexandre625@gmail.com`) — só ele tem `ref_write`
sobre `product_hs_overrides`.

**Nota de processo:** durante a preparação das provas, um `cat` a um ficheiro de passwords de
teste (`~/tmp/tmsi-sudo/test-users-passwords.txt`) imprimiu duas passwords em claro no output —
violação da regra "nunca em output" deste projecto, apesar de serem só duas contas fictícias
`.test` a que o Pedro já tem acesso directo ao ficheiro. Não repetido; as provas seguintes
passaram a usar injecção directa de claims JWT no `psql` (`set_config('request.jwt.claims', …)`
+ `set local role authenticated`), que nem sequer precisa de password nenhuma.

## Migração 0005 — correcção de câmbio no mesmo dia — ✅ FECHADA 2026-09-04

**Digest:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:50a6e8ef998e6a8d6e00c3f448a3ca6d3b4d55dc17ff95ad0ba3dac7634be628`
(`Created` 2026-09-04T20:42:48Z). **Footprint:** RAM available 194 MB; swap 1120/4096 MB (≈27%);
disco 48%.

**Achado real, do Pedro, ao usar o `/config` da i5 (não hipotético):** `tmsi.exchange_rates` tem
`unique (currency, effective_date)` — só uma entrada por moeda por dia. Um engano ao introduzir
uma taxa ficava sem correcção possível até ao dia seguinte, com o erro `duplicate key value
violates unique constraint "exchange_rates_currency_effective_date_key"`.

**Condição 1 (verificar todos os consumidores, não só o `fx_rate()`), antes de desenhar:**
`grep` ao schema (0001) e à app — `tmsi.fx_rate()` é o **único** leitor de cálculo desta tabela;
nenhuma outra função/vista lê `exchange_rates` directamente. A página `/config` lê a tabela
directamente, mas só para listagem (não é caminho de cálculo) — actualizada nesta mesma
migração para mostrar a supersessão (condição 2).

**Desenho:** relaxar o `unique` constraint (mais de uma entrada por moeda por dia passa a ser
permitida) + `fx_rate()` a desempatar por `created_at` (a mais recente introduzida vence entre
entradas do mesmo dia). **Achado de F1, não assumido:** o valor por omissão de `created_at`
(`now()`) fica **congelado durante toda a transacção** — confirmado ao vivo: duas inserções na
mesma transacção ficaram com o mesmo `created_at` ao byte, tornando o desempate
não-determinístico entre elas. Em uso real cada submissão do `/config` é a sua própria
transacção (o `now()` teria provavelmente funcionado na prática), mas depender dessa nuance
não documentada é frágil para uma coluna que passa também a desempatar de forma fiável — mudado
o valor por omissão para `clock_timestamp()`, confirmado ao vivo a resolver mesmo o pior caso
(duas inserções na mesma transacção).

**Condição 2 (a UI mostra a supersessão):** a listagem de câmbios em `/config` agrupa por
(`currency`, `effective_date`) — a primeira linha de cada grupo (pela mesma ordenação que o
`fx_rate()` usa) aparece como "in use"; qualquer outra do mesmo grupo aparece marcada "superseded
same day", em cinzento, não como uma duplicata inexplicada.

**Provas (condição 3), o cenário exacto do Pedro reproduzido antes de fechar:**
1. Entrada USD "enganada" (5.000000, hoje) → aceite (`201`); `fx_rate('USD')` → `5.000000`.
2. Segunda entrada USD, mesma data (1.150000) → **aceite** (`201` — antes desta migração seria
   `409`/erro de chave duplicada); `fx_rate('USD')` → `1.150000`, a corrigida, de imediato.
3. **Ramo temporal:** `fx_rate('USD', '2025-12-01')` → `1.158700`, a taxa histórica original da
   seed, insensível às correcções de hoje.
4. Terceira entrada a repor o valor da seed para hoje (1.158700) — `fx_rate('USD')` volta a
   `1.158700`; as duas entradas anteriores ficam na listagem como demonstração real da marcação
   "superseded same day".

**Numeração:** esta é a **0005** (consumiu o número que estava reservado para a migração
funcional da E4). **A migração funcional da E4 passa a 0006.**

## E3, iteração 5 — Configuração do pricing — ✅ FECHADA 2026-09-04

**Digest:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:5764934d727cafa1116ec8c8c05751d2d0b394b55b0d95cfb0d3149fdcc1ef37`
(`Created` 2026-09-04T20:04:14Z). **Footprint:** RAM available 190 MB; swap 1060/4096 MB (≈26%);
disco 47%. Containers: db 28.2M/320M, auth 1.9M/128M, rest 1.5M/128M, tmsi-app 41.6M/192M.

**Ficheiros entregues:** `/config` (secções verticais por tabela — FX, interco fees, transport
tiers, direitos aduaneiros, grelhas de margem, settings — mais simples que separadores em JS,
consistente com o resto da app); `auth-guard.ts` ganhou `canManageFinanceConfig()`,
`canManageOperationalConfig()` e `pricingConfigReadAccess()`, cada um a espelhar exactamente a
policy RLS real correspondente (ver matriz abaixo), nunca inventados.

**Técnica das linhas editáveis:** um `<form>` vazio (só `id`, `action` e os inputs escondidos da
chave composta) no primeiro `<td>` da linha; os campos visíveis noutras células referenciam-no
via `form="<id>"` (atributo HTML5), em vez de aninhar o `<form>` dentro de `<tr>`/múltiplos
`<td>` (inválido) ou colapsar campos num só `<td>` com `colSpan` (desalinha contra o `<thead>`,
que declara sempre um `<th>` por campo independentemente do acesso de escrita).

## E3, iteração 5 — Configuração do pricing — F0: matriz de permissões (0001, real, não assumida)

| Tabela | Leitura (RLS) | Escrita (RLS) | `audit_log`? |
|---|---|---|---|
| `exchange_rates` | `can_read_costs()` | admin ou finance | ✅ (trigger 0001 §5) |
| `interco_fees` | `can_read_costs()` | admin ou finance | ✅ |
| `transport_tiers` | `can_read_costs()` ou `logistics` | admin, finance ou logistics | ✅ |
| `customs_rates` | `can_read_costs()` ou `logistics` | admin, finance ou logistics | ✅ |
| `margin_grids` | `can_read_costs()` | admin ou finance | ✅ |
| `settings` | `true` (qualquer `authenticated`; `anon` tem `GRANT` mas nenhuma policy `to
  anon` — RLS nega por omissão, `grant` é inofensivo) | admin ou finance | ✅ |

**Restrição 2 do prompt (RLS de escrita ausente/incoerente → parar):** não accionada — as seis
têm política de escrita coerente com o desenho (nunca "qualquer `authenticated`"). **Restrição 3
(GRANT de tabela + dados que roles sem custo não devem ler → sinalizar):** verificada, não
accionada — ao contrário de `tmsi.products` (i4/0003), nenhuma destas seis tem uma mistura de
colunas "seguras" e "sensíveis" na mesma linha; cada linha é inteiramente visível ou
inteiramente invisível por role (RLS ao nível da linha chega, não há necessidade de mascarar
colunas dentro de uma linha visível — a lição da 0003 não se aplica aqui). `settings` visível a
qualquer `authenticated` por desenho da 0001 (não é uma fuga; é a política já aplicada,
registada, não alterada). **Restrição 4 (`audit_log` cobre as tabelas de configuração?):**
confirmado — as seis estão no `array` do trigger (0001 §5, `do $$ ... foreach t in array
[...'exchange_rates','interco_fees','transport_tiers','customs_rates','margin_grids',...
'settings'...] ...`); `hs_codes` (tabela de referência, não é uma das seis de configuração,
`ref_write` admin-only) não está no array — fora do âmbito desta iteração, tratada como dado de
referência para o separador de direitos, não com CRUD próprio.

**Regra de negócio já decidida (fonte obrigatória em câmbio manual):** `exchange_rates.source`
já é `not null` na 0001 — a BD já impõe isto, o formulário só precisa de tornar o campo
obrigatório, não inventar validação nova.

**Provas (as 5 do prompt), confirmadas via API, cálculo à mão antes de cada edição:**
1. **A que prova o motor vivo — câmbio:** `compute_price('T-0008','TBM')` antes:
   `fx_used=8.2576, exw_local=404.6224, interco=485.54688, min_price=1620.00` CNY — confirmado
   igual ao cálculo à mão antes de tocar em nada. Nova taxa CNY 9.0000 inserida (com fonte,
   `finance.test`) → depois: `fx_used=9.0, exw_local=441.00, interco=529.20, min_price=1760.00`
   CNY — **exactamente** o valor calculado à mão antes da edição (T-0008 é `service`, elimina
   transporte/direitos da equação, deixando só FX + fee interco SA→TBM 20% + grelha de margem
   TBM, tier1 fixo porque `total_cost_eur` = 58.80 EUR independe da taxa CNY neste caso concreto
   — cancela algebricamente, registado como achado incidental, não um bug).
2. **Transporte:** `compute_price('T-0001','SA')` antes: `transport=400.00` (tier 3, peso
   180 kg > tope do tier 2), `total_cost=6908.80`, `min_price=9870.00`. Editado o custo do
   tier 3 de SA para 500 → depois: `transport=500.00`, `total_cost=7008.80`, `min_price=10013.00`
   — exacto. **Direitos aduaneiros:** `compute_price('T-0002','LTD')` antes: `duty_rate=0.022,
   duty≈0.6627, min_price=222.00`. Editada a taxa HS 848180/UK para 0.050 → depois:
   `duty_rate=0.05, duty≈1.5061, min_price=223.00` — exacto. Ambas revertidas ao valor da seed
   depois da prova.
3. **`audit_log`:** as três edições (câmbio, transporte, direitos) registadas com `actor` =
   user_id exacto do utilizador de teste que as fez, valores antigo/novo capturados.
4. **Ramos negados:** `sales.sa` — leitura directa de `margin_grids`/`exchange_rates`/
   `interco_fees` → `[]` vazio (RLS nega a linha); escrita em `exchange_rates` → `403` explícito
   (`42501`); o predicado exacto que o redirect de `/config` usa (`can_read_costs()`,
   `has_role('logistics')`) → `false`/`false`. **Caso mais fino:** `logistics.test` — escreve
   `transport_tiers` (âmbito próprio) com sucesso; tenta escrever `margin_grids` (fora do seu
   âmbito, só admin/finance) → `200` com array vazio (RLS excluiu a linha do alvo do `UPDATE`,
   zero linhas afectadas — o mesmo padrão "ambíguo sem `return=representation`" já visto na i4;
   confirmado sem ambiguidade por leitura directa na BD que o valor não mudou).
5. Sem regressões: `/login`, `/prices`, `/products`, `/admin/users`, `/api/health`,
   `/auth/v1/health` confirmados sem alteração de comportamento.

**Utilizadores de teste criados para esta iteração, mantidos:** `finance.test@example.test`
(role `finance`) e `logistics.test@example.test` (role `logistics`) — passwords geradas,
`~/tmp/tmsi-sudo/{finance,logistics}-test-password.txt` no VPS (600), nunca no repo. Junto de
`pm.test`/`sales.sa`/`agent.apac` já existentes, cobrem agora todos os roles relevantes às
fronteiras de configuração.

**Provas de browser confirmadas pelo Pedro** (editar um câmbio como admin e ver o preço
recalculado; `/config` inexistente para `sales.sa`) — durante essa própria confirmação, o Pedro
encontrou um defeito real de usabilidade (não conseguia corrigir um câmbio enganado no mesmo
dia) — ver secção "Migração 0005" acima, já fechada.

## Migração 0003/0004 — protecção dos custos ao nível da BD — ✅ FECHADA 2026-09-04

**Digest final:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:183e26ab19570034825344575ab19ccb94489579ab828386dbef88c98e831e03`
(`Created` 2026-09-04T19:30:07Z). **Footprint:** RAM available 179 MB; swap 1040/4096 MB (≈25%);
disco 47%. Containers: db 11.3M/320M, auth 1.9M/128M, rest 3.3M/128M, tmsi-app 23.6M/192M.

**Fecha a pendência registada no fecho da i4** (secção acima): um pedido manual à API,
contornando a app, ainda lia `exw_price`/`sap_code_*`/`supplier_id` directamente de
`tmsi.products` — RLS só protegia linhas, nunca colunas. Esta migração move a fronteira para a
própria BD.

**F1 — o candidato do prompt (`REVOKE SELECT (col) ... FROM authenticated`) não funciona,
apanhado por teste empírico (`BEGIN`/`ROLLBACK`) antes de escrever a migração real:**
1. Um `REVOKE` de coluna sozinho é um **no-op silencioso** — privilégios de coluna no Postgres
   são aditivos sobre os de tabela, e a 0001 já corre `grant all on all tables in schema tmsi
   to authenticated`; esse grant de tabela continua a autorizar todas as colunas
   independentemente de um `REVOKE` de coluna posterior. Confirmado: `information_schema.
   column_privileges` continuava a mostrar `SELECT` depois do `REVOKE`, e uma leitura directa
   continuava a funcionar. Correcção: `REVOKE SELECT` **ao nível da tabela** primeiro, depois
   `GRANT SELECT (colunas seguras)` ao nível da coluna.
2. Isto também bloqueia os roles com acesso a custos (ex. `product_manager`) de ler as mesmas
   colunas directamente da tabela — todos os `authenticated` são o mesmo role Postgres via
   PostgREST, independentemente do `role` em `tmsi.user_roles`. Confirmado ao vivo. Precisa de
   uma vista como via de leitura alternativa.
3. Uma vista "ingénua" (dono por omissão, sem `security_invoker`) **ignora a RLS por completo**
   — o dono de `tmsi.products` e o role administrativo ligado têm ambos `BYPASSRLS`; uma vista
   assim devolveu **13 linhas** a uma sessão de teste `sales.sa` em vez das 7 reais. Forçar
   `security_invoker = true` resolve essa fuga mas volta a herdar os privilégios de coluna do
   role que chama, partindo a máscara `CASE` com um erro de permissão em vez de `NULL` limpo.
   **Desenho que sobrevive aos testes:** vista com semântica de dono (`security_invoker =
   false`, explícito) para o acesso às colunas, mas com a visibilidade de linha **replicada
   explicitamente** na própria cláusula `WHERE` da vista (as mesmas funções que a RLS usa, não
   lógica nova) em vez de herdada da RLS.

**Duas fronteiras nomeadas, não uma só `can_read_costs()` genérica** (decisão do Pedro, ao
apanhar que o complemento literal da `v_selling_prices` incluía dados físicos que o role
`logistics` já lê legitimamente noutro sítio — `transport_tiers`/`customs_rates`, e não é
`can_read_costs()`):
- **Segura (sem gate):** `id, name, category_id, item_type, status, lead_time_days, unit,
  primary_branch, sold_in` — as duas últimas movidas para aqui na 0004 (ver abaixo).
- **Operacional (`tmsi.can_read_operational()` = `can_read_costs() OR has_role('logistics')`):**
  `description, parent_id, origin_country, hs_code, gross_weight_kg, net_weight_kg, volume_m3,
  dimensions, palletizable, pallets, stackable`.
- **Financeira (`tmsi.can_read_costs()`, já existia desde a 0001):** `exw_price, currency,
  supplier_id, sap_code_sa, sap_code_cn, sap_code_us, sap_code_uk, last_reviewed_at, created_at,
  updated_at, created_by, updated_by` (campos de auditoria/bookkeeping ficaram na fronteira mais
  estreita — mais próximo do conjunto de roles da própria `audit_read` policy da `audit_log`,
  que também exclui `logistics`, do que o alargamento para `can_read_operational()`).

**Drift da predicate replicada, fechado, não só anotado:** `tmsi.products_visible(p_primary_branch,
p_sold_in, p_status)` factoriza a expressão exacta que `products_read` já usava; a própria policy
foi alterada (`alter policy ... using (tmsi.products_visible(...))`, legítimo numa migração nova,
0001 nunca tocada) para chamar a função em vez de duplicar a lógica — só há um sítio para mudar
"quem vê que produtos" no futuro. `config_read` em `transport_tiers`/`customs_rates` (0001, já
duplicava `can_read_costs() or has_role('logistics')` inline) também foi realinhada para chamar
`can_read_operational()`.

⚠️ **0004 — regressão da 0003 apanhada durante a F3 (ligação da app à vista), antes de reportar
qualquer prova como feita:** `primary_branch`/`sold_in` tinham ficado na fronteira "operacional"
(complemento literal da `v_selling_prices`) — mas a secção "Price by branch" de
`/products/[id]` usa exactamente essas duas colunas para saber a que filiais perguntar ao
`compute_price()`. Confirmado ao vivo: um pedido fresco de `sales.sa` a `v_products` devolvia
`primary_branch`/`sold_in` a `null`, partindo essa secção para o público principal dela. Estas
duas são metadados de encaminhamento, não dados sensíveis — a própria RLS de `products_read` já
condiciona a visibilidade da linha a `primary_branch`/`sold_in` coincidirem com o âmbito do
chamador, portanto um `sales`/`agent` já sabe implicitamente que um produto é vendido na sua
filial/canal só por conseguir ver a linha. Movidas para a fronteira segura; **0003 já aplicada,
não editada** — nova migração, consistente com a disciplina do projecto. Consequência de
numeração: a migração funcional da E4 passa a **0005**, não 0004.

**F3 — app simplificada, não só ajustada:** como a vista já trata o mascaramento por coluna, as
páginas deixaram de escolher entre duas listas de colunas explícitas consoante um role check —
passam sempre a mesma `select` a `tmsi.v_products` e confiam na própria vista para decidir o que
volta, o mesmo padrão já usado para o breakdown do `compute_price()`. `canReadOperational`/
`canReadCosts` no ecrã de detalhe vêm de chamadas RPC directas, não de inferir a partir dos
próprios campos devolvidos — todas as colunas da fronteira operacional são `nullable` também ao
nível da tabela (opções/serviços têm legitimamente `hs_code`/`gross_weight_kg` nulos), pelo que
um role com acesso ficaria com o mesmo aspecto de "sem acesso" ao ver um desses produtos. Na
listagem, `exw_price`/`currency` são as excepções seguras (`not null` na tabela — 0001 §3), por
isso aí "pelo menos uma linha não-nula" é um sinal fiável por chamador.

**Provas (F4 do prompt):**
1. **A que motiva tudo:** JWT do `sales.sa`, pedido a `/rest/v1/products?select=exw_price` →
   `403`, `{"code":"42501","message":"permission denied for table products"}` — recusado pela
   BD, não pela app. O mesmo para `sap_code_sa`/`supplier_id`. Via `tmsi.v_products` → `200`,
   valores `null` (mascarado, não erro).
2. `pm.test` (`product_manager`): vê custos via a vista (`exw_price: 890.00`); cria rascunho
   (`201`); activação bloqueada sem HS (erro real, não de permissão); preenchidos HS/peso/
   unidade/SAP → activa; EXW num produto `active`, sem tocar em `status` no pedido → `review`
   automático + nova linha em `price_versions` — a suite da i4 sem regressão nenhuma.
3. Confirmado pelo Pedro no browser: como admin tudo igual; como `sales.sa`, `/products` e
   `/prices` continuam a funcionar, sem custos.
4. Sem outros endpoints partidos: `/auth/v1/health`, `/login`, `/prices`, `/products`,
   `/admin/users`, `/api/health` confirmados sem alteração de comportamento. Cache de schema do
   PostgREST recarregou-se sozinha (self-hosted, sem `NOTIFY`/restart manual necessário — a
   vista ficou disponível via API imediatamente a seguir ao `COMMIT`).

**Armadilha real, apanhada a testar (não hipotética):** `Prefer: return=representation` (ou
`.select()` encadeado a seguir a `.update()`/`.insert()`) numa escrita contra `tmsi.products`
falha agora com `42501` para qualquer `authenticated`, mesmo `product_manager`, porque
`RETURNING *` exige `SELECT` nas colunas devolvidas — exactamente a armadilha que o prompt da
0003 avisava para verificar. **A app nunca fez isto** (`createProduct`/`updateProduct` nunca
encadeiam `.select()`), confirmado por leitura do código antes de escrever a migração — mas
registado aqui para qualquer código futuro sobre `tmsi.products`: nunca pedir `RETURNING`/
representação numa escrita à tabela; se for preciso ler o valor a seguir, ler da
`tmsi.v_products`, não da tabela.

## E3, iteração 4 — Formulário de produto — ✅ FECHADA 2026-09-04 (reaberta e corrigida no mesmo dia)

**Digest final:** `ghcr.io/pdr625/tmsiequipment/tmsi-app@sha256:4d8bc1995caceb38f02c2c9b3d1a354c4b64dc8c21558384e2b279c9c761a632`
(`Created` 2026-09-04T18:42:19Z). **Footprint:** RAM available 230 MB; swap 1077/4096 MB (≈26%);
disco 47%.

⚠️ **Reaberta pelo Pedro, achado real em teste de browser (a prova 4 do fecho anterior estava
incompleta):** como `sales.sa`, o EXW price era visível no separador `/products`.
`tmsi.products` tem RLS **só ao nível da linha** — não há protecção nenhuma ao nível da coluna.
`compute_price()` trata os valores derivados do EXW como estritamente need-to-know (`fx_used`,
`fee`, `total_cost_eur`, `margin`, etc. todos `null` para roles sem `can_read_costs()`), mas as
duas páginas desta iteração liam `tmsi.products` directamente e seleccionavam `exw_price` sem
condição nenhuma — o próprio EXW bruto, mais granular do que qualquer figura que o
`compute_price()` já esconde. **Corrigido ao nível do `.select()`, não da renderização:**
`can_read_costs()` (o mesmo predicado do `see_costs` interno do `compute_price()`) escolhe agora
entre duas listas de colunas explícitas antes do pedido à API sair — o valor nunca chega a sair
do PostgREST para quem não deve vê-lo, tal como a `v_selling_prices` (i2) já faz. Estendido a
`sap_code_*`/`supplier_id` (não tocados pelo `compute_price()` em si, mas também excluídos da
`v_selling_prices`, por consistência com o limite que o próprio schema já define).

**Prova nova, ao nível do payload, não do ecrã (condição do Pedro):** com o JWT do `sales.sa`,
repliquei directamente o `select` exacto que cada página agora envia — a resposta de
`/products` e de `/products/[id]` (`T-0005`) **não tem as chaves** `exw_price`/`sap_code_*`/
`supplier_id` (não `null` — ausentes). Confirmado em contraste com `pm.test` (role
`product_manager`), cujo `select` (o das colunas de custo) devolve tudo, incluindo `exw_price:
890.00`. Sem regressões (`/login`, `/prices`, `/products`, `/api/health`).

✅ **Pendência fechada pela migração 0003/0004 — ver secção própria abaixo.** O limite
registado aqui na altura (protecção só ao nível da aplicação; um pedido manual directo ainda
lia `exw_price`/`sap_code_sa` da tabela) já não existe: a BD recusa agora esse pedido
directamente (`403`, `permission denied for table products`), confirmado ao vivo.

**Ficheiros entregues:** `/products` (listagem, âmbito por `products_read`, mesmo padrão "pergunta
ao Postgres" do `/prices`); `/products/new` (rascunho mínimo — só as colunas `not null` sem
`default` de `tmsi.products`, coerente com o próprio ciclo de vida "rascunho não precisa de
tudo"); `/products/[id]` (detalhe: breakdown de `compute_price()` por filial, histórico de
`price_versions`, `audit_log`, formulário de edição gated por `canManageProducts()`).
`canManageProducts()` (`auth-guard.ts`) espelha exactamente a `USING` clause de
`products_write_pm` (`has_role('admin') or has_role('product_manager')`).

**Dois CI failures apanhados e corrigidos antes do deploy** (nenhum exigiu decisão de arquitectura,
ambos defeitos mecânicos de tipos):
1. `state?.error`/`state?.success` num union `{error} | {success}` não compila — cada ramo não
   tem a propriedade do outro, mesmo com `?.`. Corrigido para `'error' in state`, o padrão já
   usado no `ErrorText` do admin/users.
2. `.overrideTypes()` encadeado directamente a seguir a `.rpc()` — nunca usado antes nesta app
   (só depois de `.from().select()`) — parte do princípio de que sem tipos gerados de Database
   (decisão da E1: sem lockfile), o `.rpc()` cai num tipo solto que o guard interno do
   `overrideTypes` rejeita para um retorno em tabela/array. Resolvido com o mesmo cast simples
   (`as`) que o `prices/page.tsx` já usa para as suas próprias linhas de vista, através de
   `unknown` (o tipo inferido de linha única e o array real não têm sobreposição estrutural
   suficiente para um `as` directo).

**Estado (status) é um `<select>` simples sobre os 6 valores, sem restrição nenhuma do lado do
cliente** — verificado no schema real: para além do trigger de activação (`active`/`review`) e do
trigger de reabertura por alteração de EXW num produto `active`, a 0001 **não impõe grafo de
transições nenhum**. Uma máquina de estados no cliente estaria a inventar regras que o schema não
tem; o formulário deixa passar qualquer transição e mostra o erro real da BD quando a activação
falha.

**Provas (as 6 do prompt), todas confirmadas via API antes do deploy pedir confirmação ao
Pedro:**
1. **Rascunho + `audit_log`:** criado `T-9002` como `pm.test` (role `product_manager`) → `201`;
   `audit_log` confirmado directamente na BD com `actor` = user_id exacto do `pm.test`.
2. **Bloqueio de activação, sequência real do trigger, depois sucesso:** `T-9002` sem HS → erro
   real `"Product T-9002 cannot be active without an HS code"`; corrigido HS → bloqueia em peso;
   corrigido peso → bloqueia em unidade; corrigido unidade → bloqueia em código SAP da filial
   fornecedora; corrigido SAP → `active`, sucesso. **Excepção options/services provada à parte**
   (`T-9004`, `item_type=option`, `parent_id=T-0005`): activou **sem nunca ter HS nem peso**,
   bloqueado só em unidade e depois só em SAP — a isenção é real e tem o âmbito certo (não isenta
   unidade nem SAP).
3. **EXW em produto activo → `review` automático + nova versão, sem intervenção manual:**
   `PATCH` só com `exw_price` (sem tocar em `status`) em `T-9002` (activo) → resposta já com
   `status: "review"`; `tmsi.price_versions` confirmada com 2 linhas (criação + a alteração).
4. **Custos por role:** `compute_price('T-0005','SA')` como `pm.test` → todas as colunas de
   custo preenchidas (`total_cost_eur: 890`, `margin: 0.50`, etc.); o mesmo RPC como `sales.sa`
   → custos todos `null`, `min_price`/`ref_price` continuam visíveis (mesmo padrão da i2). **Ao
   nível do payload das duas páginas** (completado depois da reabertura, ver acima): `select`
   exacto que `/products` e `/products/[id]` enviam para `sales.sa` → resposta sem as chaves
   `exw_price`/`sap_code_*`/`supplier_id` (ausentes, não `null`); o mesmo `select` de custo como
   `pm.test` → tudo presente, `exw_price: 890.00` incluído.
5. **Ramo negado:** `POST /products` como `sales.sa` → `403` RLS explícito; `PATCH` num produto
   existente → `200` mas array **vazio** (`[]`, `Prefer: return=representation`) — RLS excluiu a
   linha do conjunto alvo do `UPDATE`, zero linhas afectadas, confirmado directamente na BD que
   `T-0005` **não mudou** (`890.00`, `updated_at` inalterado). ⚠️ Registado porque a primeira
   tentativa deste teste, sem `return=representation`, deu `204` — ambíguo entre "escreveu" e
   "zero linhas". Nunca tratado como prova sem o `[]`/verificação directa na BD.
6. Sem regressões: `/login`, `/prices`, `/admin/users`, `/api/health` confirmados sem alteração
   de comportamento depois do deploy; `/products` (sem sessão) → 307, mesma protecção por
   omissão da middleware que as restantes rotas.

**Produtos de teste ficam no seed, documentados aqui** (não fazem parte da 0001/seed original,
IDs `T-9xxx` deliberadamente fora do intervalo `T-0001`–`T-0010`): `T-9002` (equipment, ficou em
`review` — demonstra o ciclo EXW→review), `T-9004` (option de `T-0005`, `active` — demonstra a
isenção HS/peso). `T-9001` (do achado da 0002, F1) foi apagado; `T-0005` foi revertido ao estado
do seed depois desse teste — ver secção anterior.

**Provas de browser confirmadas pelo Pedro** — CI verde, ecrãs como admin, e (depois da
reabertura) `sales.sa` em `/products` já não vê o EXW. Iteração fechada, sem pendências. A
questão L2 (workflow de aprovação) fica explicitamente em aberto para a E4, não tocada nesta
iteração.

## E3, iteração 4 — Formulário de produto — F1: migração 0002 (defeito real da 0001, corrigido)

**Achado, antes de qualquer código de UI:** `tmsi.record_exw_version()` (trigger AFTER que grava
`tmsi.price_versions` a cada insert/alteração de `exw_price`/`currency` — 0001 §5) estava
declarada `language plpgsql` simples, **sem `security definer`** — corria com o role de quem
chama (`authenticated`), não com o dono da tabela. `tmsi.price_versions` tem RLS activo com **só**
uma política de leitura (`versions_read`); não existia política de escrita nenhuma. Resultado:
**toda e qualquer escrita em `tmsi.products` falhava**, `42501 new row violates row-level security
policy for table "price_versions"` — confirmado ao vivo, sessão real (não `service_role`),
utilizador de teste com role `product_manager`:
- `INSERT` de um produto novo em rascunho → 403.
- `UPDATE` de `exw_price` num produto já `active` (`T-0005`) → 403.

Ambos confirmados sem deixar rasto (transacção Postgres é atómica — nem o produto nem a versão
ficaram gravados nos dois testes). **Porque é que o seed nunca apanhou isto:** as 11 linhas
originais em `price_versions` vêm do script de seed (0001 §9), que corre directamente como
superuser ligado à base de dados — nunca passou por PostgREST/RLS. RLS só existe para roles não
superuser (`authenticated`/`anon`); o caminho que o seed usa é estruturalmente imune a este
defeito, por isso nunca o exercitou. `tmsi.audit()` (mesma secção do ficheiro, poucas linhas
antes) já resolve a mesma categoria de problema — tabela de sistema alimentada por trigger que o
`authenticated` não deve escrever directamente — sendo `security definer`; `record_exw_version()`
tinha ficado inconsistente com o seu próprio vizinho no ficheiro.

**Isto bloqueava toda a iteração à nascença** — não era um caso de bordo do fluxo de review, era
qualquer escrita em produtos, para qualquer role, incluindo admin. Condição de paragem do próprio
prompt da i4 ("sem caminho de escrita RLS → propor migração 0002, sem aplicar") accionada;
proposta revista e **aprovada pelo Pedro com 5 condições, todas cumpridas antes/durante a
aplicação:**
1. **`search_path` fixo, e não só em `record_exw_version()`.** Revisão do Pedro apanhou que
   `tmsi.audit()` — já aplicada desde a 0001, já em uso — é `security definer` mas **sem
   `search_path` nenhum fixado**, o mesmo vector clássico de escalada de privilégios. A 0002
   corrige as duas. `search_path = tmsi, pg_temp` (não `tmsi, public`, que é o padrão que
   `compute_price`/`fx_rate`/`branch_margin`/`override_value` usam na 0001) — `public` é escrevível
   em muitos setups Postgres e é exactamente o alvo de um ataque de *search_path hijacking*;
   `pg_temp` é o sufixo seguro recomendado pela documentação do Postgres para funções `security
   definer`.
2. **Prova do ramo negado depois de aplicar:** com o mesmo utilizador `product_manager`, `INSERT`
   directo em `tmsi.price_versions` via API → continua **403** (`42501`, mesma mensagem). A
   migração só destravou a trigger em si (via `security definer`); não abriu escrita directa —
   confirmado, não assumido.
3. **Ordem respeitada:** `0002` commitada e pushed (`8b2239f`) antes de aplicada.
4. **Backup antes:** `tmsi-backup.service` disparado manualmente pelo Pedro; dump
   `~/backups/tmsi/tmsi-2026-09-04.dump` confirmado fresco (18:33, a refletir o estado antes do
   `ALTER`) antes de tocar no schema.
5. Este registo — achado + porquê o seed não apanhou + migração + numeração — é este próprio
   parágrafo.

**Aplicada** via `docker compose exec -T db psql ... < 0002_price_versions_security_definer.sql`
(padrão da 0001). Confirmado depois de aplicar: `pg_proc.prosecdef = t` e
`proconfig = {"search_path=tmsi, pg_temp"}` nas duas funções; reteste completo dos dois casos que
falhavam — `INSERT` de rascunho → 201, `UPDATE` de `exw_price` num produto `active` → 200 **e**
`status` passou a `review` na mesma resposta (a trigger `trg_products_exw_review` nunca tinha sido
o problema — é `record_exw_version`, a seguinte na cadeia, que bloqueava tudo); `price_versions`
confirmada com as linhas novas via SQL directo. Produto de teste efémero (`T-9001`) apagado e
`T-0005` revertido ao estado do seed (`active`, 890.00 EUR) depois da prova — o achado ficou
isolado da baseline do seed.

**Numeração:** esta é a **0002**. A próxima migração funcional da E4 (workflow de aprovação,
regra 90 dias, notificações) passa a **0003**.

**Utilizador de teste criado para este achado, mantido:** `pm.test@example.test`, role
`product_manager`, sem filial/canal (não é role com âmbito). Password gerada,
`~/tmp/tmsi-sudo/pm-test-password.txt` no VPS (600), nunca no repo.

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

✅ **Resolvida na tarefa 3 (2026-09-05)** — ver a secção dessa tarefa mais abaixo:
`generate-lockfile.yml` (`workflow_dispatch`, `npm install` só ali, nunca no VPS) gera e
commita `app/package-lock.json`; o Dockerfile passa a `npm ci`.

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
- **Restauro (CORRIGIDO 2026-09-06 pelo ensaio de desastre — a linha anterior estava ERRADA):**
  ```bash
  docker exec -i supabase-db pg_restore -U supabase_admin -d postgres --clean --if-exists < <dump>
  ```
  ⚠️ **`-U postgres` NÃO serve** — nesta imagem o `postgres` não é superuser (`rolsuper=f`); é o
  `supabase_admin`. Com `-U postgres` o restauro dá **441 erros** e deixa a BD meio-restaurada,
  de forma plausível de descartar como «ruído normal».
  ⚠️ **Nunca `--no-owner`** — poria as 23 tabelas `auth.*` no dono errado e o GoTrue morre a
  arrancar com `relation "schema_migrations" already exists`, mensagem que não aponta para a
  causa. Verificar depois: `auth.*` do `supabase_auth_admin`, `tmsi.*` do `postgres`.
  (O host não tem `pg_restore` — usar o do container.) Provado em `docs/DISASTER-DRILL.md`.
- **Postfix:** se `master.cf`/`main.cf` forem recriados do zero, o listener dedicado
  `172.20.40.1:smtp` (sem STARTTLS) e a regra ufw `172.20.40.1 25/tcp ALLOW IN 172.20.40.0/24`
  têm de ser reaplicados — ver secção 4 para o porquê e o conteúdo exacto.
- **Ponteiros:** dossier `~/atelier-vps/dossier/VPS.md`, relatório `~/tmp/tmsi-r0-report.md`.

## 6. Regra de manutenção

Toda a sessão que altere o estado do TMSI actualiza este ficheiro no mesmo passe
(commit + push), incluindo a Fase B deste prompt (secção 8 do prompt S1).

## 9. Ensaio de restauro completo (item 15) — 2026-09-06

Execução n.º 1, no **homelab** (cenário: «o VPS morreu»). Relatório completo:
**`docs/DISASTER-DRILL.md`**. Resumo:

- **RTO 13 min 21 s** até à camada de dados + API funcional (inclui dois restauros falhados e
  diagnosticados). **RPO**: o `branch_manager.test`, criado depois das 03:30, não estava no dump.
- **Sobreviveu tudo o que importa nos dados:** 38 POLICY, 8 funções `SECURITY DEFINER`, RLS por
  linha (sales 7 / finance 13) e a fronteira de custos 0003/0004 — com `JWT_SECRET` e
  `POSTGRES_PASSWORD` **gerados de raiz**, provando que os hashes bcrypt são independentes deles.
  O motor calcula: `compute_price('T-0002','SA')` → `min_price 189.0`, internos mascarados para
  `sales.sa`.
- **Não sobreviveu o procedimento.** Dois defeitos no que estava escrito (`-U postgres`;
  `--no-owner`), ambos silenciosos. §5 acima corrigida.
- **A imagem está presa ao hostname de produção** (`NEXT_PUBLIC_*` compilados) → item 22.
- **O pacote GHCR é público** → item 23 (decidido: tornar privado).
- **O `.env` do VPS não existe em mais lado nenhum** → escrow, ponto 5 do item 21.
- Ambiente totalmente desmontado e verificado; o parque do homelab voltou ao baseline exacto
  (28 containers), com o domínio de produção apontado a `127.0.0.1` durante todo o ensaio para
  garantir que não lhe tocava.
