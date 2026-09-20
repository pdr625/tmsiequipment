# HANDOVER.md — para a sessão seguinte

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Escrito:** 2026-09-20, no fim da sessão da activação (0018 + 0019).
**Estado:** o catálogo real está **activo e visível** aos papéis comerciais. O bloqueio que
durou quatro dias — a `unit` — caiu.

---

## 1. Onde isto está

**Produção:** revisão `482bb4f`, digest `sha256:1a8cca52…`. Migrações **0001–0019**. Smoke
**104 asserções**, verde nos três modos. Execução n.º 5 do protocolo feita, sobre dados activos.

| | |
|---|---|
| Artigos reais | 49 carregados · **46 `active`** · 3 `draft` |
| `draft`, e porquê | `T-1002` (sem SAP de origem) · `T-1020` (sem SAP de origem **e** sem `hs_code`) · `T-1025` (sem peso no Excel) |
| Diferidos, nunca carregados | refs 47/48/49 — `option` sem `primary_subsidiary`, e o importador não escreve `parent_id` |
| `sales` (SA) | vê **46**, sem custo | 
| `agent` (APAC) | vê **46**, sem custo, âmbitos APAC+TBM |
| Ficheiro-fonte do catálogo | **`tmsi-catalogo-completo-2026-09-16-v6.csv`** (`sha256 5377a0c9…`), fora do repo, `600` |

---

## 2. O que fica para o Pedro, e é curto

1. **Lista de browser da execução n.º 5** — está em `docs/VERIFICATION-PROTOCOL.md`, por ordem.
   O primeiro é o **export como `sales.test`**, que é a prova que faltava desde sempre: a
   fronteira de custo no export, agora exercível porque há linhas.
2. **Item 67 — a regra do `Alert`.** Os três serviços CONDATLINK aparecem `critical` (margem 0
   por decisão, item 30) e isso **é visível no export desde hoje**. Três saídas escritas no item.
   Não afecta preço; afecta a primeira impressão de quem receber o ficheiro.
3. **Os três `draft`** — `hs_code` do `T-1020`, SAP de origem dele e do `T-1002`, peso do
   `T-1025`. Nenhum peso foi inventado, como mandaste.
4. **Item 53** — `sap_code_us` duplicado (`NC01728-998` em `T-1021`/`T-1023`/`T-1042`). Não
   chegou à base; chegará na segunda importação.
5. **Item 32** — base do direito aduaneiro por zona, do despachante. **Até lá os preços são
   operacionais, não definitivos.**

---

## 3. Leituras obrigatórias antes de escrever código

**`CLAUDE.md`** (raiz do repo). Quatro regras nasceram nas últimas duas sessões, e todas de
defeitos reais:

- migração que cria funções termina com `REVOKE` + bloco `DO` (item 65);
- corpos de função vêm de **produção**, com diff mostrado;
- **uma migração que alarga visibilidade não pode ter a impressão digital igual** — a invariante
  é «o que já se via continua igual, os outros papéis idênticos» (0019);
- **"0 = 0" não prova nada**.

---

## 4. O que esta sessão ensinou

**Activar não é um passo administrativo.** Foi o momento em que quatro coisas se souberam pela
primeira vez, porque as cláusulas de `sales`/`agent` exigem `status='active'` e estiveram mortas
desde 2026-09-04:

- que `products_visible()` e `v_branch_prices` **discordavam** sobre a filial de origem (0019);
- que o `undo_import_batch` **não repunha a `unit`** — um desfazer que parecia ter funcionado;
- que o `Alert` marca `critical` em todos os serviços, e agora isso sai no ficheiro;
- que o CSV de unidades **não era importável**, porque o importador exige a forma completa.

Nenhuma delas veio de ler código. Vieram de medir depois de aplicar.
