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
# supabase-middleware.ts directly, validated at server startup by
# app/src/instrumentation.ts (fails the container at boot if either is
# missing, rather than shipping a build with an empty value baked in).

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
CMD ["node", "server.js"]
