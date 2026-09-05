# nginx vhost — versioned copy

Copyright © 2026 Pedro Alexandre. Proprietary — see LICENSE.

`tmsiequipment.conf` in this directory is a snapshot of the real vhost.

**The operating copy is the VPS's own:**
`/etc/nginx/sites-available/tmsiequipment.conf` (symlinked from `sites-enabled/`).
nginx is never reloaded from this repo copy by any automation — this file exists purely so
the vhost survives a disaster (`docs/DISASTER-DRILL.md` achado 7: before 2026-09-06, this
was configuration that only ever existed on the VPS, nowhere in git).

**Keep this file byte-identical to the real vhost.** If you edit the live one, `diff` it
against this copy and commit the update in the same change — if they ever drift, the VPS's
own file is authoritative, not this one.

Verified before every commit: the vhost contains no secret values — only IPs, ports, paths,
and a public CSP header. Safe to version as-is.

See `deploy/DEPLOY.md` §0 for how this fits into the rest of the deployed topology.
