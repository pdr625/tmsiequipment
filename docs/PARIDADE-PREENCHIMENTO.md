# Como preencher o CSV de paridade

Cópia versionada de referência (para futuras importações/reaproveitamento). A cópia de
trabalho, onde preenches os teus dados reais, vive em `~/tmp/tmsi-paridade/` — nunca aqui
(este directório é git; dados reais nunca entram no repositório). `validar.py` aqui no repo
chama-se `scripts/validar_paridade.py`; em `~/tmp/tmsi-paridade/` (a cópia de trabalho) tens
os três ficheiros juntos e chama-se só `validar.py` — os exemplos abaixo assumem essa cópia.

Este ficheiro (`paridade-template.csv`, ao lado deste guia) serve para comparar, artigo a
filial (ou canal a canal), o que o **motor** (a app TMSI) calcula com o que o **teu Excel**
de referência (`TMSI_PriceList Final.xlsx`) calcula. Uma linha = um artigo vendido numa
filial ou canal concreto.

**Versão 2 deste ficheiro** (sessão de reconciliação com o Excel real, 2026-09-09): trocou a
única coluna `excel_price` por 8 colunas que seguem a cadeia de cálculo do Excel passo a
passo, e acrescentou colunas para overrides por artigo e para linhas de canal (ex. `APAC`).
**Ainda não tinhas começado a preencher** (confirmado antes de mudar nada) — por isso não há
nada teu a recuperar; se já tiveres um ficheiro a meio a partir da versão 1, os `excel_price`
antigos correspondem aproximadamente ao novo `excel_reference_price` (ou `excel_min_price`,
consoante o que preencheste — ver a nota sobre os dois preços mais abaixo).

**As duas primeiras linhas são exemplo** (dados fictícios do catálogo de teste, os mesmos
que já existem na app) — só para veres a forma e o formato. **Apaga-as antes de começar a
preencher a sério.**

## ⚠️ Nota honesta sobre este guia

Esta sessão não teve acesso ao ficheiro Excel em si (não há cópia neste VPS) — as regras
usadas para desenhar as colunas abaixo vêm de uma análise feita antes, fora desta sessão.
**Não consigo indicar-te a folha/coluna exacta de onde tirar cada valor** — só o significado
de negócio de cada campo. Se quiseres essa precisão (útil sobretudo para `excel_duty_pct`,
`excel_transport` e os overrides por artigo), a forma mais rápida é tu confirmares comigo o
nome da folha à medida que preenches, ou dizeres-me onde no VPS posso ler o ficheiro.

## Formato do ficheiro
- Abre em Excel normalmente — é um CSV com `;` a separar colunas.
- Números: `895,00` ou `895.00`, nunca os dois juntos na mesma célula.
- Célula em branco quando não se aplica — nunca "N/A" nem "-".

## Colunas de identificação e de input (do artigo)

**`product_id`**, **`product_name`** — código (`T-XXXX`) e nome do artigo, da ficha em `/products`.

**`branch_id`** — **filial** (`SA`, `TBM`, `CORP`, `LTD`) **ou canal** (`APAC`, e outros que
venham a existir). Ver secção própria sobre linhas de canal, mais abaixo.

**`item_type`** — `equipment`, `spare_part`, `option` ou `service`.
**Atenção, achado desta sessão**: o motor ainda não aplica a regra do Excel "margem zero,
preço = EXW" para opções/serviços/artigos não devolvidos — vai calcular margem e taxas como
se fossem equipamento normal (ver `docs/MODEL-GAP-ANALYSIS.md`, item 11). Se incluíres estas
linhas na amostra, **regista na coluna `notas`**: "não vai bater certo — falta a regra no
motor", para a sessão de paridade não gastar tempo a investigar uma diferença já conhecida.

**`currency`**, **`exw_price`** — moeda e preço EXW do artigo (não da filial).

**`primary_branch`** — a filial de origem do artigo. **Nunca um canal** — é sempre a filial
física, mesmo numa linha de canal.

**`hs_code`** — código pautal do artigo. Em branco para `option`/`service`.

