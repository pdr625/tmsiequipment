# Deployment — atelier24 VPS (production today), company server (later, E6)

Copyright © 2026 Pedro Alexandre. Proprietary — see LICENSE.

This document was rewritten from scratch on 2026-09-06 after a disaster-recovery drill
(`docs/DISASTER-DRILL.md`) proved the previous version described an architecture that never
existed here (Nginx Proxy Manager, Kong, `/opt/tmsiequipment`, `docker compose --build`).
Everything below is checked against the real running production, not assumed.

## 0. Topology, as it actually is

- **One VPS, one host, no reverse-proxy container.** `nginx` runs directly on the host
  (`apt`, not Docker), vhost at `/etc/nginx/sites-available/tmsiequipment.conf` (symlinked
  from `sites-enabled/`). It terminates TLS (Let's Encrypt/certbot) and reverse-proxies
  straight to the app and to the individual Supabase pieces — **there is no Kong, no API
  gateway**. `auth` (GoTrue) and `rest` (PostgREST) are reached directly by nginx location
  blocks, not through a gateway.
- **Repo lives at `~/atelier-vps/tmsiequipment`** on the VPS (`pedro@vm7509`), a plain `git
  clone` — not `/opt/tmsiequipment`.
- **The Supabase stack is this repo's own `deploy/supabase/docker-compose.yml`**, not a copy
  of `supabase/supabase/docker`. Services: `db` (Postgres, container `supabase-db`), `auth`
  (GoTrue, container `supabase-auth`), `rest` (PostgREST, container `supabase-rest`),
  `tmsi-app` (this app, container `tmsi-app`). Docker network: `tmsi-supabase_tmsi_net`.
  None of `db`/`auth`/`rest`'s ports are published on a public interface — `tmsi-app` is the
  only one, bound to the docker bridge gateway (`172.20.40.1:3001`), which nginx reverse-
  proxies to.
- **The app image is never built on the VPS.** CI (`.github/workflows/ci.yml`) builds on
  push to `app/**` and pushes to GHCR (`ghcr.io/pdr625/tmsiequipment/tmsi-app`), tagged
  `latest` and `sha-<short>`. The VPS only ever `docker pull`s **by exact digest**, pinned in
  `docker-compose.yml`'s `image:` line — never `:latest` in that file. This VPS has no
  Node/npm toolchain by design (961 MB RAM, 1 vCPU) — building here risks OOM.
- **The GHCR package is private** (since 2026-09-06, item 21/23). The VPS authenticates via
  `docker login ghcr.io` with a classic PAT, `read:packages` scope only — see §8. Without
  this login, `docker compose pull` for `tmsi-app` fails.

## 1. Release cycle (day-to-day deploys)

1. Push a change under `app/**` to `main` → CI builds and pushes the image to GHCR.
2. Wait for CI to go green (no `gh` CLI on this VPS — confirmed manually).
3. Pull the new image and read its digest:
   ```bash
   docker pull ghcr.io/pdr625/tmsiequipment/tmsi-app:latest
   docker inspect --format '{{index .RepoDigests 0}}' ghcr.io/pdr625/tmsiequipment/tmsi-app:latest
   ```
4. Edit `deploy/supabase/docker-compose.yml`'s `tmsi-app.image:` line to the new digest.
5. Resource gates first: `df -h /` (stop if > 90%), `free -h` (stop if RAM+swap available
   < 60 MB).
6. ```bash
   cd deploy/supabase
   docker compose config -q   # validates before touching anything live
   docker compose up -d --no-deps tmsi-app
   ```
7. Wait for `docker inspect --format '{{.State.Health.Status}}' tmsi-app` to report
   `healthy`.
8. **Mandatory gate, not optional:** `python3 scripts/smoke.py` must show its full pass
   count (27/27 as of 2026-09-05) against the live production endpoint. A red smoke suite
   after a deploy is investigated as a real regression before anything else.
9. Commit the digest bump in `docker-compose.yml` and push.

## 2. Environment (`.env`)

The real secrets file is `deploy/supabase/.env` (git-ignored, never committed). Its
**complete** variable list lives in `.env.example` at the repo root — names and purpose
only, never values (see that file). Do **not** trust the pre-2026-09-06 `.env.example` if
you find an old checkout: it described a Kong-based `/supabase`-prefixed URL scheme that was
never actually deployed here.

Runtime env actually reaching each container:
- `db`/`auth`/`rest`: most of the 25 variables in `.env.example`, via `docker-compose.yml`'s
  `${VAR}` interpolation.
- `tmsi-app`: **only `SERVICE_ROLE_KEY`** at runtime (plus `HOSTNAME`/`PORT` literals). It
  needs no other secret at runtime today — see §3 for why that's a real limitation, not a
  simplification.

## 3. Known limitation: the image is pinned to this hostname (item 22, open)

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are `NEXT_PUBLIC_*` — Next.js
inlines them into the compiled bundle **at CI build time**, as literal strings. Confirmed
live in the disaster drill: the server chunk contains the literal
`https://tmsiequipment.duckdns.org` and the anon JWT, baked in — no runtime environment
variable overrides them. (The value is **not** in the client-side bundle: the app only talks
to Supabase server-side, which is exactly why item 22's fix — reading it from a runtime env
var instead — is cheap once done. Not done in this pass; this section is the workaround
until it is.)

**Consequence:** restoring this app on a different hostname, or with newly-generated
secrets (a real disaster, or the eventual move to the company's own server, E6), requires a
**new image build**, not just a new `.env` + restore. Procedure:

1. Edit `.github/workflows/ci.yml`'s hardcoded build-arg:
   ```yaml
   NEXT_PUBLIC_SUPABASE_URL=https://<new-domain>
   ```
   (it is a literal in the file, not a workflow input — must be edited and committed, or at
   minimum changed on the branch CI builds from).
2. Update the `NEXT_PUBLIC_SUPABASE_ANON_KEY` **repository secret** on GitHub to the anon
   JWT for whatever `JWT_SECRET` the new environment uses (generate it the normal Supabase
   way from the new secret — see §5 for where that secret lives after a restore).
3. Push (or `workflow_dispatch` the workflow) to force a rebuild with the corrected values.
4. Deploy that new image by digest as in §1.

Skipping this step is exactly what the disaster drill's Achado 3 caught: the restored data
was correct, but the app kept trying to reach the *old* production Supabase URL until a
fresh image was built.

## 4. Backups

- **On-VPS:** `tmsi-backup.timer` (systemd, `OnCalendar=03:30`) runs `tmsi-backup.service`:
  `pg_dump -U postgres -Fc postgres` inside `supabase-db`, copied out to
  `~/backups/tmsi/tmsi-<date>.dump`, 30-day retention (older dumps deleted by the same unit).
- **Off-site:** the homelab pulls these dumps nightly over the WireGuard tunnel, via a
  dedicated, restricted SSH key (`homelab_to_vps`, `restrict,from="10.13.13.1"`, no
  pty/forwarding) — see the dossier's `CREDENTIALS-INVENTORY.md` 1.15. This VPS never pushes
  the backup anywhere itself; the homelab pulls.
- **RPO, measured, not assumed:** the disaster drill found the dump window matters — a user
  created after 03:30 was genuinely absent from that night's dump. Plan around hours, not
  minutes.

## 5. Restore — the procedure proven correct in the disaster drill

**Do not use `-U postgres`.** In this image, `postgres` is **not** a superuser
(`rolsuper=f`) — the real superuser is `supabase_admin`. Running the restore as `postgres`
produced 441 errors in the drill and left a *plausibly-dismissible*, silently half-restored
database (the error volume looks like normal `pg_restore` noise if you aren't looking for
it).

**Never pass `--no-owner`.** It reassigns the 23 `auth.*` tables to `supabase_admin` instead
of `supabase_auth_admin` — GoTrue starts, fails a privilege check while probing for its own
migrations, concludes it needs to create them, and dies on
`relation "schema_migrations" already exists`. Nothing in that error message points at
ownership as the cause.

**Correct command, `rc=0` in the drill:**
```bash
docker exec -i supabase-db pg_restore -U supabase_admin -d postgres --clean --if-exists < tmsi-<date>.dump
```

Verify afterward: `auth.*` tables owned by `supabase_auth_admin`, `tmsi.*` tables owned by
`postgres`.
```sql
select tableowner, count(*) from pg_tables where schemaname = 'auth' group by 1;
select tableowner, count(*) from pg_tables where schemaname = 'tmsi' group by 1;
```

In a real recovery (restoring into the same running production, not a fresh drill
environment), stop `auth`/`rest`/`tmsi-app` before restoring and start them again after, so
nothing reads the database mid-restore:
```bash
docker compose stop tmsi-app rest auth
# pg_restore as above
docker compose up -d auth rest tmsi-app
```

What the drill proved survives the restore untouched: all 38 RLS policies, every
`SECURITY DEFINER` function, the 0003/0004 cost-column boundary (verified per-role, not
assumed), and `compute_price()` computing correctly — **even restored into a fresh
environment with brand-new `JWT_SECRET`/`POSTGRES_PASSWORD`**, because bcrypt password
hashes don't depend on the JWT secret. GoTrue re-issues tokens against the restored users
with whatever new secret it's given.

What does **not** survive on its own: the app pointing at the right hostname (§3) and the
GHCR pull credential existing anywhere but this one VPS (§8, and the escrow in §6) — without
those two, data survival alone doesn't get the service back up.

## 6. Secrets escrow

Today, `deploy/supabase/.env` and the GHCR pull PAT (§8) exist **only on this VPS**. A real
disaster loses them along with everything else, forcing secrets to be reconstructed by hand
before a restore can even begin.

**Rule, going forward: re-encrypt the escrow every time `.env` changes.** A stale escrow is
worse than none — it produces a confident, wrong reconstruction.

*(This section is completed once the escrow itself exists — see BACKLOG item 21 point 5 and
the corresponding entry in `docs/STATE.md` for the exact file name, cipher, and decryption
steps, added in the same session that created it.)*

## 7. `smoke.py` against a drill or a second environment

`scripts/smoke.py` reads its target and credentials from environment variables, with
production's own current values as defaults — running it with no environment variables set
behaves exactly as it always has. To point it at a different environment (a disaster drill,
a staging copy):

```bash
TMSI_BASE_URL=https://<other-host> TMSI_CREDENTIALS_DIR=/path/to/creds python3 scripts/smoke.py
```

See the script's own header for the exact variable names and defaults.

## 8. GHCR authentication (item 23 — the package is private)

The VPS pulls `ghcr.io/pdr625/tmsiequipment/tmsi-app` (and, on this same host, also
`ghcr.io/pdr625/itinera` — one shared `~/.docker/config.json` entry serves every GHCR pull
this VPS makes) using a classic PAT, `read:packages` scope only, created on the `pdr625`
GitHub account.

```bash
cat <path-to-600-file-with-the-token> | docker login ghcr.io -u pdr625 --password-stdin
```

Never type the token directly on the command line (shell history) and never generate or
echo it from an automated session — it is created and supplied by a human, every time.
`~/.docker/config.json` must stay `chmod 600` (it holds the token, base64-encoded, not
encrypted).

**Recovery implication:** this PAT is itself one of the things that must survive a disaster
independently of the VPS — see §6. Without it somewhere off-VPS, a from-scratch recovery
can restore the data and rebuild the image, but the very last `docker compose pull` fails.
Rotation: alongside the account's other tokens, planned for January (dossier
`CREDENTIALS-INVENTORY.md`).

## 9. Moving to the company server (E6, not started)

Same procedure as §5's restore, on new hardware, plus:

1. `git clone` this repository on the target (private repo — needs a deploy key or PAT with
   read access; the licence requires written authorisation from the owner before this step).
2. New `.env` (§2), new domain in `SITE_URL`/`GOTRUE_URI_ALLOW_LIST`/etc.
3. Rebuild the image for the new hostname (§3) — this step is **not** optional here, unlike
   a same-hostname restore.
4. Point DNS, issue a new certificate, decommission the VPS instance.

Also required before this step, per `docs/ROADMAP.md`'s E6 gate: a first *formal* execution
of `docs/VERIFICATION-PROTOCOL.md` with a signed record, and the CPI (art. L113-9) written
clarification — both pending decisions of the owner, not technical work.
