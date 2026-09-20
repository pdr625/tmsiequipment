# HANDOVER.md — para a sessão da migração 0018

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Escrito:** 2026-09-20, no fim da sessão das fronteiras laterais.
**Para:** quem abrir a sessão seguinte, que é a da **0018 — importador aprende a escrever `unit`**.

Não é um resumo do projecto (isso é `docs/STATUS-REPORT-2026-09.md`). É o que precisas de saber
para começar sem repetir trabalho nem tropeçar no que já tropeçámos.

---

## 1. Onde isto está

**Produção:** revisão `482bb4f`, digest
`sha256:1a8cca52914e81e76e0366276a4ae3e40a23a1403998f3bb99be2bd014492fa8`. Migrações **0001–0017**
aplicadas. Smoke **102 asserções**, verde no modo `jwt`.

**Catálogo real carregado, e por activar:** 49 artigos `T-1001`–`T-1052`, todos em `draft`.
Três diferidos (refs 47/48/49). `sales` e `agent` não vêem nada — por desenho, e é isso que a
activação vai mudar.

**O que bloqueia a activação, e é tudo o que falta:**

| Bloqueio | Estado |
|---|---|
| `unit` nos 49 artigos | **É a 0018.** Nem o ficheiro da carga nem o importador a escrevem |
| `sap_code_cn` dos 39 de origem TBM | ✅ feito — 37 por derivação, 2 excepções (`T-1002`, `T-1020`) |
| `hs_code` do `T-1020` | por fazer — 3 âmbitos em `error` |
| `sap_code_us` duplicado (`NC01728-998`) | decisão do Pedro: dado errado ou constraint errada? (item 53) |

---

## 2. O trabalho da 0018, e o que já está medido

**`tmsi.products.unit`** é `text` com FK para `tmsi.units(code)`. Seis valores: `KG`, `L`, `M`,
`MONTH`, `PCS`, `SET`. Os fictícios usam `MONTH`/`PCS`/`SET`; dos reais, só o `T-1001` tem
(`PCS`, escrito à mão numa sessão de browser).

**O importador não sabe escrever `unit`** — zero ocorrências da palavra em
`tmsi.run_import_products()`. Falta-lhe, e está tudo por fazer:

1. a coluna no contrato do `docs/IMPORT.md`;
2. validação contra `tmsi.units` com `{row, column, reason}`, como as outras colunas já fazem;
3. `unit` nas listas de `INSERT` **e** `UPDATE`;
4. **`unit` na comparação de detecção de alterações** — sem isto, um artigo existente nunca
   aparece como `to_update` na pré-visualização, e a importação parece não fazer nada.

O desfazer vem de graça: `import_batch_items` já guarda a linha inteira.

**CSV PREENCHIDO, pronto a importar:** `~/tmp/tmsi-unit/tmsi-unit-2026-09-20-preenchido.csv`
— 49 linhas, `product_id;article;item_type;category;unit`, **coluna `unit` completa**. Fora do
repo, `600`. (O vazio original fica ao lado, e o ficheiro-fonte também:
`tmsi-unit-proposta-2026-09-20.csv`.)

**⚠️ A `unit` vem da coluna `Unit` do PRICE_LIST do Excel** — é de lá que o Pedro a tirou, e é de
lá que **o importador a deve ler**. Não é um campo a inventar nem a derivar do `item_type`: a
fonte existe e tem dono.

**Fusão feita e provada a 2026-09-20** (por `product_id`, sem tocar nas outras quatro colunas):
os 49 casam nos dois sentidos, zero órfãos de cada lado; as outras colunas ficaram byte a byte
iguais e na mesma ordem; todas as `unit` preenchidas e dentro de `tmsi.units` — **PCS 47 · SET 1 ·
MONTH 1**; estrutura íntegra (50 linhas, 5 colunas, zero aspas).

**Três coisas que a fusão levantou, e que a 0018 tem de olhar antes de importar:**

1. **Onze linhas trazem `nota` a pedir confirmação** — não são ruído, são perguntas ao Pedro:
   oito artigos (`T-1031`…`T-1038`) cujo **nome diz "kit" mas o Excel diz `PCS`** (o preço é do
   kit ou da peça?); `T-1019` marcado `SET`, a confirmar se o peso bruto é o do kit completo; e
   `T-1025`, **sem unidade nem peso no Excel**, com `PCS` proposto por analogia com o `T-1024`.
   Importar antes de responder a isto grava uma unidade que ninguém confirmou.
