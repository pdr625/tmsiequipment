# HANDOVER — TMSI Equipment Price Listing → deployment on atelier24

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

Este documento transfere o contexto do projecto Claude **"Price list management"** (análise
funcional, licença, schema) para o projecto Claude **"Atelier24"** (infra do VPS), onde a
instalação e operação vão ser feitas. Contém tudo o que a sessão de infra precisa de saber
sem reler o projecto de origem. Actualizar a cada marco.

---

## 1. O que é

Aplicação web multi-utilizador que substitui o Excel/VBA `TMSI_PriceList_Manager_MultiFilial`:
uma lista de preços única para as filiais Condat (SA · TBM · Corp · Ltd) e canais de agentes
(APAC), com motor de preços por filial (câmbio EUR-base, fees interco, transporte por escalão
de peso, direitos aduaneiros por HS, grelhas de margem), acessos por perfil, histórico e audit
log. Interface em inglês. Nome público: **TMSI Equipment Price Listing**.

Repositório: `github.com/pdr625/tmsiequipment` (**privado**, licença proprietária, titular
Pedro Alexandre). URL do piloto: `https://tmsiequipment.duckdns.org`.

## 2. Decisões já tomadas (não reabrir sem motivo)

| Tema | Decisão |
|---|---|
| Onde corre | VPS "atelier24" (mainvpspedro), Docker, reverse proxy Nginx Proxy Manager já existente |
| Base de dados / auth | **Supabase self-hosted** (compose oficial `supabase/supabase/docker`) — Postgres 15 + GoTrue + PostgREST + Kong; schema em `supabase/migrations/` |
| Frontend | Next.js (app router, TypeScript, Tailwind, `@supabase/ssr`), container `tmsi-app`, porta interna 3000 |
| Porque não M365 | Sem direitos de admin: SharePoint/Teams não deixam criar sites, IT recusou; OneDrive pessoal rejeitado (dependência da conta, shadow IT) |
| Dados reais | **Nunca** no piloto. Só o seed fictício `supabase/seed/0001_test_data.sql`. `.gitignore` bloqueia `.xlsx/.xlsm/.csv` |
| Registo de utilizadores | Desactivado (`ENABLE_EMAIL_SIGNUP=false`); o admin cria contas e atribui roles |
| Destino final | Servidor da empresa, depois de validado: `git clone` + novo `.env` + `pg_restore`. A empresa precisa de autorização escrita ao abrigo da licença |

## 3. Estado do código (v0.1, 03/09/2026)

```
LICENSE, NOTICE, docs/COPYRIGHT_HEADER.md   licença proprietária + cabeçalho obrigatório em todos os ficheiros
README.md, .env.example, .gitignore
deploy/docker-compose.yml                   app + duckdns (profile dynamic-ip); redes externas "proxy" e "supabase_default"
deploy/DEPLOY.md                            passo a passo VPS (DNS, Supabase, schema, app, NPM, backups, migração)
supabase/migrations/0001_initial_schema.sql schema completo + motor + RLS (testado em PG16)
supabase/seed/0001_test_data.sql            10 artigos fictícios, todos os cenários
app/README.md                               ecrãs a construir, por ordem — o código Next.js ainda NÃO existe
docs/                                       este ficheiro + índice; copiar para cá os 3 docs de análise do projecto de origem
```

O schema vive no esquema Postgres `tmsi` (não em `public`). Objectos principais:
`branches, channels, currencies, exchange_rates, interco_fees, transport_tiers, hs_codes,
customs_rates, margin_grids, settings, categories, units, suppliers, products,
product_hs_overrides, price_overrides, price_versions, audit_log, profiles, user_roles`;
função `tmsi.compute_price(product, branch, date)` (security definer, auto-limita pelo
perfil do chamador); vistas `tmsi.v_branch_prices` (custos + margens, perfis com custo) e
`tmsi.v_selling_prices` (só preços de venda, sales/agent).