**`hs_code_zona`** — só preenches se houver um código HS **diferente do de cima**,
especificamente para esta filial (um "override" de HS por zona/filial). A maioria das linhas
fica em branco. **Nota**: o motor só lê este tipo de override quando é `scope_type='branch'`
— um override à escala de canal/agente existe no schema mas ainda não tem efeito nenhum no
cálculo (mesmo achado #5/#6).

**`gross_weight_kg`** — peso bruto em kg. Em branco para `option`/`service`.

**`fee_interco_artigo`**, **`margem_artigo`**, **`transporte_artigo`** — só preenches se o
Excel usar, para ESTE artigo nesta filial, uma taxa intercompany / margem / custo de
transporte **diferente** do valor normal da filial (20% de fee, a grelha de margens, o
escalão de peso). Em branco = usa o valor normal. O validador confirma se o que preencheres
aqui bate certo com os overrides que já existem na app.

**`sold_in`** — filiais onde o artigo vende, separadas por vírgula.

**`data_calculo`** — `AAAA-MM-DD`, opcional (em branco = hoje).

## As 8 colunas do resultado esperado (o que o Excel calcula)

Seguem a cadeia do Excel, cada uma um passo:

```
excel_price_interco     = EXW × (1 + fee intercompany), na moeda da filial
excel_transport         = custo do escalão de transporte (0 se for venda "em casa")
excel_duty_pct          = taxa de direitos aduaneiros aplicável (0 se "em casa")
excel_duty_amount       = excel_price_interco × excel_duty_pct   (SEM o transporte na base)
excel_total_cost        = excel_price_interco + excel_transport + excel_duty_amount
excel_margin            = a margem usada (decimal, ex. 0,35 = 35%)
excel_min_price         = excel_total_cost ÷ (1 − excel_margin)
excel_reference_price   = excel_min_price × 1,10   (o preço de lista/referência)
```

Preenche as 8, mesmo quando o valor é zero (linha "em casa": `excel_transport=0`,
`excel_duty_pct=0`, `excel_duty_amount=0` — zero escrito, não em branco). Em branco só nas
duas colunas que não se aplicam a canais (ver a seguir).

**Porque são 8 e não uma só**: se um dia o `excel_min_price`/`excel_reference_price` não
bater certo com o motor, veres os passos intermédios diz logo ONDE a diferença nasce (câmbio?
transporte? direitos?) — sem os passos, só sabes que "está diferente", não porquê.

**⚠️ Tolerância de arredondamento (migração 0010, 2026-09-10) — para não confundires com um
erro.** O motor agora arredonda os dois preços publicados (`excel_min_price`/
`excel_reference_price`, na comparação): EUR/USD/GBP ao cêntimo, CNY à dezena — e o mínimo
arredonda sempre **para cima** (nunca à mais próxima, nunca para baixo — um mínimo mais
baixo deixaria de ser mínimo). **O Excel não arredonda nada** (`47183,754714285715` é um
valor real que já vimos lá). Isto significa que, depois desta migração, **é normal e
esperado** o motor e o Excel diferirem por um valor até ao passo da moeda (1 cêntimo em
EUR/USD/GBP, até 10 em CNY) em praticamente todas as linhas — não é um erro do motor nem
teu, é "motor certo, Excel a alinhar". Se vires uma diferença maior do que isso, aí sim
vale a pena investigar coluna a coluna (a razão de ser dos 8 passos, acima).

## Linhas de canal (`APAC`, e futuros)

Um canal **não é uma filial** — vende através de uma filial (ex. `APAC` vende através da
`TBM`), mas com uma regra diferente: **sem fee intercompany, sem direitos aduaneiros**.

```
excel_price_interco (canal) = EXW, sem fee nenhum
excel_transport (canal)     = escalão da filial por trás do canal (ex. TBM para a APAC)
excel_duty_pct / excel_duty_amount = deixar em BRANCO (não se aplica a canais)
excel_total_cost             = excel_price_interco + excel_transport
excel_min_price               = excel_total_cost ÷ (1 − margem)
excel_reference_price         = excel_min_price × 1,10
```

Numa linha de canal: `branch_id` = o código do canal (`APAC`), `primary_branch` continua a
ser a filial física de origem do artigo, `excel_duty_pct`/`excel_duty_amount` ficam em
branco (o validador aceita, só nestas linhas), as outras 6 colunas preenchem-se na mesma.

**Achado desta sessão, o mais importante**: o motor **ainda não sabe calcular canais** — só
usa a filial/canal para decidir quem PODE VER o preço, nunca para mudar a fórmula
(`docs/MODEL-GAP-ANALYSIS.md`, itens 5/6). Uma linha de canal no ficheiro serve para
**registar** o valor esperado, mas a sessão de paridade não vai conseguir compará-la com o
motor até essa migração existir — o validador avisa disto automaticamente (nota `ℹ️`, não
erro) quando vê uma linha de canal.

## Os três artigos com valor forçado no Excel

Se incluíres **PROFOAM CE**, **PROFOAM US** ou **EASY BRUSH FILLER ASSEMBLY** na amostra:
o Excel publica, para estes três, um preço mínimo diferente do calculado pela própria
fórmula (PROFOAM CE e PROFOAM US: ×1,10 acima do calculado; EASY BRUSH FILLER ASSEMBLY:
×1,40). Se os incluíres, preenche `excel_min_price`/`excel_reference_price` com **o valor
calculado pela fórmula**, não o valor forçado publicado — e assinala isso na coluna `notas`
("valor forçado no Excel, ×1,10/×1,40 acima do calculado — preenchido aqui com o
calculado"). Senão a paridade vai acusar uma diferença que não é do motor nem um erro teu.

## O que o validador confirma por ti

`python3 validar.py o-teu-ficheiro.csv` verifica: colunas presentes, filiais/canais/moedas/
códigos HS que existem na app, tipos de artigo válidos, números parseáveis, as colunas
sempre-obrigatórias preenchidas (as duas de direitos ficam por preencher só em linhas de
canal). Cruza também os overrides por artigo que preencheres com o que já existe activo na
app, e avisa das duas direcções (preencheste mas não existe / existe mas não preencheste).

E avisa (sem bloquear) da cobertura: as 4 filiais representadas, algum artigo perto do
limite de um escalão de transporte, algum caso com direitos aduaneiros a aplicar-se, algum
caso com override activo.

## Os 3 passos

1. Copia `paridade-template.csv` para um novo nome, apaga as duas linhas de exemplo,
   preenche uma linha por artigo × filial/canal a partir do Excel.
2. Corre `python3 validar.py o-teu-ficheiro.csv` e corrige o que apontar.
3. Entrega o ficheiro corrigido para a sessão de paridade motor-vs-Excel.