2. **Duas linhas divergem do Excel cru**, deliberadamente: `T-1025` (Excel vazio → `PCS`, é a
   analogia acima) e `T-1051` (Excel `PCS` → **`MONTH`**, coerente com ser o artigo "Monthly
   rate", um serviço de aluguer mensal). As duas são decisões do Pedro, não erros de fusão.
3. **O `T-1001` já tem `unit = 'PCS'` na base** — escrito à mão numa sessão de browser a 16/09.
   O importador vai encontrá-lo preenchido: é o caso que testa a **detecção de alterações** (se
   o valor for o mesmo, tem de aparecer como `unchanged`, não como `to_update`).

---

## 3. Leituras obrigatórias antes de escrever uma linha

1. **`CLAUDE.md`** (raiz do repo) — convenções, cada uma nascida de um defeito real. Duas contam
   directamente para a 0018:
   - **toda a migração que crie ou recrie funções termina com `REVOKE` explícito do `PUBLIC` e
     com o bloco `DO` que a faz falhar antes do `COMMIT`** (item 65 — o
     `ALTER DEFAULT PRIVILEGES … IN SCHEMA` é no-op, a função nasce aberta);
   - **corpos de função vêm de produção** (`pg_get_functiondef()`), nunca da migração anterior nem
     de memória, e mostra-se o diff antes de aplicar.
2. **`docs/IMPORT.md`** — o contrato que a 0018 vai alterar.
3. **`docs/VERIFICATION-PROTOCOL.md`**, execução n.º 4 — estado da matriz das 9 identidades.

---

## 4. Ordem de trabalho sugerida

1. **Gerar o corpo de `run_import_products()` de produção** e aplicar as quatro alterações.
2. **Ensaio em transacção revertida** antes de aplicar: dry-run com um ficheiro que traga `unit`,
   e confirmar que um artigo existente com `unit` diferente aparece como `to_update` — é o ponto
   4 acima, e é o que se esquece.
3. **Aplicar** com dump imediatamente antes.
4. **Pedro preenche o CSV**, dry-run, mostrar, gravar.
5. **Activar** — e é aqui que o trabalho muda de natureza (ver §5).

---

## 5. ⚠️ A activação obriga a remedir coisas que hoje estão a zero

`sales` e `agent` dão **0 linhas** em quase tudo **porque nada está `active`** — é o portão de
estado, não a fronteira. Distinguir os dois importa, e no momento em que activares artigos reais:

- **A matriz do protocolo muda.** As linhas de `sales` e `agent` deixam de ser 0. Tem de haver
  **execução n.º 5**.
- **A fronteira de custo no export fica finalmente exercível** — é a única parte do gate que a
  execução n.º 4 não conseguiu fechar, porque sem linhas visíveis não há o que medir. Gerar um
  `.xlsx` real como `logistics.test` e confirmar que não traz coluna nem valor de custo.
- **"0 = 0" não prova nada** (convenção do `CLAUDE.md`): as asserções que hoje passam com zero
  linhas passam por falta de dados, não por mérito. Reler cada uma nessa altura.

---

## 6. Pendências que não são da 0018

| O quê | Quem |
|---|---|
| **Exposição:** correr `sudo ~/tmp/tmsi-sap/exposicao.sh` e colar o output — logs do nginx precisam de `adm`/sudo. **Retenção 06/09→hoje; 03/09–05/09 está perdido**, e o PostgREST não regista pedidos bem sucedidos (log-level `error`), logo não é fonte alternativa | Pedro |
| **Instalar o vhost** com `X-Content-Type-Options: nosniff` e o ficheiro da zona do rate limit (`sudo cp deploy/nginx/*.conf …`, `nginx -t`, `reload`) | Pedro |
| **Password do `logistics.test`** — mudada numa verificação de browser a 19/09, o ficheiro de credenciais ficou desactualizado; o modo `login` do smoke falha por isso (o `jwt` cobre tudo) | Pedro |
| **Item 32** — base do direito aduaneiro por zona, resposta do despachante. **Até lá os preços são operacionais, não definitivos** — não anunciar à equipa como finais | externo |
| Itens 53 (`sap_code_us` duplicado), 55 (métrica off-site), 60/61/62 fechados pela 0016/0017 | Pedro / próximas sessões |

---

## 7. O que esta cadeia de sessões ensinou, e que vale a pena não desaprender

**A verificação apanhou quatro defeitos na própria coisa que estava a verificar.** A 0014 (um
`REVOKE` de coluna que era no-op), a 0016 (o default-deny que não existia), a `prova-guarda-anon`
(um "0 = 0" que não provava nada) e um diagnóstico meu sobre defaults que inferia de um efeito
que eu próprio tinha causado. Nenhum deles apareceu por ler código: apareceram por **medir depois
de aplicar**.

**O caso sem credencial não era identidade de teste.** As 8 identidades da matriz eram todas
autenticadas, e foi exactamente aí que a fuga maior passou — o `anon` era o buraco entre duas
linhas. Agora é a 9.ª, no smoke e no protocolo.

**Um número igual ao esperado pode estar certo pela razão errada.** O `sales` interrogado sobre a
filial errada dá 0 linhas, e isso parece sucesso.