Roles (`tmsi.role_code`): `admin, product_manager, finance, branch_manager (por filial),
logistics, sales (por filial), agent (por canal), viewer`. Um utilizador pode ter vários.

Regras verificadas por teste: activação bloqueada sem HS/peso/código SAP (excepto opções e
serviços); alteração de EXW em artigo activo → estado `review` + nova versão; tudo vai ao
`audit_log`; um `sales` da SA vê só artigos activos da SA, sem custos, mesmo chamando o
motor directamente.

## 4. Estado da infra (a confirmar na primeira sessão em Atelier24)

- [ ] Repo clonado em `/opt/tmsiequipment` (foi extraído em `/tmp` — mover)
- [ ] `chmod 600 ~/.git-credentials` (token GitHub guardado por `credential.helper store`)
- [ ] Subdomínio DuckDNS `tmsiequipment` criado e a apontar para o IP do VPS
- [ ] NPM está na rede Docker `proxy`? (`docker network ls`) — se não, criar ou ajustar o compose
- [ ] Nenhum Supabase já instalado no VPS (evitar colisão de nomes `supabase-*` e da rede `supabase_default`)
- [ ] Portas 5432 / 8000 / 3000 **não** publicadas no IP público
- [ ] Caixa SMTP disponível para os e-mails de auth (reset de password, convites)

## 5. Sequência de trabalho em Atelier24

1. **Infra** — `deploy/DEPLOY.md` §1–§2: DNS, Supabase self-hosted (`.env`: `POSTGRES_PASSWORD`,
   `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `SITE_URL`, `API_EXTERNAL_URL` com `/supabase`,
   `ENABLE_EMAIL_SIGNUP=false`, SMTP). Studio só por túnel SSH.
2. **Schema** — §3: aplicar `0001_initial_schema.sql` e o seed com `docker exec -i supabase-db psql`.
   Verificar: `select count(*) from tmsi.v_branch_prices;` → 30.
3. **Primeiro utilizador** — criar no Studio (Authentication) ou via API com a service key;
   inserir em `tmsi.profiles` e `tmsi.user_roles (role='admin')`.
4. **Proxy** — §5: proxy host `tmsiequipment.duckdns.org`, `/` → `tmsi-app:3000`,
   `/supabase/` → `supabase-kong:8000/`, Let's Encrypt, restrição por IP durante o piloto.
5. **Backups** — §6: `pg_dump` nocturno, cópia para fora do VPS.
6. **Frontend** — scaffold Next.js em `app/` (ver `app/README.md`), Dockerfile, `api/health`;
   depois os ecrãs pela ordem indicada. Cada ficheiro novo leva o cabeçalho de
   `docs/COPYRIGHT_HEADER.md`; o rodapé do login leva o aviso proprietário.
7. **Migração 0002** — políticas de escrita por estado (quem aprova), regra dos 90 dias,
   notificações. Nunca editar `0001` depois de aplicado.

## 6. Regras de qualidade herdadas do Excel

- Zero ambiguidade de referências: nomes claros de tabelas/colunas, um artigo existe uma vez
- Validação rigorosa: constraints + triggers + RLS, sem defeitos silenciosos (HS em falta bloqueia, não assume 5 %)
- Lógica centralizada: câmbios, fees, transporte, direitos e margens definidos num único ponto (tabelas de configuração), nunca duplicados por filial
- Overrides substituem um *input* do motor, nunca o resultado, e levam sempre motivo, autor, data e validade

## 7. Perguntas em aberto (para o Pedro, não para a infra)

- Moeda dos escalões de transporte da TBM (spec T2: "moeda a confirmar")
- Periodicidade e mecanismo de importação das taxas SAP (C2) — manual no piloto
- Quem aprova (Finance central vs Branch Manager) — L2
- Titularidade do código face ao empregador (CPI art. L113-9) — esclarecer por escrito antes da migração para a empresa
