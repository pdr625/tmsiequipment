# app/ — Next.js frontend (next step)

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

To be scaffolded with `npx create-next-app@latest . --typescript --app --tailwind` and
`@supabase/ssr`. Screens, in order of delivery:

1. Login (email/password, Supabase Auth) + proprietary notice in the footer
2. Price list per branch — reads `tmsi.v_branch_prices` (cost roles) or `tmsi.v_selling_prices`
   (sales/agent); filters: branch, category, status, currency
3. Product form with lifecycle actions (draft → pending → active ⇄ review → inactive → discontinued)
4. Configuration: exchange rates, interco fees, transport tiers, customs rates, margin grids
5. Overrides with mandatory reason, and price history / audit views
6. Dashboard (admin, finance)

Reference UI: the interactive HTML prototype published in the Claude project.
