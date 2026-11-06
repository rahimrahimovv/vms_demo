-- Demo seed (synthetic data only, backlog "Demo Scenario Data"). Safe to run more than once.
-- Users are created by scripts/seed-users.ts (Auth needs the admin API).

insert into public.company (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Demo Agro LLC')
on conflict (id) do update set name = excluded.name;

insert into public.setting (company_id, key, value) values
  ('00000000-0000-4000-8000-000000000001', 'tender_threshold',     '50000.00'),
  ('00000000-0000-4000-8000-000000000001', 'rfq_bands',            '[{"up_to": 5000.00, "min_proposals": 1}, {"up_to": 15000.00, "min_proposals": 2}, {"up_to": null, "min_proposals": 3}]'),
  ('00000000-0000-4000-8000-000000000001', 'max_extensions',       '2'),
  ('00000000-0000-4000-8000-000000000001', 'qualification_months', '12'),
  ('00000000-0000-4000-8000-000000000001', 'voting_period_days',   '3'),
  ('00000000-0000-4000-8000-000000000001', 'grade_bands',          '{"A": 85.0, "B": 70.0, "C": 50.0}'),
  ('00000000-0000-4000-8000-000000000001', 'd_block_months',       '6')
on conflict (company_id, key) do nothing;
