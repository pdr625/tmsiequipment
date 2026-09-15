# ENGINE-PARITY.md — paridade do motor de preços contra o Excel de referência

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Data:** 2026-09-15/16. **Âmbito:** `docs/BACKLOG.md` item 38. **Restrição 1 respeitada:**
nenhuma alteração ao motor, ao schema ou às migrações nesta sessão — toda a diferença
encontrada é achado com diagnóstico, não correcção. Este ficheiro cita códigos, referências
e percentagens; não reproduz a tabela de preços real (restrição 7 do prompt desta sessão).

## Veredicto global

**A fórmula do motor bate 100% com o Excel.** Das 65 linhas da amostra (13 artigos × 5
âmbitos), 62 são comparáveis (3 ficam de fora por não terem margem dedutível, ver §4) e as
62 dividem-se assim:

| Classe | Linhas | Descrição |
|---|---|---|
| Exactas | 22 | Motor e Excel concordam dentro da tolerância declarada, sem excepção. |
| (iii) desvio de câmbio | 28 | Explicado por completo pela diferença entre a taxa de câmbio ao vivo (`/config`) e a taxa que o Excel usa nas suas próprias contas — pequeno, já sinalizado (2026-09-10), agora quantificado com precisão. |
| (iv) taxa antiga no Excel | 12 | Explicado por completo pela taxa desactualizada que o próprio Pedro confirmou e está a corrigir do lado do Excel (achado da sessão de 2026-09-15, "resolução da divergência de câmbio"). Não é um achado novo. |
| **Não explicadas** | **0** | — |

**Zero linhas ficaram sem explicação.** O motor pode substituir o Excel para o cálculo em si,
**sem ressalvas de fórmula** — as duas únicas fontes de diferença são de configuração
(câmbio), não de lógica de cálculo, e ambas já estavam identificadas antes desta sessão.
A ressalva real não é de fórmula, é de **processo de carregamento de dados** — ver §5 e o
`docs/BACKLOG.md` item novo registado lá.

## 1. Método

**Amostra:** `~/tmp/tmsi-paridade/tmsi-paridade-amostra.csv`, 13 artigos reais × 5 âmbitos
(`branch` SA/TBM/CORP/LTD + `channel` APAC), gerada a partir do Excel real da TMSI. Nunca
entrou em git; ficheiro `chmod 600`, `shred`'d no fecho desta sessão (§6).

**Validação da própria amostra (F0), antes de tocar na app:** aritmética interna do Excel
(`interco+transporte+direito=total`; `total/(1−margem)=mínimo`; `referência/mínimo=1,10`)
confirmada nas 62 linhas de paridade, sem excepção — a amostra em si não tem defeito.

**Artigos:** entraram pelo caminho real da app (`POST /rest/v1/products` com o token de
`product_manager.test`, o mesmo mecanismo RLS-gated que `/products/new` usa — não um
`INSERT` directo). IDs `T-9500`–`T-9512`, removidos no fecho da sessão (§5).

**Tolerâncias (restrição 2 do prompt), aplicadas exactamente como especificado, com uma
correcção documentada em §3:**
- Valores brutos (`price_interco`, `transporte`, `direito`, `custo total`) — motor não
  arredondado vs Excel: `|diferença| ≤ 0,005` **ou** `|diferença relativa| ≤ 1×10⁻⁶`.
- Mínimo publicado — `publicado ≥ bruto` **e** `publicado − bruto < 1 passo` da moeda da
  lista (EUR/USD/GBP: 0,01; CNY: 10,00).
- Referência publicada — **corrigida** (ver §3): tolerância composta
  `passo × ref_factor + passo/2`, não a regra "`≥ bruto`" do mínimo.

