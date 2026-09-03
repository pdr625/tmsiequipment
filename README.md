# TMSI Equipment Price Listing

> **Proprietary software — Copyright © 2026 Pedro Alexandre. All rights reserved.**
> Unauthorised use, copying, modification, distribution or execution is strictly
> prohibited. See [LICENSE](LICENSE). This repository must remain **private**.

Multi-subsidiary price-list manager for TMSI / Condat (SA · TBM · Corp · Ltd, plus
agent channels). Replaces the Excel/VBA workbook `TMSI_PriceList_Manager_MultiFilial`
with a multi-user web application: one product catalogue, a per-branch pricing engine
(EUR-based FX, interco fees, transport tiers, customs duty by HS code, margin grids),
role-based access, price history and audit log.

Specification: [`docs/TMSI_PriceManager_Estrutura_v2.md`](docs/TMSI_PriceManager_Estrutura_v2.md).

## Architecture

```
Browser ──HTTPS──▶ reverse proxy (tmsiequipment.duckdns.org)
                      ├── /            → app        (Next.js, container "tmsi-app")
                      └── /supabase/*  → Kong       (Supabase self-hosted gateway)
                                            ├── GoTrue   (auth, email/password, JWT)
                                            ├── PostgREST (REST over Postgres + RLS)
                                            ├── Realtime / Storage (optional)
                                            └── PostgreSQL 15  ← supabase/migrations/*.sql
```

Everything runs in Docker on a single host. The stack is deliberately portable: the
pilot runs on a private VPS ("atelier24"); once validated, the same repository and
compose files are copied to the company server and only the `.env` changes.

## Repository layout

```
LICENSE                  proprietary licence (read it)
NOTICE                   short copyright notice
README.md                this file
.env.example             every variable the stack needs, with safe placeholders
supabase/
  migrations/            ordered SQL migrations — the single source of truth for the schema
  seed/                  fictitious test data only (never real TMSI prices)
deploy/
  docker-compose.yml     app + reverse-proxy wiring; joins the Supabase docker network
  DEPLOY.md              step-by-step for VPS and, later, for the company server
app/                     Next.js frontend (to be scaffolded)
docs/                    functional spec, structure v2, copyright header template
```

## Roles (from the spec, §4)

`admin` · `product_manager` · `finance` · `branch_manager` (scoped to branches) ·
`logistics` · `sales` (branch, active products, no costs) · `agent` (channel, no costs) ·
`viewer`. A user may hold several roles; Row Level Security enforces scope in the
database, not only in the UI.

## Local development

```bash
cp .env.example .env            # fill in secrets
# 1. Supabase self-hosted (official compose) — see deploy/DEPLOY.md
# 2. Apply migrations
psql "$DATABASE_URL" -f supabase/migrations/0001_initial_schema.sql
psql "$DATABASE_URL" -f supabase/seed/0001_test_data.sql   # optional, fictitious data
# 3. App
cd app && npm install && npm run dev
```

## Status

- [x] Phase 1 — Excel/VBA engine (done, archived)
- [x] Functional analysis, error report, structure v2, interactive HTML prototype
- [ ] Phase 2 — web migration (this repo)
  - [x] Licence, repository skeleton, deployment plan
  - [x] Initial schema + RLS helpers + pricing engine (SQL) — `0001_initial_schema.sql`
  - [ ] Seed with fictitious data, verify engine against prototype figures
  - [ ] Auth + role assignment + RLS policies per table
  - [ ] Frontend: price list per branch, product form, config screens, dashboard
  - [ ] Pilot with real users per role on atelier24
- [ ] Phase 3 — 90-day review alerts, e-mail notifications, exports, API

## Author

Pedro Alexandre — pedroalexandre625@gmail.com
