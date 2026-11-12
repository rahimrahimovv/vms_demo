-- Demo seed (synthetic data only, backlog "Demo Scenario Data"). Safe to run more than once.
-- Users are created by scripts/seed-users.ts (Auth needs the admin API); it also links the
-- Vendor B and Vendor C logins to the vendors below.

insert into public.company (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Demo Agro LLC')
on conflict (id) do update set name = excluded.name;

insert into public.setting (company_id, key, value) values
  ('00000000-0000-4000-8000-000000000001', 'tender_threshold',     '50000.00'),
  ('00000000-0000-4000-8000-000000000001', 'rfq_bands',            '[{"up_to": 5000.00, "min_proposals": 1}, {"up_to": 15000.00, "min_proposals": 2}, {"up_to": null, "min_proposals": 3}]'),
  ('00000000-0000-4000-8000-000000000001', 'max_extensions',       '2'),
  ('00000000-0000-4000-8000-000000000001', 'qualification_months', '12'),
  ('00000000-0000-4000-8000-000000000001', 'grade_bands',          '{"A": 85.0, "B": 70.0, "C": 50.0}'),
  ('00000000-0000-4000-8000-000000000001', 'd_block_months',       '6'),
  ('00000000-0000-4000-8000-000000000001', 'single_source_limit',  '1000.00'),
  ('00000000-0000-4000-8000-000000000001', 'rfq_days',             '3'),
  ('00000000-0000-4000-8000-000000000001', 'tender_days',          '14'),
  ('00000000-0000-4000-8000-000000000001', 'final_offer_days',     '2'),
  ('00000000-0000-4000-8000-000000000001', 'final_offer_rounds',   '1')
on conflict (company_id, key) do nothing;

-- Committee voting period (CMT-01); members come with Slice 5.
insert into public.committee (company_id, voting_period_days)
values ('00000000-0000-4000-8000-000000000001', 3)
on conflict (company_id) do nothing;

------------------------------------------------------------------
-- Dictionaries (MDM-01)
------------------------------------------------------------------
insert into public.incoterm (code, name) values
  ('EXW', 'Ex Works'), ('FCA', 'Free Carrier'), ('CPT', 'Carriage Paid To'),
  ('CIP', 'Carriage and Insurance Paid To'), ('DAP', 'Delivered at Place'),
  ('DPU', 'Delivered at Place Unloaded'), ('DDP', 'Delivered Duty Paid'),
  ('FAS', 'Free Alongside Ship'), ('FOB', 'Free on Board'), ('CFR', 'Cost and Freight'),
  ('CIF', 'Cost, Insurance and Freight')
on conflict (code) do nothing;

insert into public.payment_term (id, company_id, name, advance_percent, days_after_delivery) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', '100% prepayment', 100, 0),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', '50% advance, 50% after delivery', 50, 0),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', '30 days after delivery', 0, 30),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000001', '60 days after delivery', 0, 60)
on conflict (id) do nothing;

insert into public.delivery_place (id, company_id, name, type, address) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', 'Central warehouse', 'WAREHOUSE', 'Demo industrial zone 1, Baku'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', 'North warehouse', 'WAREHOUSE', 'Demo industrial zone 2, Sumgait'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001', 'Baku port', 'PORT', 'Port of Baku, Alat')
on conflict (id) do nothing;

insert into public.delivery_mode (id, company_id, name) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', 'Single delivery'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', 'Partial deliveries allowed'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000001', 'Per delivery schedule')
on conflict (id) do nothing;

-- Currencies (MDM-01 AC4); the migration inserts the same rows, this keeps the seed complete.
insert into public.currency (code, name) values
  ('AZN', 'Azerbaijani manat'), ('USD', 'US dollar'), ('EUR', 'Euro'), ('TRY', 'Turkish lira'),
  ('RUB', 'Russian rouble'), ('GBP', 'Pound sterling'), ('CNY', 'Chinese yuan')
on conflict (code) do nothing;

------------------------------------------------------------------
-- Category tree (MDM-02). Licence proof on Fertilisers covers its children.
------------------------------------------------------------------
insert into public.category (id, company_id, parent_id, name, licence_required) values
  ('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000001', null, 'Agricultural inputs', false),
  ('00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000001', null, 'Operations', false)
