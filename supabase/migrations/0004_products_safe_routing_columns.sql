-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved.
-- PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
-- distribution is strictly prohibited. See LICENSE at the repository root.
--
-- Migration 0004 — correction to 0003 (applied minutes earlier, same
-- session): primary_branch and sold_in were categorised "operational"
-- (tmsi.can_read_operational() — cost roles + logistics), following the
-- literal complement of tmsi.v_selling_prices. Caught immediately while
-- wiring the app to the new view (0003's own F3 step), before any proof
-- was reported done: /products/[id]'s price-by-branch section derives
-- WHICH branches to call compute_price() for directly from
-- primary_branch/sold_in — gating them broke that section entirely for
-- sales/agent, who are the primary audience for it. Confirmed live: a
-- fresh sales.sa request for tmsi.v_products?id=eq.T-0005 returned
-- primary_branch/sold_in both null.
--
-- These two are routing/structural metadata, not truly sensitive data —
-- unlike hs_code/weight/dimensions (the physical/logistics fields
-- can_read_operational() genuinely exists to protect), "which branches
-- sell this" is not a financial or competitively sensitive fact, and it's
-- not really protected today anyway: products_read's own RLS already
-- conditions ROW visibility on primary_branch/sold_in matching the
-- caller's scope, so a sales/agent role already implicitly knows a
-- product is sold in their branch/channel by virtue of being able to see
-- the row at all. Moving them to the safe (ungated) tier costs nothing
-- real and fixes the regression.
--
-- Never edit 0001/0002/0003 (all already applied). This file is additive.
-- Consequence for numbering: the E4 functional migration (workflow of
-- approval, 90-day rule, notifications) now becomes 0005, not 0004.

begin;

grant select (primary_branch, sold_in) on tmsi.products to authenticated;

-- Same column list/order/types as 0003's create view — CREATE OR REPLACE
-- VIEW requires the existing columns to keep their original position;
-- only the expression producing primary_branch/sold_in changes (from a
-- can_read_operational()-gated CASE to a plain, ungated column), each
-- staying exactly where 0003 put it.
create or replace view tmsi.v_products as
  select
    id, name, category_id, item_type, status, lead_time_days, unit,
    case when tmsi.can_read_operational() then description end as description,
    case when tmsi.can_read_operational() then parent_id end as parent_id,
    case when tmsi.can_read_operational() then origin_country end as origin_country,
    primary_branch,
    case when tmsi.can_read_operational() then hs_code end as hs_code,
    case when tmsi.can_read_operational() then gross_weight_kg end as gross_weight_kg,
    case when tmsi.can_read_operational() then net_weight_kg end as net_weight_kg,
    case when tmsi.can_read_operational() then volume_m3 end as volume_m3,
    case when tmsi.can_read_operational() then dimensions end as dimensions,
    case when tmsi.can_read_operational() then palletizable end as palletizable,
    case when tmsi.can_read_operational() then pallets end as pallets,
    case when tmsi.can_read_operational() then stackable end as stackable,
    sold_in,
    case when tmsi.can_read_costs() then exw_price end as exw_price,
    case when tmsi.can_read_costs() then currency end as currency,
    case when tmsi.can_read_costs() then supplier_id end as supplier_id,
    case when tmsi.can_read_costs() then sap_code_sa end as sap_code_sa,
    case when tmsi.can_read_costs() then sap_code_cn end as sap_code_cn,
    case when tmsi.can_read_costs() then sap_code_us end as sap_code_us,
    case when tmsi.can_read_costs() then sap_code_uk end as sap_code_uk,
    case when tmsi.can_read_costs() then last_reviewed_at end as last_reviewed_at,
    case when tmsi.can_read_costs() then created_at end as created_at,
    case when tmsi.can_read_costs() then updated_at end as updated_at,
    case when tmsi.can_read_costs() then created_by end as created_by,
    case when tmsi.can_read_costs() then updated_by end as updated_by
  from tmsi.products
  where tmsi.products_visible(primary_branch, sold_in, status);

commit;
