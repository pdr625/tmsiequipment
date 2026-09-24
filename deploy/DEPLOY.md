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
- **⚠️ O vhost sozinho não arranca — precisa do ficheiro da zona de rate limit** (item 54,
  corrigido 2026-09-19). `deploy/nginx/tmsiequipment.conf` traz
  `limit_req zone=tmsi_auth burst=5 nodelay` em `location = /auth/v1/token`, mas a zona
  correspondente é declarada no contexto `http`, noutro ficheiro:
  `deploy/nginx/tmsi-rate-limits.conf` → **instalar em `/etc/nginx/conf.d/`**. Sem ele o nginx
  recusa arrancar (`unknown limit_req zone "tmsi_auth"`), e até 2026-09-19 esse ficheiro **não
  estava no repo** — um restauro só a partir do repo deixava o servidor em baixo. Passo de
  instalação, numa restauração de raiz:
  ```bash
  sudo cp deploy/nginx/tmsi-rate-limits.conf /etc/nginx/conf.d/
  sudo cp deploy/nginx/tmsiequipment.conf /etc/nginx/sites-available/
  sudo ln -sf /etc/nginx/sites-available/tmsiequipment.conf /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl reload nginx
  ```
  **Provado a 2026-09-19**, num directório temporário e sem tocar na configuração viva: o mesmo
  `location` sem o ficheiro da zona dá `test failed`; com ele, `test is successful`.