on conflict (id) do nothing;
insert into public.category (id, company_id, parent_id, name, licence_required) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000100', 'Fertilisers', true),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000100', 'Seeds', false),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000100', 'Plant protection', false),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000100', 'Irrigation systems', false),
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000110', 'Spare parts', false),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000110', 'Office supplies', false)
on conflict (id) do nothing;
insert into public.category (id, company_id, parent_id, name, licence_required) values
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Mineral fertilisers', false),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Foliar fertilisers', false)
on conflict (id) do nothing;

------------------------------------------------------------------
-- Item catalogue (MDM-02 AC4): 25 items in Fertilisers (under Mineral and Foliar fertilisers),
-- Seeds, Plant protection, Spare parts and Office supplies, plus 3 under Irrigation systems.
------------------------------------------------------------------
insert into public.item (id, company_id, category_id, code, name, unit) values
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000105', 'FRT-001', 'Ammonium nitrate 34.4%, 50 kg bag', 'bag'),
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000105', 'FRT-002', 'Urea 46%, 50 kg bag', 'bag'),
  ('00000000-0000-4000-8000-000000000703', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000105', 'FRT-003', 'NPK 15-15-15, 50 kg bag', 'bag'),
  ('00000000-0000-4000-8000-000000000704', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000106', 'FRT-004', 'Foliar fertiliser, 1 L', 'litre'),
  ('00000000-0000-4000-8000-000000000705', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000106', 'FRT-005', 'Micronutrient mix, 5 L can', 'can'),
  ('00000000-0000-4000-8000-000000000706', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'SED-001', 'Winter wheat seed, 25 kg bag', 'bag'),
  ('00000000-0000-4000-8000-000000000707', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'SED-002', 'Barley seed, 25 kg bag', 'bag'),
  ('00000000-0000-4000-8000-000000000708', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'SED-003', 'Hybrid maize seed, 80,000 seeds', 'pack'),
  ('00000000-0000-4000-8000-000000000709', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'SED-004', 'Sunflower seed, 150,000 seeds', 'pack'),
  ('00000000-0000-4000-8000-000000000710', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'SED-005', 'Alfalfa seed, 10 kg bag', 'bag'),
  ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'PPR-001', 'Herbicide concentrate, 5 L can', 'can'),
  ('00000000-0000-4000-8000-000000000712', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'PPR-002', 'Fungicide, 1 L', 'litre'),
  ('00000000-0000-4000-8000-000000000713', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'PPR-003', 'Insecticide, 1 L', 'litre'),
  ('00000000-0000-4000-8000-000000000714', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'PPR-004', 'Seed treatment, 5 L can', 'can'),
  ('00000000-0000-4000-8000-000000000715', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'PPR-005', 'Knapsack sprayer, 16 L', 'piece'),
  ('00000000-0000-4000-8000-000000000716', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000111', 'SPR-001', 'Tractor oil filter', 'piece'),
  ('00000000-0000-4000-8000-000000000717', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000111', 'SPR-002', 'Tractor air filter', 'piece'),
  ('00000000-0000-4000-8000-000000000718', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000111', 'SPR-003', 'V-belt, B-section', 'piece'),
  ('00000000-0000-4000-8000-000000000719', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000111', 'SPR-004', 'Hydraulic hose, 1 m', 'piece'),
  ('00000000-0000-4000-8000-000000000720', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000111', 'SPR-005', 'Plough share', 'piece'),
  ('00000000-0000-4000-8000-000000000721', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000112', 'OFC-001', 'A4 copy paper, 500 sheets', 'ream'),
  ('00000000-0000-4000-8000-000000000722', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000112', 'OFC-002', 'Ballpoint pens, box of 50', 'box'),
  ('00000000-0000-4000-8000-000000000723', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000112', 'OFC-003', 'Lever arch file', 'piece'),
  ('00000000-0000-4000-8000-000000000724', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000112', 'OFC-004', 'Laser toner cartridge', 'piece'),
  ('00000000-0000-4000-8000-000000000725', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000112', 'OFC-005', 'Sticky notes, pack of 12', 'pack'),
  ('00000000-0000-4000-8000-000000000726', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000104', 'IRR-001', 'Drip line, 16 mm, 500 m roll', 'roll'),
  ('00000000-0000-4000-8000-000000000727', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000104', 'IRR-002', 'Sprinkler head, impact type', 'piece'),
  ('00000000-0000-4000-8000-000000000728', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000104', 'IRR-003', 'Disc filter, 2 inch', 'piece')
on conflict (id) do nothing;

------------------------------------------------------------------
-- Plan (PLN-01): the line every demo PR uses
------------------------------------------------------------------
insert into public.plan_line (id, company_id, year, category_id, description, planned_amount, quarter) values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000001', 2026,
   '00000000-0000-4000-8000-000000000101', 'Spring fertiliser programme', 500000.00, 'Q1')
on conflict (id) do nothing;

------------------------------------------------------------------
-- Qualification questionnaire (REG-05): 10 synthetic questions, weights add up to 20
------------------------------------------------------------------
insert into public.questionnaire_question (id, company_id, section, text, answer_type, weight, evidence_required, sort_order) values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000001', 'General', 'How many years has your company supplied goods of this kind?', 'SINGLE_CHOICE', 3, false, 1),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000001', 'General', 'How many employees does your company have?', 'SINGLE_CHOICE', 1, false, 2),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000001', 'General', 'How many customer references can you provide for the last 3 years?', 'SINGLE_CHOICE', 2, false, 3),
  ('00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-000000000001', 'Finance', 'Do you have audited financial statements for the last year?', 'YES_NO', 2, true, 4),
  ('00000000-0000-4000-8000-000000000605', '00000000-0000-4000-8000-000000000001', 'Finance', 'Can you provide a bank guarantee on request?', 'YES_NO', 2, false, 5),
  ('00000000-0000-4000-8000-000000000606', '00000000-0000-4000-8000-000000000001', 'Quality', 'Do you hold a valid ISO 9001 certificate?', 'YES_NO', 3, true, 6),
  ('00000000-0000-4000-8000-000000000607', '00000000-0000-4000-8000-000000000001', 'Quality', 'How is product quality controlled before delivery?', 'SINGLE_CHOICE', 2, false, 7),
  ('00000000-0000-4000-8000-000000000608', '00000000-0000-4000-8000-000000000001', 'Logistics', 'What storage capacity do you use for these goods?', 'SINGLE_CHOICE', 1, false, 8),
  ('00000000-0000-4000-8000-000000000609', '00000000-0000-4000-8000-000000000001', 'HSE', 'Do you have a written health, safety and environment policy?', 'YES_NO', 2, true, 9),
  ('00000000-0000-4000-8000-000000000610', '00000000-0000-4000-8000-000000000001', 'Compliance', 'Have you had a legal dispute with a customer in the last 3 years?', 'YES_NO', 2, false, 10)
on conflict (id) do nothing;

insert into public.questionnaire_option (id, question_id, label, points, sort_order) values
  ('00000000-0000-4000-8000-000000006011', '00000000-0000-4000-8000-000000000601', 'Less than 1 year', 0, 1),
  ('00000000-0000-4000-8000-000000006012', '00000000-0000-4000-8000-000000000601', '1 to 3 years', 4, 2),
  ('00000000-0000-4000-8000-000000006013', '00000000-0000-4000-8000-000000000601', '3 to 5 years', 7, 3),
  ('00000000-0000-4000-8000-000000006014', '00000000-0000-4000-8000-000000000601', 'More than 5 years', 10, 4),
  ('00000000-0000-4000-8000-000000006021', '00000000-0000-4000-8000-000000000602', 'Fewer than 10', 3, 1),
  ('00000000-0000-4000-8000-000000006022', '00000000-0000-4000-8000-000000000602', '10 to 50', 7, 2),
  ('00000000-0000-4000-8000-000000006023', '00000000-0000-4000-8000-000000000602', 'More than 50', 10, 3),
  ('00000000-0000-4000-8000-000000006031', '00000000-0000-4000-8000-000000000603', 'None', 0, 1),
  ('00000000-0000-4000-8000-000000006032', '00000000-0000-4000-8000-000000000603', '1 or 2', 6, 2),
  ('00000000-0000-4000-8000-000000006033', '00000000-0000-4000-8000-000000000603', '3 or more', 10, 3),
  ('00000000-0000-4000-8000-000000006041', '00000000-0000-4000-8000-000000000604', 'Yes', 10, 1),
  ('00000000-0000-4000-8000-000000006042', '00000000-0000-4000-8000-000000000604', 'No', 0, 2),
  ('00000000-0000-4000-8000-000000006051', '00000000-0000-4000-8000-000000000605', 'Yes', 10, 1),
  ('00000000-0000-4000-8000-000000006052', '00000000-0000-4000-8000-000000000605', 'No', 0, 2),
  ('00000000-0000-4000-8000-000000006061', '00000000-0000-4000-8000-000000000606', 'Yes', 10, 1),
  ('00000000-0000-4000-8000-000000006062', '00000000-0000-4000-8000-000000000606', 'No', 0, 2),
  ('00000000-0000-4000-8000-000000006071', '00000000-0000-4000-8000-000000000607', 'No formal control', 0, 1),
  ('00000000-0000-4000-8000-000000006072', '00000000-0000-4000-8000-000000000607', 'Visual check by staff', 5, 2),
  ('00000000-0000-4000-8000-000000006073', '00000000-0000-4000-8000-000000000607', 'Documented procedure with records', 10, 3),
  ('00000000-0000-4000-8000-000000006081', '00000000-0000-4000-8000-000000000608', 'None', 0, 1),
  ('00000000-0000-4000-8000-000000006082', '00000000-0000-4000-8000-000000000608', 'Rented warehouse', 6, 2),
  ('00000000-0000-4000-8000-000000006083', '00000000-0000-4000-8000-000000000608', 'Own warehouse', 10, 3),
  ('00000000-0000-4000-8000-000000006091', '00000000-0000-4000-8000-000000000609', 'Yes', 10, 1),
  ('00000000-0000-4000-8000-000000006092', '00000000-0000-4000-8000-000000000609', 'No', 0, 2),
  ('00000000-0000-4000-8000-000000006101', '00000000-0000-4000-8000-000000000610', 'No', 10, 1),
  ('00000000-0000-4000-8000-000000006102', '00000000-0000-4000-8000-000000000610', 'Yes', 0, 2)
on conflict (id) do nothing;

------------------------------------------------------------------
-- Vendor B (Beta Trade Ltd, Türkiye, grade A) and Vendor C (Gamma Supply LLC, local, grade C),
-- both QUALIFIED in Fertilisers (so in the AVL of its children too). Both have the owner
-- Rauf Mammadov, so both cards show "Shares an owner". Vendor A registers live.
------------------------------------------------------------------
insert into public.vendor (id, company_id, vendor_type, legal_name, voen, foreign_tax_number, country_code,
                           legal_address, director_name, is_vat_payer, contact_person, contact_email, phone,
                           status, standing, founded_on, main_activity, main_goods,
                           bank_guarantee_available, bank_guarantee_types, bank_guarantee_max,
                           bank_guarantee_currency, submitted_at) values
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000001', 'FOREIGN_COMPANY',
   'Beta Trade Ltd', null, 'TR-DEMO-0000002', 'TR', 'Demo Cad. 2, Izmir, Türkiye', 'Selin Demir', false,
   'Selin Demir', 'sales@beta-trade.test', '+905550000002', 'APPROVED', 'ACTIVE', '2009-04-20', 'OFFICIAL_DEALER',
   array['Ammonium nitrate', 'Urea', 'Foliar fertiliser'], true, array['BID', 'PERFORMANCE'], 100000.00, 'USD', now()),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000001', 'LOCAL_COMPANY',
   'Gamma Supply LLC', '9900000003', null, 'AZ', 'Demo street 3, Ganja', 'Orkhan Valiyev', true,
   'Orkhan Valiyev', 'office@gamma-supply.test', '+994500000003', 'APPROVED', 'ACTIVE', '2018-09-01', 'TRADER',
   array['Ammonium nitrate', 'Seeds'], false, '{}', null, null, now())
on conflict (id) do nothing;

insert into public.vendor_owner (id, vendor_id, full_name, id_number, share_percent, role) values
  ('00000000-0000-4000-8000-000000005021', '00000000-0000-4000-8000-000000000502', 'Selin Demir', 'TR-ID-DEMO-21', 40, 'HEAD'),
  ('00000000-0000-4000-8000-000000005022', '00000000-0000-4000-8000-000000000502', 'Rauf Mammadov', 'AZE-DEMO-0001', 35, 'SHAREHOLDER'),
  ('00000000-0000-4000-8000-000000005031', '00000000-0000-4000-8000-000000000503', 'Orkhan Valiyev', 'AZE-DEMO-0031', 50, 'HEAD'),
  ('00000000-0000-4000-8000-000000005032', '00000000-0000-4000-8000-000000000503', 'Rauf Mammadov', 'AZE-DEMO-0001', 50, 'FOUNDER')
on conflict (id) do nothing;

-- REG-01 AC4: Beta Trade keeps two accounts (USD main, EUR), Gamma Supply one.
insert into public.vendor_bank_account (id, vendor_id, bank_name, iban, swift, currency, is_main) values
  ('00000000-0000-4000-8000-000000005023', '00000000-0000-4000-8000-000000000502', 'Demo Bank Türkiye',
   'TR000000000000000000000002', 'DEMOTRIS', 'USD', true),
  ('00000000-0000-4000-8000-000000005024', '00000000-0000-4000-8000-000000000502', 'Demo Euro Bank',
   'TR000000000000000000000012', 'DEMOEUIS', 'EUR', false),
  ('00000000-0000-4000-8000-000000005033', '00000000-0000-4000-8000-000000000503', 'Demo Bank Azerbaijan',
   'AZ00DEMO00000000000000000003', 'DEMOAZ22', 'AZN', true)
on conflict (id) do nothing;

-- REG-07 AC4 / REG-06 AC7: the first contact person (the person on the account form) is also the legal
-- representative; the sample proof-of-authority file comes with scripts/seed-users.ts (it needs Storage).
insert into public.vendor_contact (id, company_id, vendor_id, full_name, position, phone, email, is_primary,
                                   is_legal_representative)
select c.id, v.company_id, v.id, v.contact_person, c.position, v.phone, v.contact_email, true, true
from (values
  ('00000000-0000-4000-8000-000000005026'::uuid, '00000000-0000-4000-8000-000000000502'::uuid, 'Sales director'),
  ('00000000-0000-4000-8000-000000005036'::uuid, '00000000-0000-4000-8000-000000000503'::uuid, 'Director')
) as c (id, vendor_id, position)
join public.vendor v on v.id = c.vendor_id
where not exists (select 1 from public.vendor_contact x where x.vendor_id = c.vendor_id and x.is_primary)
on conflict (id) do nothing;
update public.vendor_contact set is_legal_representative = true, position = coalesce(position, 'Director')
 where is_primary and vendor_id in ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000503');

insert into public.vendor_brand (id, vendor_id, brand, is_official_dealer) values
  ('00000000-0000-4000-8000-000000005025', '00000000-0000-4000-8000-000000000502', 'TerraGrow', true),
  ('00000000-0000-4000-8000-000000005035', '00000000-0000-4000-8000-000000000503', 'FieldPro', false)
on conflict (id) do nothing;

insert into public.vendor_certificate (id, vendor_id, type, number, issuer, issued_on, expires_on) values
  ('00000000-0000-4000-8000-000000005027', '00000000-0000-4000-8000-000000000502', 'ISO_9001', 'DEMO-QMS-0002',
   'Demo Certification Body', '2024-06-01', '2027-06-01'),
  ('00000000-0000-4000-8000-000000005037', '00000000-0000-4000-8000-000000000503', 'LICENCE', 'DEMO-LIC-0003',
   'Demo Agriculture Agency', '2025-01-15', null)
on conflict (id) do nothing;

insert into public.questionnaire_response (id, company_id, vendor_id, attempt_no, status, score, grade, valid_until,
                                           submitted_at, reviewed_at) values
  ('00000000-0000-4000-8000-000000005028', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000502',
   1, 'GRADED', 91.0, 'A', ((now() at time zone 'Asia/Baku')::date + interval '12 months')::date, now(), now()),
  ('00000000-0000-4000-8000-000000005038', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000503',
   1, 'GRADED', 62.0, 'C', ((now() at time zone 'Asia/Baku')::date + interval '12 months')::date, now(), now())
on conflict (id) do nothing;

insert into public.category_application (id, company_id, vendor_id, category_id, status, valid_until, decided_at) values
  ('00000000-0000-4000-8000-000000005029', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000502',
   '00000000-0000-4000-8000-000000000101', 'QUALIFIED', ((now() at time zone 'Asia/Baku')::date + interval '12 months')::date, now()),
  ('00000000-0000-4000-8000-000000005039', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000503',
   '00000000-0000-4000-8000-000000000101', 'QUALIFIED', ((now() at time zone 'Asia/Baku')::date + interval '12 months')::date, now())
on conflict (id) do nothing;
