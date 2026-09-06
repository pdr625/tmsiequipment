# TMSI Equipment Price Listing
# Copyright (c) 2026 Pedro Alexandre. All rights reserved.
# PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
# distribution is strictly prohibited. See LICENSE at the repository root.
#
# Multi-stage build. Runs only in CI (GitHub Actions) — never on the VPS.
#
# item 22 (docs/DISASTER-DRILL.md achado 3): SUPABASE_URL/SUPABASE_ANON_KEY
# used to be NEXT_PUBLIC_* build ARGs here, baked into the client bundle at
# build time — but nothing client-side ever consumed them (confirmed by
# grep, this app only talks to Supabase server-side), so build-time
# inlining bought nothing except pinning the image to one hostname/key set.
# They're runtime env now, read by app/src/lib/supabase-server.ts and
# supabase-middleware.ts directly.
#
# Fail-fast lives in this file's own CMD (below), not in
# app/src/instrumentation.ts — tried that first and verified live it
# doesn't actually work for hard process termination here: register()
# executes in some Next.js/Turbopack-internal context where process.exit()
# and even process.kill(process.pid, 'SIGKILL') from *inside* the app have
# no effect on the real container process (confirmed: console.error prints,
# then the server just sits there, connection refused forever, never
# exiting — only an external `docker kill` actually stops it). A plain
# shell guard before `exec`ing into node has none of that ambiguity.

FROM node:24.20.0-alpine AS builder
WORKDIR /app

# package-lock.json (tarefa 3, BACKLOG.md) generated on demand by the
# generate-lockfile.yml workflow (workflow_dispatch, never on the VPS) and
# committed straight to main — npm ci enforces it exactly, unlike npm
# install, which had made every build since E1 non-reproducible.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:24.20.0-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Next.js standalone's server.js defaults to binding "localhost" — without
# this it's unreachable through the container's published port.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER node
EXPOSE 3000
# `exec` replaces this shell with node once the check passes, so node ends
# up as PID 1 for correct signal handling (docker stop/compose down), same
# as the bare `CMD ["node", "server.js"]` this replaces.
CMD ["sh", "-c", "if [ -z \"$SUPABASE_URL\" ] || [ -z \"$SUPABASE_ANON_KEY\" ]; then echo 'Missing required runtime environment variable(s): SUPABASE_URL, SUPABASE_ANON_KEY — see deploy/DEPLOY.md §2.' >&2; exit 1; fi; exec node server.js"]
