# IMPORT.md — importação em massa (item 39)

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Ecrã:** `/import` (admin: os dois ficheiros; `product_manager`: só o de artigos — mesma
fronteira que `products_write_pm` já usa). **Migração:** 0013.

## Dois ficheiros, um mecanismo

### 1. Códigos HS + direitos aduaneiros

Colunas: `hs_code;description;rate`, uma linha por código. `rate` aplica-se às **4 zonas
por igual** — confirmado sem excepção no item 38 (nenhum `customs_rates` deste schema varia
por zona). Não há coluna de zona: não é suportado hoje, seria fabricar uma distinção que os
dados reais nunca mostraram.

### 2. Artigos + configuração

Mesma estrutura da amostra de paridade (`docs/ENGINE-PARITY.md`) — uma linha por
artigo×âmbito. Duas colunas novas face a essa amostra, ambas derivadas nesta sessão, não
herdadas dela:

| Coluna | Obrigatória | Vai para | Nota |
|---|---|---|---|
| `product_id` | sim | `products.id` (chave de upsert) | Formato `T-####`. A amostra de paridade nunca teve isto — o `ref` dela era só um índice de comparação. |
| `article` | sim | `products.name` | |
| `item_type` | sim | `products.item_type` | `equipment`\|`spare_part`\|`option`\|`service`. Novo — a amostra inferia isto à mão pela categoria. |
| `purchase_currency` | sim | `products.currency` | |
| `exw_price` | sim | `products.exw_price` | |
| `primary_subsidiary` | sim | `products.primary_branch` | Nome da filial (`Condat SA`…), resolvido por `tmsi.branches.name`. |
| `scope_type` | sim | — | `branch`\|`channel`. |
| `scope_code` | sim | — | id da filial ou canal. |
| `category` | não | `products.category_id` | Por `tmsi.categories.id` ou `.name` — nunca cria categoria nova. |
| `sap_code_sa` | não | `products.sap_code_sa` | |
| `hs_code_ref` | não | `products.hs_code` | Tem de já existir em `tmsi.hs_codes` — correr o ficheiro de direitos primeiro. |
| `gross_weight_kg` | não | `products.gross_weight_kg` | |
| `in_interco_fee` | não | `products.interco_margin` | **Nível-artigo desde a 0012** — lido das linhas de filial não-origem, tem de ser igual entre elas; ignorado nas linhas de canal (a fee de canal é sempre 0, por regra do motor). |
| `in_transport` | não | `price_overrides` (kind=transport) | Entra verbatim — o Excel nunca teve regra de escalão por peso (decisão do Pedro, 09/09, confirmada no item 38). |
| `in_margin` | não | `price_overrides` (kind=margin) | Célula vazia nunca é 0 — fica sem override, o motor usa a grelha (branch) ou erra por desenho (channel, que não tem grelha). |
| `in_hs_local` | aceite, **ignorada** | — | Coluna "Local HS Code" do Excel de origem, corrompida por arrasto (item 38) — nunca lida. |
| `in_duty_pct` | aceite, **ignorada** | — | Direitos entram pelo ficheiro 1, não duplicados aqui. |
| `notas` | aceite, ignorada | — | Só para quem lê o ficheiro. |

`sold_in` deriva-se automaticamente: as filiais de âmbito `branch` vistas para o
`product_id`, menos a filial de origem.

## Modos

**Só existe o modo inicial hoje** — escrita directa, fora do workflow de propor/aprovar
(decisão de 06/09, registada e datada em `docs/STATE.md`). Um segundo modo — importações
posteriores a entrar como proposta agrupada — depende de aprovação em lote existir
(`docs/BACKLOG.md` item 44, não desenhado); até lá, toda a importação escreve directo,
sempre, atrás de `admin`/`product_manager`.

## Pré-visualização (por omissão) vs gravação

O ecrã pede sempre pré-visualização primeiro (`p_dry_run=true`) — mostra o que seria criado/
actualizado/inalterado, nada é escrito. Gravar é um segundo formulário, com motivo
obrigatório, só activo depois de uma pré-visualização **bem sucedida**.

## Tudo ou nada

Uma linha inválida em qualquer coluna rejeita o ficheiro inteiro — a `p_rows` do RPC nunca
escreve nada se `errors` tiver alguma entrada. Erro sempre com `{row, column, reason}`, nunca
uma mensagem genérica.

## Idempotência

Correr o mesmo ficheiro duas vezes deixa a BD idêntica na segunda — cada valor é comparado
com o que já existe antes de decidir escrever; sem diferença, sem escrita (confirmado por
contagem, não por "correu sem erro" — ver `docs/ENGINE-PARITY.md` item 38/F4 no
`docs/STATE.md`).

## Desfazer um lote

`tmsi.undo_import_batch(p_batch_id, p_reason)` — admin-only, desfaz **todos** os itens de um
lote de uma vez: uma linha que este lote inseriu é apagada; uma linha que actualizou volta ao
valor anterior (`import_batch_items.old_row`, capturado no momento da escrita). Um lote já
revertido não pode ser revertido outra vez (`status` passa a `reverted`). Disponível no ecrã
`/import`, secção "Lotes recentes" — só visível a `admin`.

## Fronteiras

`tmsi.run_import_hs_duty()`/`run_import_products()` são `SECURITY DEFINER`, não políticas de
RLS — verificam `has_role()` explicitamente no corpo. Um papel sem `admin` nem
`product_manager` é recusado pela própria função, confirmado ao vivo (`docs/STATE.md`,
`scripts/smoke.py` bloco Z). Nenhum dos dois ficheiros toca em colunas de custo por um
caminho que as contorne — os `INSERT`/`UPDATE` são exactamente os mesmos que `/products/new`
e `/config` já fazem, só agrupados.

## Limites conhecidos, não resolvidos aqui

- Sem aprovação em lote (item 44) — toda a escrita, hoje, é sempre directa.
- `hs_code`/`customs_rates` não suportam taxa por zona — só uniforme.
- Um artigo com `item_type='option'` precisa de `parent_id` (regra da 0001,
  `products_check`); este importador não tem coluna para isso — falha com o erro real da BD,
  não escondido, mas `option`/`service` com relação a um artigo-pai fica fora do âmbito desta
  primeira versão.
