# TMSI Equipment Price Listing
# Copyright (c) 2026 Pedro Alexandre. All rights reserved.
# PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
# distribution is strictly prohibited. See LICENSE at the repository root.
#
# Multi-stage build. Runs only in CI (GitHub Actions) — never on the VPS.
#
# NEXT_PUBLIC_* handling: Next.js inlines NEXT_PUBLIC_* variables into the
# client-side JS bundle at *build* time — `output: 'standalone'` does not
# make them read at container start. So these have to be build ARGs here,
# not runtime env on the deployed container, or the shipped bundle would
# have empty values baked in. NEXT_PUBLIC_SUPABASE_URL is not sensitive
# (it's the public domain, https://tmsiequipment.duckdns.org) and is passed
# as a literal in the workflow; NEXT_PUBLIC_SUPABASE_ANON_KEY comes from a
# GitHub Actions repository secret referenced by the workflow — the value
# itself never appears in this file or in ci.yml.

FROM node:24.20.0-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

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
