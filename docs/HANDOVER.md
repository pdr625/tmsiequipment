# HANDOVER.md — para a sessão seguinte

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Escrito:** 2026-09-23, no fim da sessão do desempenho (item 69, migração 0020).
**Estado:** catálogo real activo, provado ponta a ponta no browser, e o `/prices` deixou de
calcular o catálogo inteiro a cada pedido.

---

## 1. Onde isto está

**Produção:** revisão `24c8a70`, digest `sha256:83c4a4f7…`. Migrações **0001–0020**. Smoke
**114 asserções**, verde nos três modos. Execução n.º 6 do protocolo feita.

| | |
|---|---|
| Artigos reais | 49 carregados · **46 `active`** · 3 `draft` (`T-1002`, `T-1020`, `T-1025`) |
| `sales` (SA) · `agent` (APAC) | vêem 46, sem custo |
| Ficheiro-fonte do catálogo | `tmsi-catalogo-completo-2026-09-16-v6.csv` (`sha256 5377a0c9…`), fora do repo |
| Contas de teste | seis `@example.test`, password única partilhada — ver `docs/TEST-ACCOUNTS.md` |

---

## 2. A primeira coisa a fazer: a medição de aceitação

**Está descrita no topo do `docs/STATE.md`.** Com o host calmo, `/prices?branch=APAC` como
`finance.test` deve dar **bem abaixo de 1 s** para 54 linhas (dava *timeout* de 8 s a 23/09).
Se der ≈3 s, a 0020 não é a culpada — a parte estrutural não pode regredir em silêncio; ler lá a
ordem por que investigar.

---

## 3. O que fica para o Pedro

1. **Lista de browser da execução n.º 5**, em `docs/VERIFICATION-PROTOCOL.md`: exports como
   `logistics.test`; as 15 linhas `critical` dos serviços (**item 67**); vista de impressão;
   branding no `.xlsx`; fluxos de email; password única e dashboard.
2. **Item 67 — a regra do `Alert`** nos três serviços CONDATLINK. Três saídas escritas.
3. **Os três `draft`** — `hs_code` do `T-1020`, SAP de origem dele e do `T-1002`, peso do
   `T-1025`. Nenhum peso foi inventado.
4. **Item 53** — `sap_code_us` duplicado.
5. **Item 32** — direito aduaneiro por zona, externo. **Até lá os preços são operacionais, não
   definitivos.**
6. **Lote de apresentação** (itens 72 e ⚠️11): `select('*')` no `/prices`, rótulo
   "All branches and channels", e coluna/filtro de estado — hoje um artigo `inactive` aparece ao
   lado dos activos sem se distinguir.

---

## 4. O que NÃO fazer já

**Item 71 — `price_cache`.** Está proposto com gatilhos calculados: **X = 4 s** no "All branches"
com host calmo, ou **N = 200 artigos reais**. Hoje estamos em 62 artigos e ~285 chamadas. Fazê-lo
agora é construir uma cache para um problema que uma projecção resolveu.

---

## 5. Leituras obrigatórias antes de escrever código

**`CLAUDE.md`** (raiz do repo). Seis regras, todas nascidas de defeitos reais. As duas mais
recentes, ambas de 2026-09-23:

- **`CREATE OR REPLACE VIEW` reinicia as `reloptions`** — toda a migração que recrie uma vista
  termina com um bloco `DO` que verifica o mapa, **nos dois sentidos**;
- **antes de escrever um ficheiro, olhar para o que lá está** — e o hook `commit-msg` que o
  verifica (`git config core.hooksPath scripts/hooks`, passo obrigatório num clone novo,
  `DEPLOY.md §5a`).

---

## 6. O fio que atravessa estas sessões

**Cinco defeitos foram encontrados na própria coisa que os estava a verificar.** A `0014` (um
`REVOKE` de coluna que era no-op), a `0016` (o default-deny que não existia), a
`prova-guarda-anon` (um "0 = 0"), um diagnóstico sobre defaults que inferia de um efeito causado
por mim, e agora a `0020` (o `security_invoker` perdido).

O da 0020 é o mais instrutivo: **o ensaio comparava impressões digitais e elas ficaram idênticas.**
Uma prova que só olha para o *resultado* não vê uma mudança em *como* o resultado é protegido.
Ao mexer numa vista, comparar também `reloptions`, dono e ACL.

E a regra que a 0019 e a 0020 juntas ensinam: **a impressão digital não é sempre a prova certa.**
Na 0019 ela *tinha* de mudar (alargava visibilidade); na 0020 *tinha* de ficar igual (só
desempenho). Escolher a invariante antes de medir, não depois.
