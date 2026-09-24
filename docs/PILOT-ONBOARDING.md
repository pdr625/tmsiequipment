# Pilot onboarding — TMSI Equipment Price Listing

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Written against the real state on 2026-09-24:** migrations **0001–0020**, real catalogue
active (**46 articles**), smoke suite green, protocol run no. 6. The exact image digest in
production is not repeated here — it changes with every deploy and a copy here goes stale (the
previous version of this file pinned `8b466fa3…`, nine migrations behind). The current one is in
`deploy/supabase/docker-compose.yml` and at the top of `docs/STATE.md`.

**Pilot status:** real colleagues are **not** onboarded yet — decision of 2026-09-05, still in
force. Until the final deployment, the app is used with the six fictitious `@example.test`
accounts (`docs/TEST-ACCOUNTS.md`). This guide is what a colleague reads, and what the admin
does, **when** that changes.

Part 1 is for the colleague. Part 2 is for the admin.

---

# Part 1 — for the colleague

## Signing in

1. Open **https://tmsiequipment.duckdns.org** and sign in with your work email and the
   temporary password the admin gave you **in person or by phone** (never in writing).
2. The app sends you straight to **Change password**. Choose your own; the temporary one stops
   working from that moment.
3. You land on the home page. It only shows the screens your role can use.

Forgot your password? Ask the admin for a reset — you get a new temporary password the same way.
Email delivery from this system is not guaranteed, so don't wait for an email.

## What each role sees

The boundary is enforced by the **database**, not by hiding buttons: a role without cost access
gets no cost value from any screen, export or direct request.

| Role | Price list shows | Scope | Other screens |
|---|---|---|---|
| `sales` | Min price · Ref price · Lead time | **Own branch**, active articles only | Products, Overrides, Proposals |
| `agent` | Min price · Ref price · Lead time | **Own channel** (today: `APAC`), active only | as `sales` |
| `logistics` | Min price · Ref price · Lead time | All four branches (not channels), **no costs** | Products (HS code, weight, dimensions), Pricing configuration (transport, customs) |
| `branch_manager` | Total cost · Margin · Min · Ref · Alert · Status | **Own branch** | Dashboard, Pricing configuration, Audit log |
| `finance` | Total cost · Margin · Min · Ref · Alert · Status | All branches and channels | Dashboard, Pricing configuration (proposes and approves), Audit log |
| `product_manager` | as `finance` | All | Products (create/edit), Bulk import |
| `viewer` | as `finance`, **read only** | All | Dashboard, Audit log |
| `admin` | everything | All | Users, Branches & channels, Branding |

What the columns mean:

- **Min price / Ref price** — the floor and the reference selling price for that branch or
  channel, in its currency.
- **Margin** — as a percentage of the selling price. **Alert** classifies it against the
  company thresholds: `ok`, `warning`, `critical`. **Services and options are not classified** —
  their margin is zero by design (it lives in the parent article's price), so the cell is empty.
- **Status** — cost roles see `active` by default and can switch to `draft`/`review`/`all`.
  Sales and agents only ever see `active`.

## Export and print

- **Export to Excel** gives you exactly what your screen shows, for the branch you filtered —
  never more. Numbers are real numbers (you can sum and sort). The file says who generated it by
  **name**, never by email, because it may travel outside the company.
- **Print / Save as PDF** prints the same list with the company header.
- The Alert column exists only in the cost roles' file. It never circulates in the sales files.

## The notice at the top of the price list

> ⓘ Prices are operational, pending customs-duty basis confirmation

This is deliberate and stays until the admin removes it. Customs duty per destination zone is
still being confirmed with the customs broker; until then the prices are **operational, not
final**. It also appears in the print view and at the bottom of every Excel export. Don't quote
a price to a customer as final while this notice is showing.

## If something looks wrong

A price that looks off, an article you expected and can't see, a column you think you shouldn't
see, an error message — **tell the admin: Pedro Alexandre, pedroalexandre625@gmail.com.**

Please include: the page (copy the address bar), the branch filter, the article code, and what
you expected. A screenshot helps. **Don't** forward an export to show the problem if it contains
prices — describe it instead.

What you can't break: prices are only changed through **proposals** that someone else approves,
and every change is kept in the audit log with who and when.

## Your data

The **Data processing notice** link on the home page (`/privacy`) says what the app keeps about
you (name, email, role, a hashed password, the audit trail of changes you make), where it runs
(a personal server during this pilot phase, under a personal domain) and what you can ask for.

---

# Part 2 — for the admin

## Before you start

- **A colleague's password is never written in chat, email or any file.** It appears once on
  screen (step 3); pass it on by voice.
- **Real accounts never share the test accounts' password.** The shared password of the six
  `.test` accounts is a decision for fictitious identities only (`docs/TEST-ACCOUNTS.md`).
- Everything happens in the browser, signed in as admin, at **User administration**
  (`/admin/users`).
- Branches: `SA`, `LTD`, `CORP`, `TBM`. Channels: `APAC` (linked to `TBM`).

## Step by step, per colleague

1. **Invite** — enter the colleague's work email, send the invite. The account is created;
   whether the email arrives doesn't matter.
2. **Assign the role** — on the new user's row, pick the role. `sales` and `branch_manager` need
   a **Branch**; `agent` needs a **Channel**. The rest leave both empty.
3. **Reset password** — keep **Generate temporary password** (the default) and confirm. The
   password is **shown once** — "Shown once — copy it now". A page refresh loses it; if that
   happens, repeat this step (a new one is generated, the old one is never stored).
4. **Hand it over** — by voice, together with the address and a pointer to `/privacy`.
5. **First login** — the colleague is forced to change the password before seeing anything.

## Checklist

| Name | Email | Role | Branch / channel | Password handed over | First login confirmed |
|---|---|---|---|---|---|
| | | | | ☐ | ☐ |
| | | | | ☐ | ☐ |
| | | | | ☐ | ☐ |

## If something goes wrong

- **"Email not confirmed" or password refused on first login** — shouldn't happen (fixed before
  the first version of this guide, `email_confirm` on reset). If it does, it's a regression:
  stop and record it, don't work around it outside `/admin/users`.
- **Lost the generated password before handing it over** — repeat step 3.
- **Need to cut someone's access** — **Disable** on the user's row (reversible, **Reactivate**).
  If the ban status can't be read, the page says "Ban status unavailable" rather than assuming
  the account is active.

## The operational-price notice

**Pricing configuration → Operational price notice**, admin only. "Hide notice" removes it from
the price list, the print view and the export footer at once; "Show notice" brings it back.
Remove it only when item 32 (customs-duty basis per zone) is closed.

If the setting is ever deleted, the notice **comes back** — absent means shown, on purpose.

## After onboarding

Collect feedback from each colleague — what confused them, what was missing, what didn't match
what they expected from their role — and record it in `docs/BACKLOG.md`.