**Comparação em dois caminhos, não um:** cada linha foi lida via a API real
(`POST /rest/v1/rpc/compute_price`, papel `finance.test`) **e** via `tmsi.compute_price()`
directo em SQL. **Zero divergências entre os dois caminhos**, nas 62 linhas — confirmado
antes de qualquer comparação com o Excel (condição de paragem do prompt: "API ≠
`compute_price()` directo → parar"; não disparou).

## 2. Correcção de método, achada a meio da própria F3

A restrição 2 do prompt aplica ao "publicado" a regra `publicado ≥ bruto, publicado−bruto <
1 passo`. Essa regra está certa para o **mínimo** (arredonda sempre para cima, nunca há um
publicado legitimamente abaixo do bruto). **Está errada para a referência**, que arredonda
para o valor **mais próximo** a partir do mínimo **já arredondado** — um publicado
legitimamente abaixo do bruto do Excel é o resultado normal e esperado de metade dos casos
de arredondamento ao mais próximo, não um achado.

Prova concreta, três casos onde a regra literal do prompt gerava um falso positivo: `T-9504`
(ref 8) filial TBM — motor `14310,00` vs Excel bruto `14311` (o motor arredondou 14310↔14320
ao mais próximo, `14310` é o correcto); `T-9505` (ref 13) canal APAC — motor `340,00` vs
`341`; `T-9510` (ref 26) filial TBM — motor `58770,00` vs `58771,43`. Nos três casos o motor
está a arredondar correctamente ao mais próximo; a regra "nunca abaixo do bruto" simplesmente
não se aplica a um arredondamento que pode legitimamente ir para os dois lados.

Substituída pela tolerância composta já validada nesta mesma sessão de reconciliação
(2026-09-15, ferramenta `comparar.py`, derivada empiricamente do mesmo mecanismo de dois
estágios de arredondamento): `|motor − bruto| ≤ passo × ref_factor + passo/2` — cobre o
desvio herdado do arredondamento para cima do mínimo (`passo × ref_factor`) mais o próprio
arredondamento ao mais próximo da referência (`passo/2`). Com esta correcção, os três casos
acima (e todos os outros) passam a **OK** — não há nenhuma referência publicada genuinamente
errada em toda a amostra.

## 3. Classe (iii) — desvio de câmbio, quantificado com precisão

Afecta as 9 linhas de compra em CNY, vendidas às filiais SA/CORP/LTD (todos os artigos
excepto os 4 de compra em EUR), mais a linha do canal APAC do artigo comprado em EUR/CNY
(ref 19) e mais um punhado de linhas equivalentes noutros artigos — 28 linhas ao todo.
Gap medido, por par de moeda, entre a taxa ao vivo (`/config`, decisão de 2026-09-10:
CNY=8,26 · USD=1,1587 · GBP=0,88) e a taxa implícita nas contas do próprio Excel:

| Par | Taxa ao vivo | Taxa implícita no Excel | Desvio |
|---|---|---|---|
| CNY→EUR | 1/8,26 = 0,121065 | 0,121000 | **−0,05%** |
| CNY→USD | 1,1587/8,26 = 0,140278 | 0,140000 | **−0,20%** |
| CNY→GBP | 0,88/8,26 = 0,106538 | 0,107000 | **+0,43%** |

Pequeno, dentro de uma ordem de grandeza plausível de arredondamento/fonte de cotação —
**não é uma correcção pedida**, só a quantificação que a restrição 5 do prompt exigia antes
de a ignorar. Onde apareceu, todas as saídas dependentes (`interco`, `direito`, `custo
total`, `mínimo`, `referência`) escalam pela mesma proporção — confirmado linha a linha, não
assumido.

## 4. Classe (iv) — taxa antiga no Excel do Pedro (achado já conhecido, reconfirmado aqui)

Afecta as 12 linhas das filiais TBM/CORP/LTD (nunca o canal APAC) dos 4 artigos comprados em
EUR (refs 19, 22, 23, 43) — gap de **−16,46% a −16,67%**, consistente nas três moedas de
destino, exactamente o mesmo achado que a sessão de reconciliação de 2026-09-15 já tinha
isolado e que o Pedro confirmou ser uma taxa antiga no seu Excel, a corrigir do lado dele.
Não é um achado novo desta sessão — é a mesma divergência, agora reconfirmada com uma
segunda medição independente (a comparação completa, não só a inspecção da amostra).

**Diagnóstico das 3 linhas fora da contagem (refs 22, 23, 43, canal APAC, `in_margin`
vazio na amostra):** invertendo a fórmula a partir de `excel_min_price`, a margem implícita
não é um número redondo/reconhecível em nenhuma das duas leituras possíveis — usando o
`total_cost` tal como está no Excel (contaminado pela taxa antiga da classe (iv) acima) dá
0,2218 / 0,3189 / 0,4709; usando o `total_cost` que o motor calcularia com o câmbio correcto
dá 0,2236 / 0,3205 / 0,4722. Nenhuma das duas bate com nenhuma margem de filial do mesmo
artigo, nem com nenhum escalão da grelha. **Achado sobre o Excel, não resolvido aqui** — só
quem construiu a folha original sabe se há uma base diferente (ex.: `margin_delta` de canal
não capturado nesta amostra) ou se é mesmo um valor em falta.

## 5. Configuração carregada — o que ficou e o que foi excepção nomeada

Confirmado pela própria F0: nenhum dos 12 códigos HS reais da amostra existia em
`tmsi.hs_codes` (os 5 já lá eram fixture, um com a descrição a dizer literalmente
*"fictitious use"*); a grelha de transporte por escalão de peso não tem correspondência
nenhuma no Excel (decisão do Pedro, 2026-09-09: **o Excel nunca teve regra de transporte,
o valor é sempre manual por artigo/lista** — o escalão por peso é uma regra prospectiva da
app, não uma reconstrução do Excel).

- **12 códigos HS** inseridos directo em `tmsi.hs_codes` (tabela de referência, sem workflow
  de aprovação, mesmo padrão que `branches`/`channels` tinham antes do ecrã `/branches`).
- **Amostra provada, pelo mecanismo real de propor→aprovar** (9 aprovações, escolhidas para
  cobrir os dois ramos de elegibilidade que `decide_price_proposal()` tem): 4 linhas de
  `customs_rates` (1 código HS × 4 zonas) só a conta admin do Pedro pode aprovar; 5 overrides
  de transporte de 1 artigo (`ref 31`, as 5 linhas), incluindo a de CORP, aprovada pelo
  `branch_manager.test` — prova viva de que o mecanismo funciona nos dois ramos, com o motor
  confirmado insensível enquanto pendente e a reflectir o valor assim que aprovado.
- **Excepção nomeada, seed directo, documentada aqui e no `STATE.md`:** as restantes 44
  linhas de `customs_rates` (11 códigos HS × 4 zonas) e 98 overrides de transporte/margem
  (57 de transporte + 41 de margem, incluindo as 10 margens de canal, sempre obrigatórias
  — não há grelha nenhuma para âmbito canal). Motivo: `decide_price_proposal()` só tem
  caminho de aprovação para `admin` ou para um `branch_manager` na **sua própria** filial —
  uma alteração de configuração **global** (`branch_id IS NULL`, como `customs_rates`) cai
  sempre 100% na conta admin, sem excepção. Gerar as ~142 propostas reais e pedir ao Pedro
  para as aprovar uma a uma não provaria nada que as 9 já não tivessem provado — só o
  cansaria. Mesmo padrão do seed fictício original da migração 0001, anterior ao workflow da
  0007. **Âmbito estrito: só configuração, nunca artigo** — os 13 artigos entraram todos pelo
  caminho real, sem excepção nenhuma.

**Número medido, para o `docs/BACKLOG.md` item 39 (importação em massa):** 13 artigos desta
amostra precisaram de **163 entradas de configuração** (12 HS + 48 direitos + 62 transporte
+ 41 margem) para ficarem completos — **12,5 entradas de configuração por artigo**, em
média. Extrapolado para um catálogo real de 50–70 artigos: **625–875 entradas de
configuração**, das quais a esmagadora maioria cairia só na conta admin de aprovar, uma a
uma, pelo mecanismo actual. Isto deixa de ser intuição — é o dado que justifica a
importação em massa, e um achado de desenho à parte (abaixo).

## 6. Achado de desenho, registado, não resolvido aqui

`tmsi.decide_price_proposal()` não tem nenhum caminho para um `branch_manager` aprovar uma
proposta de âmbito **global** (`branch_id IS NULL` — `exchange_rates`, `interco_fees`... já
removido pela 0012, `customs_rates`). Com utilizadores reais, **qualquer revisão em bloco de
uma tabela de configuração global cai inteiramente na conta admin** — 48 aprovações só para
os direitos aduaneiros desta amostra de 13 artigos, sem nenhuma forma de partilhar a carga
com um segundo papel. Não é um problema do item 38: é um item novo de backlog (aprovação em
lote, ou um papel de "gestor de configuração" que não seja admin pleno) — registado como
`docs/BACKLOG.md` item 44.

## 7. Limpeza (F5)

Contagens antes/depois, contra a baseline (lição do item 14 — nunca confiar no comando de
limpeza sozinho):

| | Antes | Depois |
|---|---|---|
| `tmsi.products` (total / amostra `T-95%`) | 26 / 13 | **13 / 0** |
| `tmsi.price_overrides` (total / amostra) | 109 / 103 | **6 / 0** |
| `tmsi.hs_codes` | 17 | **17 (mantidos)** |
| `tmsi.customs_rates` | 68 | **68 (mantidos)** |

**Decisão registada:** os 13 artigos e os overrides que dependiam deles foram **apagados**
(`ON DELETE CASCADE` limpou os overrides automaticamente) — dados de teste desta verificação
específica, sem valor depois de provado o mecanismo. Os **12 códigos HS e as 48 linhas de
direitos aduaneiros ficaram** — não são dados de teste, são referência real que o item 39 vai
precisar outra vez quando o catálogo real (que inclui provavelmente os mesmos artigos)
entrar. As 9 propostas em `tmsi.price_proposals` (todas `approved`) ficaram como registo de
auditoria — mesmo padrão de qualquer outra proposta aprovada no histórico, mesmo referindo
produtos entretanto apagados.

Ficheiros de entrada (`~/tmp/tmsi-paridade/`) — `shred`'d depois deste relatório escrito e
commitado.

## 8. Fecho

- `docs/BACKLOG.md`: item 38 fechado (esta análise); item novo 44 registado (§6).
- `docs/STATE.md`: secção de fecho com o veredicto, as contagens e os números para o item 39.
- Dossier: delta + `dossier-push.sh`.
