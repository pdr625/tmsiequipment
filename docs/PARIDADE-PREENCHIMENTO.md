# Como preencher o CSV de paridade

Cópia versionada de referência (para futuras importações/reaproveitamento). A cópia de
trabalho, onde preenches os teus dados reais, vive em `~/tmp/tmsi-paridade/` — nunca aqui
(este directório é git; dados reais nunca entram no repositório).

Este ficheiro (`paridade-template.csv`, ao lado deste guia) serve para comparar, artigo a
artigo e filial a filial, o que o **motor** (a app TMSI) calcula com o que o **teu Excel**
de referência calcula. Uma linha = um artigo vendido numa filial concreta.

**As duas primeiras linhas são exemplo** (dados fictícios do catálogo de teste, os mesmos
que já existem na app) — só para veres a forma e o formato. **Apaga-as antes de começar a
preencher a sério.**

## Formato do ficheiro
- Abre em Excel normalmente — é um CSV com `;` a separar colunas (funciona directo em
  Excel PT/FR, que usa `;` por o `,` já ser o separador decimal aí).
- Números: podes escrever `895,00` ou `895.00` — o validador aceita os dois, mas **não
  misturado dentro da mesma célula** (`8.95,00` não é válido).
- Deixa uma célula em branco quando não se aplica (ex.: `hs_code` num serviço) — não
  escrevas "N/A" nem "-".

## Colunas, uma a uma

**`product_id`** — o código do artigo tal como está na app (`T-XXXX`). Está na ficha do
artigo em `/products/<código>` ou na listagem `/products`.

**`product_name`** — o nome do artigo, só para tu te orientares (não é usado em cálculo
nenhum). Copia da ficha do artigo.

**`branch_id`** — a filial que está a vender, uma de `SA` (Condat SA, França/EUR),
`TBM` (Condat TBM, China/CNY), `CORP` (Condat Corp, EUA/USD), `LTD` (Condat Ltd,
Reino Unido/GBP). É a filial cujo preço estás a comparar nesta linha — não confundir com a
filial de origem do artigo (`primary_branch`, coluna seguinte).

**`item_type`** — `equipment`, `spare_part`, `option` ou `service`, tal como está na ficha
do artigo. Importa porque `option` e `service` **não pagam transporte nem direitos
aduaneiros** no motor — se testares um destes, não esperes esses custos no cálculo.

**`currency`** — a moeda **do artigo** (não da filial que vende), 3 letras (`EUR`, `USD`,
`GBP`, `CNY`). Está na ficha do artigo, é a moeda em que o preço EXW abaixo está expresso.

**`exw_price`** — o preço EXW (à saída de fábrica) do artigo, na moeda de cima. É o ponto
de partida do cálculo, antes de qualquer taxa, transporte, direitos ou margem.

**`primary_branch`** — a filial de origem do artigo (quem o fabrica/fornece). Se for igual
à `branch_id` desta linha, o motor não cobra transporte nem direitos aduaneiros (é venda
"em casa"); se for diferente, cobra os dois.

**`hs_code`** — o código pautal do artigo (4-10 dígitos), usado para calcular direitos
aduaneiros. Em branco para `option`/`service` (não se aplica).

**`gross_weight_kg`** — peso bruto do artigo em kg, usado para escolher o escalão de
transporte da filial. Em branco para `option`/`service`.

**`sold_in`** — as filiais onde este artigo está autorizado a vender, separadas por vírgula
(ex.: `SA,TBM,CORP,LTD`). É só confirmação — se a `branch_id` desta linha não estiver nesta
lista, é sinal de que a app também não mostraria preço aí, vale a pena confirmar antes de
gastar tempo a comparar.

**`data_calculo`** — a data para a qual queres o cálculo (`AAAA-MM-DD`). **Podes deixar em
branco** — o validador e a app assumem "hoje" nesse caso. Só precisas de preencher se
quiseres comparar um preço de uma data passada (por exemplo, para confirmar uma taxa de
câmbio ou um escalão que já mudou entretanto).

**`excel_price`** — **o valor que o teu Excel dá para este artigo nesta filial.** Esta é a
coluna que faz deste ficheiro um ficheiro de *paridade* e não um ficheiro de importação — é
o número contra o qual o motor vai ser comparado. **Confirma com quem construiu o Excel se
este número é o "preço mínimo" ou o "preço de referência/lista"** — o motor calcula os
dois (`min_price` e `ref_price`) e não são o mesmo valor (o de referência inclui uma margem
comercial extra sobre o mínimo). Usa sempre o mesmo conceito em todas as linhas do
ficheiro, para a comparação fazer sentido.

**`notas`** — livre. Usa para o que quiseres registar sobre o caso (ex.: «está no limite do
escalão 2/3», «testar depois de corrigir a taxa GBP»).

## O que o validador confirma por ti

`validar.py` aqui no repo chama-se `scripts/validar_paridade.py` — em `~/tmp/tmsi-paridade/`
(a cópia de trabalho) tens os três ficheiros juntos e chama-se só `validar.py`; os exemplos
abaixo assumem essa cópia de trabalho.

Corre `python3 validar.py o-teu-ficheiro.csv` antes de entregar. Ele verifica, linha a
linha: colunas em falta, filiais e códigos HS que não existem na app, números que não dão
para ler, e `excel_price` vazio. E avisa-te (sem bloquear) se o ficheiro, no conjunto, ainda
não cobre os casos que a sessão de paridade quer ver: as 4 filiais representadas, algum
artigo perto do limite entre escalões de transporte, algum caso com direitos aduaneiros a
aplicar-se, e algum caso com uma margem/taxa forçada (override) activa.

## Os 3 passos

1. Copia `paridade-template.csv` para um novo nome (ex.: `paridade-2026-09.csv`), apaga as
   duas linhas de exemplo, preenche uma linha por artigo × filial a partir do Excel.
2. Corre `python3 validar.py paridade-2026-09.csv` e corrige o que ele apontar (os ❌ têm
   de ficar a zero antes de entregar; os ⚠️ são para pensares se o ficheiro já cobre o que
   a sessão de paridade precisa).
3. Entrega o ficheiro corrigido para a sessão de paridade motor-vs-Excel.
