# TMSI Equipment Price Listing

> **Proprietary software — Copyright © 2026 Pedro Alexandre. All rights reserved.**
> Unauthorised use, copying, modification, distribution or execution is strictly
> prohibited. See [LICENSE](LICENSE). This repository must remain **private**.

Multi-subsidiary price-list manager for TMSI / Condat (SA · TBM · Corp · Ltd, plus
agent channels). Replaces the Excel/VBA workbook `TMSI_PriceList_Manager_MultiFilial`
with a multi-user web application: one product catalogue, a per-branch pricing engine
(EUR-based FX, interco fees, transport tiers, customs duty by HS code, margin grids),
role-based access, price history and audit log.

Where things stand: [`docs/ROADMAP.md`](docs/ROADMAP.md) (plan and status) ·
[`docs/STATE.md`](docs/STATE.md) (what was done, with proof) · [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Architecture

```
Browser ──HTTPS──▶ nginx (tmsiequipment.duckdns.org)
                      ├── /          → tmsi-app   (Next.js)
                      ├── /auth/v1/  → GoTrue     (auth, email/password, JWT; rate-limited token endpoint)
                      └── /rest/v1/  → PostgREST  (REST over Postgres + RLS)
                                           └── PostgreSQL 15  ← supabase/migrations/*.sql
```

A reduced Supabase self-hosted stack — three services, no Kong, no Realtime/Storage. Details
and the release cycle: [`deploy/DEPLOY.md`](deploy/DEPLOY.md).

Everything runs in Docker on a single host. The stack is deliberately portable: the
pilot runs on a private VPS ("atelier24"); once validated, the same repository and
compose files are copied to the company server and only the `.env` changes.

## Repository layout

```
LICENSE                  proprietary licence (read it)
NOTICE                   short copyright notice
README.md                this file
.env.example             superseded — points to deploy/supabase/.env.example, the real template
supabase/
  migrations/            ordered SQL migrations — the single source of truth for the schema
  seed/                  fictitious test data only (never real TMSI prices)
deploy/
  docker-compose.yml     app + reverse-proxy wiring; joins the Supabase docker network
  DEPLOY.md              step-by-step for VPS and, later, for the company server
app/                     Next.js app (App Router); built by CI, pulled by digest, never built on the host
scripts/                 smoke suite, CI log reader, request counter, commit-msg hook
docs/                    roadmap, state log, backlog, verification protocol, onboarding
```

## Roles (from the spec, §4)

`admin` · `product_manager` · `finance` · `branch_manager` (scoped to branches) ·
`logistics` · `sales` (branch, active products, no costs) · `agent` (channel, no costs) ·
`viewer`. A user may hold several roles; Row Level Security enforces scope in the
database, not only in the UI.

## Local development

```bash
cp deploy/supabase/.env.example deploy/supabase/.env   # fill in secrets
# 1. Supabase self-hosted stack — see deploy/DEPLOY.md for the real, current architecture
# 2. Apply migrations
psql "$DATABASE_URL" -f supabase/migrations/0001_initial_schema.sql
psql "$DATABASE_URL" -f supabase/seed/0001_test_data.sql   # optional, fictitious data
# 3. App
cd app && npm install && npm run dev
```

## Status

**Real catalogue live** (46 active articles), migrations **0001–0020** in production, smoke suite
green, verification protocol run no. 6. Real colleagues are not onboarded yet — test accounts
only, by decision. Prices are **operational**, pending the customs-duty basis (item 32).

The checklist that used to be here described the project before it was built and was never
updated. The live plan and status are in [`docs/ROADMAP.md`](docs/ROADMAP.md); the evidence for
each step is in [`docs/STATE.md`](docs/STATE.md).

## Author

Pedro Alexandre — pedroalexandre625@gmail.com