- **Timing instrumentation for `/prices` latency diagnosis (2026-09-23).** O vhost tem
  `access_log /var/log/tmsi/tmsi-timing.log tmsi_timing;`, cujo `log_format` (com
  `$request_time`/`$upstream_response_time`/`$upstream_connect_time`) vive em
  `deploy/nginx/tmsi-timing-format.conf` → **instalar em `/etc/nginx/conf.d/`**. Sem ele o
  nginx recusa arrancar (mesmo mecanismo do item 54 acima: zona/format referenciados antes de
  declarados). O ficheiro fica em `/var/log/tmsi/`, não em `/var/log/nginx/`, **de propósito**:
  o `/etc/logrotate.d/nginx` do sistema (`/var/log/nginx/*.log`, `create 0640 www-data adm`)
  apanharia o ficheiro pelo glob mas reporia o grupo para `adm` a cada rotação diária,
  desfazendo em silêncio o acesso de leitura do `pedro` sem precisar de estar no grupo `adm`
  (que também dá leitura aos outros 7 vhosts do host). Um directório próprio com um stanza de
  logrotate próprio (`deploy/logrotate/tmsi-timing`) evita as duas coisas. Passos de
  instalação, numa restauração de raiz:
  ```bash
  sudo cp deploy/nginx/tmsi-timing-format.conf /etc/nginx/conf.d/
  sudo mkdir -p /var/log/tmsi
  sudo chown root:pedro /var/log/tmsi
  sudo chmod 750 /var/log/tmsi
  sudo install -o www-data -g pedro -m 640 /dev/null /var/log/tmsi/tmsi-timing.log
  sudo cp deploy/logrotate/tmsi-timing /etc/logrotate.d/tmsi-timing
  sudo nginx -t && sudo systemctl reload nginx
  ```
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
  `docker login ghcr.io` with a classic PAT, `read:packages` scope only — see §9. Without
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
- `tmsi-app`: `SERVICE_ROLE_KEY` and, since item 18, `STATS_INTERNAL_TOKEN` (a narrow bearer
  token gating `GET /api/fx-age`, the only other secret it needs — see `docs/BACKLOG.md` item
  18 and `app/src/app/api/fx-age/route.ts`'s own comment for why it's a separate value, never
  `SERVICE_ROLE_KEY` reused) at runtime, plus `HOSTNAME`/`PORT` literals and the non-sensitive
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` (item 22, §3 below) — see §3 for why the app needing so
  little at runtime is a real design property, not a simplification.

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
value each, not two kept in sync by hand.

The fail-fast check lives in `app/Dockerfile`'s own `CMD` (a plain `sh -c` guard before
`exec node server.js`), not in a Next.js `instrumentation.ts`. That was tried first and
verified live not to work here: `register()` runs in some Next.js/Turbopack-internal context
where even `process.kill(process.pid, 'SIGKILL')` called from inside the app has no effect on
the real container process — the error logs correctly, then the server just sits there,
connection refused forever, never actually exiting (only an external `docker kill` stops it).
A shell check before the process even starts has none of that ambiguity: missing either
variable prints a clear line to stderr and the container exits non-zero immediately,
verified live.

**Consequence, now that this is fixed:** restoring this app on a different hostname, or
rotating `JWT_SECRET`/regenerating `ANON_KEY` (a real disaster, or the eventual move to the
company's own server, E6) is **just a new `.env` + `docker compose up -d --no-deps
tmsi-app`** — the same image serves any hostname or key set. No CI rebuild, no repository
secret to update, no `.github/workflows/ci.yml` edit. This is exactly what the disaster
drill's Achado 3 caught as missing, and what made item 24's rotation (2026-09-06, the very
same day — see §7) cheap enough to do immediately instead of needing its own rebuild step.

Proof this class is actually closed, not just moved: `deploy/DEPLOY.md`'s own commit history
and `docs/STATE.md`'s item 22 section carry the grep-for-the-literal-in-the-new-image proof
and the fail-fast proof (a throwaway container from the same image, started with the
variables unset, confirmed to exit rather than come up half-broken).

## 4. Backups

**Cadence (item 43, 2026-09-16): two modes, one gesture to switch, never edit a unit by
hand.** Retention is counted in **copies**, not days — a day-based cutoff quietly changes
depth every time the cadence changes; a copy count doesn't.

- **`tmsi-backup-weekly.timer`/`.service`** — the permanent regime. `OnCalendar=Mon *-*-*
  03:30:00`. Writes `~/backups/tmsi/tmsi-<date>-weekly.dump`, then rotates to keep the **8**
  most recent (`ls -t ... | tail -n +9 | xargs -r rm -f` on that exact glob — never touches
  `-window.dump` files). ~2 months of weekly history.
- **`tmsi-backup-window.timer`/`.service`** — the loading-window regime, daily
  (`OnCalendar=*-*-* 03:30:00`). Writes `~/backups/tmsi/tmsi-<date>-window.dump`. **No
  rotation at all** — every window dump is kept for the whole window; disk cost is trivial
  (measured 2026-09-16: 29 GB total, 56% used, ~373 KB/dump average — even 100 window dumps
  is under 40 MB).
- **Exactly one of the two timers is enabled at any time.** To switch (either direction, no
  unit editing):
  ```bash
  sudo systemctl disable --now tmsi-backup-<current-mode>.timer
  sudo systemctl enable --now tmsi-backup-<new-mode>.timer
  ```
  Confirm with `systemctl list-timers tmsi-backup-*` — the `NEXT` column changes cadence
  immediately (weekly → next Monday 03:30; window → tomorrow 03:30).
- **Exit condition, written down so this doesn't stay in window mode by inertia:** switch
  back to `tmsi-backup-weekly.timer` once the real catalog (item 39's importer) has been
  loaded **and verified** — not merely loaded. Until then, stay in window mode.
  **State as of 2026-09-19 (updated; the 2026-09-16 line below was stale within hours):** window
  mode, **real catalog loaded** — 49 articles `T-1001`–`T-1052`, 485 overrides, batch
  `ee1db00c-…` on 16/09 19:53 (`docs/BACKLOG.md` item 51) — and **parity-verified** against the
  source spreadsheet on 19/09: all 245 lines compared, zero unexplained (`docs/ENGINE-PARITY.md`
  §9). The remaining half of "verified" is **operational, not arithmetic**: every one of the 49
  is still `status='draft'`, so no sales-facing role can see a price yet. Deciding when this
  flips back to weekly is the Pedro's call and the gesture is the one documented above — this
  file just stops claiming the catalog isn't loaded.
  ~~State as of 2026-09-16: window mode, real catalog not yet loaded.~~
- **Filenames are date-first, tag-last on purpose** (`tmsi-<date>-weekly.dump` /
  `tmsi-<date>-window.dump`, never `tmsi-weekly-<date>.dump`) — a plain alphabetical sort of
  `~/backups/tmsi/*.dump` still sorts chronologically regardless of which mode produced which
  file. This matters off-site (below): a prefix-first scheme (`weekly` sorts before `window`
  alphabetically, unrelated to actual dates) would have made a "pick the most recent dump by
  filename" step pick the wrong file across a mode switch.
- **Pre-existing dumps not migrated:** the 14 dumps from the old single-timer scheme
  (`tmsi-2026-09-03.dump` … `tmsi-2026-09-16.dump`) and the ad-hoc `tmsi-pre-<migration>-*`
  dumps from past sessions are left exactly where they are — real, valid backups, just no
  longer auto-rotated by anything (the unit that rotated them was retired). Harmless at this
  scale (a few MB); a manual cleanup is optional, never automatic.
- **⚠️ Off-site coordination needed, not done here (out of scope — VPS session, never the
  homelab):** the homelab's `tmsi-offsite-pull.sh` origin glob is `vps:.../tmsi/*.dump` — it
  still picks up every dump regardless of the new naming, nothing is silently skipped. But
  its "verify the most recent dump" step may assume filename-sort-equals-date-sort (true for
  the old naming, and still true for the new one — see above) — if that script instead
  tracks a specific expected filename pattern rather than "latest by sort", it needs a
  matching update on the homelab side. Flagged in the dossier CHANGELOG for a homelab
  session to check; not fixed from here.
- **On-VPS today:** `tmsi-backup-window.service`/`.timer`, `pg_dump -U postgres -Fc postgres`
  inside `supabase-db`, copied out with `600` permissions (item 48), directory `~/backups/tmsi/`
  at `700`.
- **Off-site:** the homelab pulls these dumps nightly over the WireGuard tunnel, via a
  dedicated, restricted SSH key (`homelab_to_vps`, `restrict,from="10.13.13.1"`, no
  pty/forwarding) — see the dossier's `CREDENTIALS-INVENTORY.md` 1.15. This VPS never pushes
  the backup anywhere itself; the homelab pulls. **Third leg (a second off-site copy) stays
  suspended** — `docs/BACKLOG.md` item 13, the Pedro's own 2026-09-06 decision, not resolved
  by this item.
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
GHCR pull credential existing anywhere but this one VPS (§9, and the escrow in §6) — without
those two, data survival alone doesn't get the service back up.

## 5a. Passo obrigatório num clone novo: activar os hooks

```bash
git config core.hooksPath scripts/hooks
```

**Uma linha, uma vez por clone — e sem ela a guarda não existe.** O `core.hooksPath` é
configuração **local**, não viaja no repositório: um clone novo tem o `scripts/hooks/commit-msg`
versionado no disco mas **inerte**.

O que ele guarda: recusa um commit que faça um ficheiro de `docs/` perder mais de 50% das linhas
sem a palavra `rewrite` na mensagem — nasceu de 105 linhas apagadas por um `cat >` num ficheiro
que se julgava novo (2026-09-23). O bloco `GG` do `scripts/smoke.py` falha se este passo não
tiver sido dado, o que torna o esquecimento visível em vez de silencioso.

## 5b. Ficheiros do host a recuperar em qualquer restauro (não são segredos)

Além dos segredos (§6), há ficheiros **fora deste repo** sem os quais um host reconstruído fica
funcional mas cego às regras com que foi operado. Recuperá-los não é urgente para pôr o serviço
de pé — é urgente para não repetir os erros que essas regras registam.

| Ficheiro | Onde vive | Cópia | Porquê |
|---|---|---|---|
| `~/atelier-vps/CLAUDE.md` | **só no disco do host** | `dossier/audits/2026-09-20-vps-claude-md.md` (fotografia datada) | Regras operacionais do agente neste VPS: disciplina de segredos (três incidentes reais registados, com o mecanismo de cada um), invariantes de rede e de Docker, sudo sem TTY, metodologia de sessão. Um host novo sem isto não sabe, por exemplo, que `127.0.0.1` nunca é destino de proxy aqui, nem porque é que um ficheiro de credenciais só se inspecciona por `wc`/`stat`. |
| `/etc/nginx/conf.d/tmsi-rate-limits.conf` | host | `deploy/nginx/tmsi-rate-limits.conf` (versionado desde 2026-09-20) | O vhost referencia a zona `tmsi_auth`; sem este ficheiro o nginx **recusa arrancar** (item 54) |
| `/etc/nginx/conf.d/tmsi-timing-format.conf` | host | `deploy/nginx/tmsi-timing-format.conf` (versionado desde 2026-09-23) | O vhost referencia o `log_format tmsi_timing`; sem este ficheiro o nginx recusa arrancar |
| `/etc/logrotate.d/tmsi-timing` + `/var/log/tmsi/` (dir `root:pedro 750`) | host | `deploy/logrotate/tmsi-timing` (versionado desde 2026-09-23) | Sem o stanza próprio, o `tmsi-timing.log` fica sem rotação (cresce sem limite) e, se for movido para `/var/log/nginx/`, o stanza do sistema repõe o grupo `adm` a cada rotação e tira o acesso de leitura ao `pedro` |

**O `CLAUDE.md` não está na raiz do dossier por desenho**, não por esquecimento: o
`dossier-push.sh` tem lista branca (`VPS.md`, `audits/*-vps*.md`, appends ao `CHANGELOG.md`) e
este host não a contorna. Daí a fotografia em `audits/`. **É fotografia, não original** — em
conflito, manda o ficheiro no host; e quem o alterar empurra cópia nova datada antes de fechar a
sessão. Alargar a lista branca para aceitar o ficheiro a sério é **decisão em aberto**, para uma
sessão do projecto do VPS.

## 6. Secrets escrow

Today, `deploy/supabase/.env` and the GHCR pull PAT (§9) exist **only on this VPS**. A real
disaster loses them along with everything else, forcing secrets to be reconstructed by hand
before a restore can even begin.

**Rule, going forward: re-encrypt the escrow every time `.env` changes.** A stale escrow is
worse than none — it produces a confident, wrong reconstruction.

**What it is:** `deploy/supabase/.env` plus the GHCR pull PAT (§9, extracted from
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
this kind of session handles (see the GHCR PAT in §9). The file was `shred -u -z`'d
immediately after use. `shred`'s guarantees are themselves imperfect on some filesystems/SSDs
— disclosed, not treated as equivalent to "never touched disk."

**Decrypt to verify (never leave the plaintext lying around):**
```bash
umask 077
gpg --output /tmp/tmsi-secrets-check.txt --decrypt ~/backups/tmsi/tmsi-secrets-<date>.gpg
# confirm what you need, then:
shred -u -z /tmp/tmsi-secrets-check.txt
```

## 7. Rotating secrets (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`)

Proven end to end 2026-09-06 (item 24, closing a real exposure incident). Cheap since item 22
(§3) — a restart, not a rebuild.

**Before touching anything:** timestamped `.env` copy (600, outside git) + a fresh `pg_dump`,
verified readable (`pg_restore -l`). Keep both until every proof below passes; only then
`shred -u -z` the `.env` copy (the dump isn't itself a secret — it holds application data,
not these four values — safe to keep as an extra backup).

**`POSTGRES_PASSWORD` is not one role.** This stack's `docker-compose.yml` wires it into
three places: the `db` service's own init, GoTrue's connection string
(`postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@db/...`), and PostgREST's
(`postgres://authenticator:${POSTGRES_PASSWORD}@db/...`). Rotating it means updating **all
three roles** — `postgres`, `supabase_auth_admin`, `authenticator` — not just one. (`SELECT
rolname FROM pg_authid WHERE rolpassword IS NOT NULL` also lists `pgbouncer` and
`supabase_admin` — neither is referenced by this compose file's connection strings;
`pgbouncer` isn't even a service here, and `supabase_admin` is only reached locally via
`docker exec`, which is `trust`-authenticated per `pg_hba.conf`. Leave both alone unless you
have a specific reason tied to them, not this rotation.)

**`ANON_KEY`/`SERVICE_ROLE_KEY` regeneration:** these are HS256 JWTs signed with
`JWT_SECRET`. Decode the *payload* of the current ones first (never the signature, never
print the full token) to see the exact `iss`/`iat`/`exp` claims in use, then construct new
tokens with the **same claims**, signed with the new secret — only the signature changes,
plus `role` (already `anon`/`service_role`, unchanged). Plain Python stdlib
(`hmac`/`hashlib`/`base64`) is enough; no dependency needed.

**Order that actually works** — verified live, including the mistake to avoid:
1. `ALTER ROLE ... PASSWORD '...'` for all three roles above, connected as `supabase_admin`
   — **not** `postgres`. Same lesson as the restore procedure (§5): `postgres` isn't a
   superuser in this image and cannot alter privileged roles (`permission denied to alter
   role`, confirmed live). Existing connections survive this; only new connections use the
   new password, so nothing drops yet.
2. Update all four values in `deploy/supabase/.env`.
3. Restart in this order, `-t 60`, **not** `db`: `docker compose up -d --no-deps -t 60 auth`,
   then `rest`, then `tmsi-app`. Confirm each is healthy *by function* before moving to the
   next (GoTrue's own `/health`, PostgREST answering its root, `/login` serving 200) — a
   green container status alone doesn't confirm the new password actually works.

**Prove the branch that matters: the old values are dead, not just that the new ones work.**
The old `ANON_KEY`/`SERVICE_ROLE_KEY` against PostgREST/GoTrue should now get `401`/`403`. If
no real pre-rotation session token was captured to test directly, sign a throwaway
session-shaped JWT (`sub`/`role: authenticated`/a future `exp`) with the **old** `JWT_SECRET`
(read only from the rollback `.env` copy, inline, never echoed) and confirm PostgREST rejects
it (`PGRST301`, "No suitable key or wrong...") — this proves the whole class of tokens signed
with the retired secret is dead, not just the two specific keys.

**Then prove the new values are alive:** `scripts/smoke.py` full pass count — this doubles as
proof that user passwords survived (they're bcrypt hashes, independent of `JWT_SECRET`; a
disaster-drill restore with brand-new secrets already established this, and a rotation on the
live system is the same fact from the other direction).

**Re-encrypt the escrow (§6) with the new values before closing** — this was already the
rule there; a rotation is exactly the moment it matters. Delete the old escrow file with
`shred -u -z` only after the new one's decryption has been verified.

**A permissions gotcha, worth knowing before it surprises you:** files created via a plain
shell redirect (`cat > file`, or a tool's own file-write step) don't reliably inherit a
`umask 077` set in an earlier, separate command — shell state doesn't always carry across
independent invocations the way you'd expect from one continuous terminal session. Don't
assume 600; check with `ls -l` and `chmod 600` explicitly right after creating any secret
file, every time.

## 8. `smoke.py` against a drill or a second environment

`scripts/smoke.py` reads its target and credentials from environment variables, with
production's own current values as defaults — running it with no environment variables set
behaves exactly as it always has. To point it at a different environment (a disaster drill,
a staging copy):

```bash
TMSI_BASE_URL=https://<other-host> TMSI_CREDENTIALS_DIR=/path/to/creds python3 scripts/smoke.py
```

See the script's own header for the exact variable names and defaults.

## 9. GHCR authentication (item 23 — the package is private)

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

## 9b. Ler a CI sem browser (PAT de Actions, 2026-09-24)

**Porquê existe:** a 2026-09-23 três revisões seguidas falharam no `npm run build` e não houve
forma de saber porquê a partir do VPS — não há `gh` instalado, o PAT do §9 tem só
`read:packages`, e não há Node aqui para compilar. Três palpites, três ciclos de CI desperdiçados.

**O token.** PAT **fine-grained**, âmbito **apenas `pdr625/tmsiequipment`**, permissão única
**`Actions: Read-only`**. Não é o token do §9 e não o substitui: aquele faz `pull` de imagens,
este lê logs. Dois âmbitos separados, de propósito.

```bash
read -rsp 'PAT: ' P && printf '%s' "$P" > ~/tmp/tmsi-sudo/github-actions-read.txt && unset P
chmod 600 ~/tmp/tmsi-sudo/github-actions-read.txt
```

Sem newline final, `600`, ao lado dos outros segredos de teste. **Inspeccionar só por `wc -c`,
`wc -l` e `stat`** — nunca `cat`/`head`/`tail`/`od`, nem parciais (regra do
`~/atelier-vps/CLAUDE.md`, três recidivas).

**Escrow (§6): este token entra no `tmsi-secrets-<data>.gpg`**, junto do `.env` e do PAT do GHCR,
**e o escrow é re-cifrado quando ele nascer ou rodar** — a mesma regra que já vale para o `.env`.
Sem isso, uma recuperação de raiz fica outra vez cega à CI, que é precisamente o momento em que
mais se precisa dela.

**Uso:**

```bash
scripts/ci-log.sh              # o HEAD actual
scripts/ci-log.sh 21bfa2f      # um sha
scripts/ci-log.sh 21bfa2f --tudo
```

Devolve o passo que falhou e as linhas com `Type error` / `error TS####` / `Failed to compile`.
Nunca imprime o token nem o cabeçalho de autorização.

**Rotação:** junto dos outros tokens da conta, no inventário do dossier
(`CREDENTIALS-INVENTORY.md`).

## 10. Moving to the company server (E6, not started)

Same procedure as §5's restore, on new hardware, plus:

1. `git clone` this repository on the target (private repo — needs a deploy key or PAT with
   read access; the licence requires written authorisation from the owner before this step).
2. New `.env` (§2), new domain in `SITE_URL`/`GOTRUE_URI_ALLOW_LIST`/etc. — the same GHCR
   image serves the new hostname with no rebuild (§3, fixed 2026-09-06); pull it
   authenticated (§9) and deploy by digest as in §1.
3. Point DNS, issue a new certificate, decommission the VPS instance.

Also required before this step, per `docs/ROADMAP.md`'s E6 gate: a first *formal* execution
of `docs/VERIFICATION-PROTOCOL.md` with a signed record, and the CPI (art. L113-9) written
clarification — both pending decisions of the owner, not technical work.
