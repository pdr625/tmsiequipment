# HANDOVER.md — para a sessão seguinte

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Escrito:** 2026-09-24, no fim da sessão «E6, parte 1 — preparar a apresentação à equipa».
**Estado:** a app está pronta para ser mostrada. O que falta é a apresentação, o despachante
(item 32) e a licença. A versão anterior deste ficheiro (latência, 23/09) está no git
(`git show a258215:docs/HANDOVER.md`); o essencial dela passou para o `STATE.md` e o `ROADMAP.md`.

---

## 1. Onde isto está

**Produção:** revisão `392770f`, digest `sha256:345a31c92f01…`, `healthy`. Migrações **0001–0020**.
Smoke **129/129**, verde nos três modos. Execução n.º 6 do protocolo (23/09) — **esta sessão não
tocou em RLS, vistas nem privilégios**, logo não pede execução nova.

| | |
|---|---|
| Artigos reais | 49 carregados · **46 `active`** · 3 `draft` (`T-1002`, `T-1020`, `T-1025`) |
| Contas de teste | seis `@example.test`, password única partilhada até à produção — `docs/TEST-ACCOUNTS.md` |
| Roadmap | **`docs/ROADMAP.md` é agora a v6**; a v5 está em `docs/archive/ROADMAP-v5.md` |
| Guião da demo | `docs/DEMO-SCRIPT.md` |
| Onboarding | `docs/PILOT-ONBOARDING.md` (inglês, reescrito contra o estado real) |

---

## 2. Coisas vivas que a sessão seguinte tem de saber

- **O aviso «preços operacionais» não tem linha em `settings` até o admin lhe tocar.** Ausente =
  ligado, por desenho. Não criar a chave por psql: a autoria seria nula ou emprestada.
- **Depois da demo, o `T-0004` fica com um override de margem aprovado** (artigo fictício, CORP)
  **e há uma proposta de câmbio rejeitada** no histórico. A proposta fica — é registo. O override
  remove-se: `select id, kind, valid_from from tmsi.price_overrides where product_id = 'T-0004'
  order by id;` — o de maior `id` com motivo «demo». Transacção, contagem antes/depois.
  *Só se a demo tiver acontecido — confirmar com o Pedro.*
- **Um câmbio nunca se aprova numa demo.** Só o admin aprova (proposta sem filial), e aprovar move
  os preços reais da moeda inteira. Está no guião; não reinventar.

---

## 3. O que fica para o Pedro — lista de browser, por ordem

1. **Agora, nesta sessão:** passar o rato pelos seis botões de âmbito do `/prices`, **zero
   cliques** → `scripts/contar-pedidos.sh 5` deve dar `PREFETCH: 0` (ou nenhuma linha
   `PREFETCH`).
2. **Como admin** → `Pricing configuration` → *Operational price notice*: **Hide notice** → abrir
   `/prices` (o aviso sumiu) → **Show notice** → volta. É a prova do interruptor e deixa a chave
   criada com a tua autoria.
3. **Como `finance.test`** → `/config`: a secção *Operational price notice* **não** aparece; na
   tabela Settings a linha `operational_price_notice` está **só de leitura**.
4. **Como `sales.sa`** → `/prices`: aviso no topo · clicar **TBM** → «No prices visible…» ·
   **Export**: sem `Alert`, sem custos, aviso no rodapé · **Print**: aviso na pré-visualização.
5. **Como `finance.test`** → `/prices?branch=SA` → **Export**: coluna `Alert` presente, e
   **vazia** nos `T-1050`/`T-1051`/`T-1052` · filtro **draft** → os três, sem erro, a âmbar.
6. **Como `finance.test`** → `Products` → `T-1050`: `Alert` vazio.
7. **Checklist dos 10 minutos** antes da reunião: `DEMO-SCRIPT.md` §0.
8. Ainda em aberto da execução n.º 5 (`VERIFICATION-PROTOCOL.md`): exports como `logistics.test`,
   branding no `.xlsx`, fluxos de email, dashboard (passo V).

---

## 4. Decisões que são tuas — só as novas desta sessão

1. **Item 80 — o aviso é admin-only na app, não na BD.** A RLS de `settings` deixa `finance`
   escrever qualquer chave; com um pedido directo, um `finance` consegue desligar o aviso. Aceitar
   (risco baixo), ou fechar na BD (migração).
2. **A demo do câmbio** vai **até à rejeição**, não até à aprovação (§2 acima, e o porquê no
   `DEMO-SCRIPT.md` §4). Se quiseres mesmo mostrar um câmbio aprovado, é com a tua conta admin e
   mexe nos preços reais dessa moeda — não recomendo.
3. **Itens 77–79**, pequenos, sem pressa mas antes de haver colegas reais: `/privacy` diz 14 dias
   de registos de acesso e são 90 (77); a guarda de documentos não vê `git rm`/`git mv` (78); a
   coluna `Alert` vazia no `/products/[id]` para quem não lê custos (79).

---

## 4b. Próxima sessão de app — decidido pelo Pedro, 2026-09-24

Uma sessão, com dois assuntos:

1. **Migração 0021**, que junta os itens **75** (nome e categoria na vista de preços), **76**
   (`tmsi.me()`, o que resta do item 74) e **80** (aviso admin-only também na BD). É migração:
   guardas do `PUBLIC` e das `reloptions` (`CLAUDE.md`), impressão digital idêntica, execução do
   protocolo.
2. **Item 81:** os links do menu da página inicial passam a botões com `router.push`, como o
   `<FilterButton>` do `/prices`. É um commit de app só com isto, e a prova é a mesma: `contar-pedidos.sh` com
   `PREFETCH: 0` depois de voltar ao menu e passar o rato pelos links.

Um assunto por commit, e a CI lida entre cada um.

## 5. O que NÃO fazer já

- **Item 71 (`price_cache`)** — só com gatilho: 4 s no «All branches» com host calmo, ou 200
  artigos reais.
- **§4.3 do roadmap** (renome de infra, CPI, EOP) — suspenso até à licença.
- **Desactivar as contas `.test`** — só na fase de produção.

---

## 6. Leituras obrigatórias antes de escrever código

**`CLAUDE.md`** (raiz do repo) — todas as regras nasceram de defeitos reais. As que mais pesaram
nesta sessão: **nenhuma alteração a `app/src` sem ler a CI** (`scripts/ci-log.sh`), **um assunto
por commit**, e **toda a substituição com asserção** — uma parou hoje uma substituição cuja
contagem estava errada (uma substring contida noutra), antes de escrever o ficheiro.
