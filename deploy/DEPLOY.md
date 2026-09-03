# Deployment — atelier24 (VPS) now, company server later

Copyright © 2026 Pedro Alexandre. Proprietary — see LICENSE.

The whole stack is Docker on one host. Three pieces:

1. **Reverse proxy** — already on the VPS (Nginx Proxy Manager). Must be on a docker
   network called `proxy` (`docker network create proxy` if it is not).
2. **Supabase self-hosted** — the official compose from `supabase/supabase/docker`.
3. **This app** — `deploy/docker-compose.yml`.

## 1. DNS

DuckDNS: point `tmisequipment.duckdns.org` at the VPS public IP (fixed IP → set once in
the DuckDNS dashboard; dynamic IP → enable the `duckdns` profile in the compose file).

## 2. Supabase self-hosted

```bash
cd /opt
git clone --depth 1 https://github.com/supabase/supabase
mkdir -p /opt/tmisequipment/deploy/supabase
cp -r supabase/docker/* /opt/tmisequipment/deploy/supabase/
cp supabase/docker/.env.example /opt/tmisequipment/deploy/supabase/.env
cd /opt/tmisequipment/deploy/supabase
```

Edit `.env` — at minimum:

| variable | value |
|---|---|
| `POSTGRES_PASSWORD` | long random |
| `JWT_SECRET` | ≥ 32 random chars |
| `ANON_KEY`, `SERVICE_ROLE_KEY` | generate from `JWT_SECRET` (Supabase docs → "Generate API keys") |
| `DASHBOARD_USERNAME/PASSWORD` | for Studio |
| `SITE_URL` | `https://tmisequipment.duckdns.org` |
| `API_EXTERNAL_URL` | `https://tmisequipment.duckdns.org/supabase` |
| `SUPABASE_PUBLIC_URL` | same as above |
| `ADDITIONAL_REDIRECT_URLS` | `https://tmisequipment.duckdns.org/**` |
| `SMTP_*` | a real mailbox, or auth e-mails will not go out |
| `ENABLE_EMAIL_SIGNUP` | `false` — users are created by the admin, never self-registered |

Then:

```bash
docker compose up -d
docker compose ps        # all healthy
```

Do **not** publish ports 5432 / 8000 / 3000 on the public interface. Only the reverse
proxy is exposed. If the compose file publishes `KONG_HTTP_PORT` on `0.0.0.0`, bind it to
`127.0.0.1` instead. Studio stays reachable only through an SSH tunnel:

```bash
ssh -L 3001:127.0.0.1:3000 atelier24   # then open http://localhost:3001
```

## 3. Schema

```bash
docker exec -i supabase-db psql -U postgres -d postgres \
  < /opt/tmisequipment/supabase/migrations/0001_initial_schema.sql
# fictitious test data (pilot only):
docker exec -i supabase-db psql -U postgres -d postgres \
  < /opt/tmisequipment/supabase/seed/0001_test_data.sql
```

Migrations are numbered and never edited after they are applied; a change is a new file.

## 4. App

```bash
cd /opt/tmisequipment
cp .env.example .env && nano .env
docker compose -f deploy/docker-compose.yml up -d --build
```

## 5. Reverse proxy (Nginx Proxy Manager)

One proxy host, `tmisequipment.duckdns.org`, Let's Encrypt certificate, Force SSL, HTTP/2:

- default → `http://tmsi-app:3000`
- custom location `/supabase/` → `http://supabase-kong:8000/` (note the trailing slashes;
  strips the prefix). Add in *Advanced*:
  ```
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  client_max_body_size 20m;
  ```
- Access list: restrict by IP where possible during the pilot (office / VPN ranges).

## 6. Backups

```bash
# nightly, keep 30 — cron on the VPS
docker exec supabase-db pg_dump -U postgres -Fc postgres \
  > /opt/backups/tmsi-$(date +%F).dump
find /opt/backups -name 'tmsi-*.dump' -mtime +30 -delete
```

Copy the dumps off-box (rclone to the homelab Nextcloud, for instance).

## 7. Moving to the company server

Because nothing is host-specific:

1. `git clone` this repository on the target (or copy the folder — the repo stays private).
2. Repeat §2 with a new `.env`; restore the last dump with `pg_restore` instead of
   re-running migrations if data must be preserved.
3. Change `APP_DOMAIN` / `SITE_URL` / `*_URL` to the company hostname; new certificate.
4. Point the company DNS; decommission the VPS instance and revoke its JWT secret.

The licence in the repository governs the company's use: an explicit written
authorisation from the owner must exist before step 1.
