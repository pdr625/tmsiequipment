-- TMSI Equipment Price Listing
-- Copyright (c) 2026 Pedro Alexandre. All rights reserved. PROPRIETARY — see LICENSE.
--
-- Seed 0001 — FICTITIOUS test data for the pilot. Names, codes, HS codes and prices are
-- invented; they reproduce the cases of the real workbook without using its data.
-- Never load real TMSI prices into a public/pilot environment.

begin;

insert into tmsi.suppliers (id, name, country) values
  ('SUP-FR', 'Atelier Fictif SARL', 'FR'),
  ('SUP-CN', 'Shenzhen Example Co.', 'CN'),
  ('SUP-US', 'Sample Industries Inc.', 'US');

insert into tmsi.hs_codes (code, description) values
  ('842430', 'Steam or sand blasting machines and similar jet projecting machines (fictitious use)'),
  ('841370', 'Centrifugal pumps'),
  ('848180', 'Taps, valves and similar appliances'),
  ('960390', 'Brushes n.e.s.'),
  ('392690', 'Articles of plastics n.e.s.');

insert into tmsi.customs_rates (hs_code, zone, rate)
  select h.code, z.zone, r.rate
    from tmsi.hs_codes h
    cross join (values ('EU'::tmsi.customs_zone), ('CN'), ('US'), ('UK')) z(zone)
    join (values ('842430',0.017),('841370',0.017),('848180',0.022),('960390',0.037),('392690',0.065)) r(code, rate)
      on r.code = h.code;

-- products: every scenario of the spec §5
insert into tmsi.products (id, name, category_id, item_type, parent_id, supplier_id, origin_country,
  currency, exw_price, primary_branch, hs_code, gross_weight_kg, unit, lead_time_days,
  sap_code_sa, sap_code_cn, sap_code_us, sap_code_uk, status, sold_in) values
  -- heavy equipment from China, sold everywhere
  ('T-0001','FoamMaster X1 unit (test)','FOAM_SYS','equipment',null,'SUP-CN','CN','CNY',48000,'TBM','842430',180,'PCS',45,
   'SA-90001','CN-90001','US-90001','UK-90001','active','{SA,TBM,CORP,LTD}'),
  -- light spare part from China
  ('T-0002','Nozzle kit 12 mm (test)','ACCESS','spare_part',null,'SUP-CN','CN','CNY',260,'TBM','848180',0.8,'SET',10,
   'SA-90002','CN-90002','US-90002','UK-90002','active','{SA,TBM,CORP,LTD}'),
  -- French-origin equipment
  ('T-0003','Generator G200 (test)','FOAM_GEN','equipment',null,'SUP-FR','FR','EUR',3200,'SA','842430',65,'PCS',30,
   'SA-90003',null,null,null,'active','{SA,CORP,LTD}'),
  -- pump with a forced margin (override below)
  ('T-0004','Dosing pump P-40 (test)','PUMPS','equipment',null,'SUP-US','US','USD',1450,'CORP','841370',22,'PCS',20,
   'SA-90004',null,'US-90004','UK-90004','active','{SA,CORP,LTD,TBM}'),
  -- brush system with options
  ('T-0005','Brush unit B3 (test)','BRUSH','equipment',null,'SUP-FR','FR','EUR',890,'SA','960390',14,'PCS',15,
   'SA-90005',null,'US-90005','UK-90005','active','{SA,CORP,LTD}'),
  ('T-0006','Option: extended brush head (test)','BRUSH','option','T-0005','SUP-FR','FR','EUR',120,'SA','960390',null,'PCS',15,
   'SA-90006',null,null,null,'active','{SA,CORP,LTD}'),
  ('T-0007','Option: without cover (test)','BRUSH','option','T-0005','SUP-FR','FR','EUR',-35,'SA',null,null,'PCS',15,
   'SA-90007',null,null,null,'active','{SA,CORP,LTD}'),
  -- monthly digital service
  ('T-0008','Remote monitoring subscription (test)','DIGITAL','service',null,'SUP-FR','FR','EUR',49,'SA',null,null,'MONTH',0,
   'SA-90008',null,'US-90008','UK-90008','active','{SA,TBM,CORP,LTD}'),
  -- incomplete draft (no HS, no weight) — must stay draft
  ('T-0009','Prototype mixer M0 (test)','FOAM_SYS','equipment',null,'SUP-FR','FR','EUR',5100,'SA',null,null,null,null,
   null,null,null,null,'draft','{SA}'),
  -- discontinued
  ('T-0010','Legacy hose H1 (test)','ACCESS','spare_part',null,'SUP-FR','FR','EUR',18,'SA','392690',0.5,'PCS',5,
   'SA-90010',null,null,null,'discontinued','{SA}');

-- EXW price change on an active product opens a review (trigger) — T-0003
update tmsi.products set exw_price = 3350 where id = 'T-0003';

-- overrides (principle 4: always with reason)
insert into tmsi.price_overrides (product_id, branch_id, kind, value, reason) values
  ('T-0004','SA','margin',0.42,'Pump line policy — margin fixed by Finance (test)'),
  ('T-0002','CORP','transport',25,'Small parts flat rate (test)'),
  ('T-0001','LTD','coef',1.10,'UK list coefficient (test)');

commit;
