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
**complete** variable list lives in `deploy/supabase/.env.example` — names and purpose only,
never values (see that file). The root `.env.example` is superseded and just points here; do
**not** trust an old checkout's root `.env.example` if you find one predating 2026-09-06: it
described a Kong-based `/supabase`-prefixed URL scheme that was never actually deployed here.

Runtime env actually reaching each container:
- `db`/`auth`/`rest`: most of the 25 variables in `deploy/supabase/.env.example`, via `docker-compose.yml`'s
  `${VAR}` interpolation.
- `tmsi-app`: **only `SERVICE_ROLE_KEY`** at runtime (plus `HOSTNAME`/`PORT` literals). It
  needs no other secret at runtime today — see §3 for why that's a real limitation, not a
  simplification.

## 3. Hostname/key rotation: a restart, not a rebuild (item 22, fixed 2026-09-06)

Until 2026-09-06, `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` were
`NEXT_PUBLIC_*` build ARGs, inlined into the compiled bundle at CI build time as literal
strings — confirmed live in the disaster drill (the server chunk contained the literal
domain and anon JWT, baked in, no runtime override possible). The fix was cheap precisely
because the disaster drill also confirmed the **value was never in the client-side bundle**
— this app only talks to Supabase server-side.

**Fixed:** both are now plain runtime environment variables, `SUPABASE_URL`/
`SUPABASE_ANON_KEY`, read directly by `app/src/lib/supabase-server.ts` and
`supabase-middleware.ts`. `docker-compose.yml` wires them to `tmsi-app` from the **same**
`SITE_URL`/`ANON_KEY` values GoTrue and PostgREST already use — no new `.env` keys, one
value each, not two kept in sync by hand. `app/src/instrumentation.ts` validates both are
set once at server startup (Next.js's `register()` hook, called before any request is
served) — missing either one fails the container at boot with a clear log line, not a
silently-broken app answering requests.

**Consequence, now that this is fixed:** restoring this app on a different hostname, or
after rotating `JWT_SECRET`/regenerating `ANON_KEY` (a real disaster, item 24's planned
rotation, or the eventual move to the company's own server, E6) is **just a new `.env` +
`docker compose up -d --no-deps tmsi-app`** — the same image serves any hostname or key set.
No CI rebuild, no repository secret to update, no `.github/workflows/ci.yml` edit. This is
exactly what the disaster drill's Achado 3 caught as missing, and what made item 24's
rotation cheap enough to schedule freely instead of needing its own rebuild step.

Proof this class is actually closed, not just moved: `deploy/DEPLOY.md`'s own commit history
and `docs/STATE.md`'s item 22 section carry the grep-for-the-literal-in-the-new-image proof
and the fail-fast proof (a throwaway container from the same image, started with the
variables unset, confirmed to exit rather than come up half-broken).

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

**What it is:** `deploy/supabase/.env` plus the GHCR pull PAT (§8, extracted from
`~/.docker/config.json`'s `ghcr.io` entry), concatenated into one plaintext file, symmetric-
encrypted, then the plaintext shredded. `age -p` was the first choice (restriction-driven)
but isn't installed on this VPS — fell back to `gpg -c` (AES256), so the file is `.gpg`, not
`.age`, honestly reflecting the tool actually used rather than a name that would imply the
wrong format.

```bash
gpg --batch --yes --symmetric --cipher-algo AES256 \
  --passphrase-file <a 600 file with the passphrase, never displayed, shredded right after> \
  --output ~/backups/tmsi/tmsi-secrets-<date>.gpg \
  <plaintext combined file, also shredded right after>
```

Lives at `~/backups/tmsi/tmsi-secrets-<date>.gpg`, next to the dumps — the same nightly
off-site pull (§4) picks it up with no changes needed on either side.

**Known gap, disclosed rather than hidden:** the passphrase was supposed to never touch disk
at all (this section's original design intent); in practice, with no live interactive
terminal available to this session, it had to pass through a `chmod 600` file for `gpg
--passphrase-file` to read — same constraint that already applies to every other real secret
this kind of session handles (see the GHCR PAT in §8). The file was `shred -u -z`'d
immediately after use. `shred`'s guarantees are themselves imperfect on some filesystems/SSDs
— disclosed, not treated as equivalent to "never touched disk."

**Decrypt to verify (never leave the plaintext lying around):**
```bash
umask 077
gpg --output /tmp/tmsi-secrets-check.txt --decrypt ~/backups/tmsi/tmsi-secrets-<date>.gpg
# confirm what you need, then:
shred -u -z /tmp/tmsi-secrets-check.txt
```

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
2. New `.env` (§2), new domain in `SITE_URL`/`GOTRUE_URI_ALLOW_LIST`/etc. — the same GHCR
   image serves the new hostname with no rebuild (§3, fixed 2026-09-06); pull it
   authenticated (§8) and deploy by digest as in §1.
3. Point DNS, issue a new certificate, decommission the VPS instance.

Also required before this step, per `docs/ROADMAP.md`'s E6 gate: a first *formal* execution
of `docs/VERIFICATION-PROTOCOL.md` with a signed record, and the CPI (art. L113-9) written
clarification — both pending decisions of the owner, not technical work.
