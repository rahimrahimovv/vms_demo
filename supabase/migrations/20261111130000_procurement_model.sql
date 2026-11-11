-- Data model for Slices 3-7 (PLN, PR, RFQ incl. SSP / extra costs / final offer, CMT incl. opening, PO).
-- Tables, constraints, read policies and status audit now; the functions that change status, and
-- vendors' read access to sourcing details, come with each slice. Until then authenticated users
-- cannot write these tables (no write policies), so nothing here is reachable from a screen yet.

------------------------------------------------------------------
-- 1. Document numbers: PREFIX-YYYY-sequence, restart each year, never reused (Calculation Rules)
------------------------------------------------------------------
create table public.doc_counter (
  company_id uuid not null references public.company (id),
  prefix     text not null check (prefix in ('PR', 'SRC', 'PO', 'MIN')),
  year       integer not null,
  last_value integer not null default 0,
  primary key (company_id, prefix, year)
);
alter table public.doc_counter enable row level security;  -- no policies: functions only

create function app.next_number(p_company uuid, p_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_year integer := extract(year from now() at time zone 'Asia/Baku');
  v_next integer;
begin
  insert into public.doc_counter (company_id, prefix, year, last_value) values (p_company, p_prefix, v_year, 1)
  on conflict (company_id, prefix, year) do update set last_value = public.doc_counter.last_value + 1
  returning last_value into v_next;
  return p_prefix || '-' || v_year || '-' || lpad(v_next::text, case when p_prefix = 'MIN' then 3 else 4 end, '0');
end $$;

------------------------------------------------------------------
-- 2. Plan (PLN-01) and purchase requisition (PR-01, PR-02)
------------------------------------------------------------------
create table public.plan_line (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.company (id),
  year           integer not null check (year between 2000 and 2100),
  category_id    uuid not null references public.category (id) on delete restrict,
  description    text not null check (btrim(description) <> ''),
  planned_amount numeric(14,2) not null check (planned_amount > 0),
  quarter        text not null check (quarter in ('Q1', 'Q2', 'Q3', 'Q4')),
  status         text not null default 'ACTIVE' check (status in ('ACTIVE', 'CLOSED')),
  created_at     timestamptz not null default now()
);

create table public.requisition (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.company (id),
  number           text not null unique,
  plan_line_id     uuid not null references public.plan_line (id),
  requester_id     uuid not null references public.app_user (id),
  status           text not null default 'DRAFT' check (status in ('DRAFT', 'PENDING_APPROVAL', 'RETURNED', 'APPROVED',
                                                                    'REJECTED', 'IN_SOURCING', 'COMPLETED')),
  estimated_value  numeric(14,2) not null default 0 check (estimated_value >= 0),  -- excluding VAT, kept by trigger
  decision_comment text,
  submitted_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index requisition_status_idx on public.requisition (company_id, status);
create index requisition_plan_line_idx on public.requisition (plan_line_id);

create table public.requisition_line (
  id                   uuid primary key default gen_random_uuid(),
  requisition_id       uuid not null references public.requisition (id) on delete cascade,
  item_id              uuid not null references public.item (id),
  quantity             numeric(14,3) not null check (quantity > 0),
  estimated_unit_price numeric(14,2) not null check (estimated_unit_price > 0),  -- excluding VAT
  delivery_date        date not null,
  delivery_place_id    uuid not null references public.delivery_place (id),
  specification        text check (char_length(specification) <= 2000)
);
create index requisition_line_requisition_idx on public.requisition_line (requisition_id);

-- PR estimated value = sum of quantity × estimated unit price (Calculation Rules)
create function app.refresh_requisition_value() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce(new.requisition_id, old.requisition_id);
begin
  update public.requisition r
     set estimated_value = coalesce((select round(sum(l.quantity * l.estimated_unit_price), 2)
                                     from public.requisition_line l where l.requisition_id = v_id), 0)
   where r.id = v_id;
  return null;
end $$;
create trigger requisition_line_value after insert or update or delete on public.requisition_line
  for each row execute function app.refresh_requisition_value();

------------------------------------------------------------------
-- 3. Sourcing (RFQ-01..RFQ-08). PRs are linked only through sourcing_line.
------------------------------------------------------------------
create table public.sourcing (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.company (id),
  number                  text not null unique,
  owner_id                uuid not null references public.app_user (id),
  method                  text not null check (method in ('COMPETITIVE', 'SINGLE_SOURCE')),
  type                    text not null check (type in ('RFQ', 'TENDER', 'SSP')),
  status                  text not null default 'DRAFT' check (status in (
                            'DRAFT', 'OPEN', 'CLOSED', 'AWAITING_OPENING', 'TECHNICAL_EVALUATION', 'COMPARISON',
                            'FINAL_OFFER_ROUND', 'IN_COMMITTEE', 'WINNER_APPROVED', 'COMPLETED', 'CANCELLED')),
  value                   numeric(14,2) not null check (value >= 0),
  min_proposals           integer not null check (min_proposals >= 1),
  deadline                timestamptz,
  extension_count         integer not null default 0 check (extension_count >= 0),
  final_offer_deadline    timestamptz,
  final_offer_rounds_used integer not null default 0 check (final_offer_rounds_used >= 0),
  required_incoterm       text references public.incoterm (code),
  named_place_id          uuid references public.delivery_place (id),
  delivery_mode_id        uuid references public.delivery_mode (id),
  payment_term_id         uuid references public.payment_term (id),
  tech_doc_required       boolean not null default false,
  ssp_vendor_id           uuid references public.vendor (id),       -- RFQ-06: chosen in DRAFT
  excluded_vendor_ids     uuid[] not null default '{}',              -- RFQ-01 AC5: removed in DRAFT
  ssp_justification       text,
  low_competition_reason  text,
  cancel_reason           text,
  bids_opened_at          timestamptz,  -- names and technical documents visible (NFR-002, CMT-04)
  prices_opened_at        timestamptz,  -- prices visible (RFQ/SSP at COMPARISON, Tender after technical check)
  created_at              timestamptz not null default now(),
  check ((method = 'SINGLE_SOURCE') = (type = 'SSP')),
  check (type <> 'SSP' or min_proposals = 1)
);
create index sourcing_status_idx on public.sourcing (company_id, status);
create index sourcing_deadline_idx on public.sourcing (deadline) where status in ('OPEN', 'FINAL_OFFER_ROUND');

create table public.sourcing_line (
  id                  uuid primary key default gen_random_uuid(),
  sourcing_id         uuid not null references public.sourcing (id) on delete cascade,
  requisition_line_id uuid not null references public.requisition_line (id),
  status              text not null default 'ACTIVE' check (status in ('ACTIVE', 'CANCELLED')),
  cancel_reason       text,
  unique (sourcing_id, requisition_line_id)
);

create table public.invitation (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.company (id),
  sourcing_id      uuid not null references public.sourcing (id) on delete cascade,
  vendor_id        uuid not null references public.vendor (id),
  status           text not null default 'INVITED' check (status in ('INVITED', 'ACCEPTED', 'DECLINED')),
  decline_reason   text,
  reminder_sent_at timestamptz,  -- 24-hour deadline reminder
  created_at       timestamptz not null default now(),
  unique (sourcing_id, vendor_id),
  check (status <> 'DECLINED' or decline_reason is not null)
);
create index invitation_vendor_idx on public.invitation (vendor_id);

create table public.proposal (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.company (id),
  sourcing_id        uuid not null references public.sourcing (id) on delete cascade,
  vendor_id          uuid not null references public.vendor (id),
  status             text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED', 'WITHDRAWN', 'PASSED',
                                                                      'DISQUALIFIED', 'AWARDED', 'NOT_AWARDED')),
  incoterm           text not null references public.incoterm (code),
  named_place_id     uuid not null references public.delivery_place (id),
  delivery_mode_id   uuid not null references public.delivery_mode (id),
  payment_term_id    uuid not null references public.payment_term (id),
  prices_include_vat boolean not null,
  vat_rate           numeric(5,2) not null default 0 check (vat_rate between 0 and 100),
  delivery_days      integer check (delivery_days >= 0),
  validity_days      integer check (validity_days >= 0),
  comment            text,
  disqualify_reason  text,
  passed_at          timestamptz,  -- Tender: passed the technical check, so its prices may open
  submitted_at       timestamptz,
  created_at         timestamptz not null default now(),
  unique (sourcing_id, vendor_id),
  check (not prices_include_vat or vat_rate > 0),
  check (status <> 'DISQUALIFIED' or disqualify_reason is not null)
);

create table public.proposal_line (
  id               uuid primary key default gen_random_uuid(),
  proposal_id      uuid not null references public.proposal (id) on delete cascade,
  sourcing_line_id uuid not null references public.sourcing_line (id) on delete cascade,
  round            integer not null default 1 check (round in (1, 2)),  -- 2 = final offer (RFQ-08)
  unit_price       numeric(14,2) not null check (unit_price > 0),        -- as entered (with or without VAT)
  unique (proposal_id, sourcing_line_id, round)
);

-- Calculation Rules: price ÷ (1 + VAT rate ÷ 100), 2 decimals, when prices include VAT.
create function app.price_excl_vat(p_price numeric, p_includes_vat boolean, p_vat_rate numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case when p_includes_vat then round(p_price / (1 + p_vat_rate / 100), 2) else p_price end
$$;

create table public.final_offer_request (
  id           uuid primary key default gen_random_uuid(),
  sourcing_id  uuid not null references public.sourcing (id) on delete cascade,
  vendor_id    uuid not null references public.vendor (id),
  message      text,
  responded_at timestamptz,
  unique (sourcing_id, vendor_id)
);

create table public.comparison_cost (
  id               uuid primary key default gen_random_uuid(),
  sourcing_line_id uuid not null references public.sourcing_line (id) on delete cascade,
  proposal_id      uuid not null references public.proposal (id) on delete cascade,
  type             text not null check (type in ('CUSTOMS', 'DELIVERY', 'INSURANCE', 'OTHER')),
  amount_per_unit  numeric(14,2) not null check (amount_per_unit >= 0),
  note             text,
  created_by       uuid references public.app_user (id),
  created_at       timestamptz not null default now()
);

-- A line can be split across vendors later; the MVP awards the full quantity.
create table public.award_line (
  id               uuid primary key default gen_random_uuid(),
  sourcing_line_id uuid not null references public.sourcing_line (id) on delete cascade,
  proposal_line_id uuid not null references public.proposal_line (id),
  quantity         numeric(14,3) not null check (quantity > 0),
  justification    text,  -- required when not the lowest evaluated price
  status           text not null default 'ACTIVE' check (status in ('ACTIVE', 'REJECTED', 'CANCELLED')),
  created_at       timestamptz not null default now()
);
create unique index award_line_active_key on public.award_line (sourcing_line_id, proposal_line_id)
  where status = 'ACTIVE';

create table public.question (
  id                      uuid primary key default gen_random_uuid(),
  sourcing_id             uuid not null references public.sourcing (id) on delete cascade,
  vendor_id               uuid references public.vendor (id),  -- empty for a clarification without a question
  question_text           text check (char_length(question_text) <= 2000),
  published_question_text text,
  answer_text             text,
  status                  text not null default 'UNANSWERED' check (status in ('UNANSWERED', 'PUBLISHED')),
  asked_at                timestamptz not null default now(),
  published_at            timestamptz
);
create index question_sourcing_idx on public.question (sourcing_id);

------------------------------------------------------------------
-- 4. Committee (CMT-01..CMT-04) and purchase order (PO-01..PO-03)
------------------------------------------------------------------
create table public.committee (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null unique references public.company (id),
  voting_period_days integer not null default 3 check (voting_period_days >= 1)  -- business days
);

create table public.committee_member (
  id           uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committee (id) on delete cascade,
  user_id      uuid not null references public.app_user (id),
  is_chair     boolean not null default false,
  unique (committee_id, user_id)
);
create unique index committee_one_chair on public.committee_member (committee_id) where is_chair;

-- The voting period lives on the committee (CMT-01); the old setting key is dropped.
insert into public.committee (company_id, voting_period_days)
select s.company_id, (s.value #>> '{}')::integer from public.setting s where s.key = 'voting_period_days'
on conflict (company_id) do nothing;
delete from public.setting where key = 'voting_period_days';

create table public.purchase_order (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.company (id),
  number           text not null unique,
  sourcing_id      uuid not null references public.sourcing (id),
  vendor_id        uuid not null references public.vendor (id),
  status           text not null default 'PENDING_APPROVAL' check (status in (
                     'PENDING_APPROVAL', 'PENDING_COMMITTEE', 'FULLY_APPROVED', 'ACCEPTED', 'DECLINED_BY_VENDOR', 'REJECTED')),
  incoterm         text references public.incoterm (code),
  named_place_id   uuid references public.delivery_place (id),
  delivery_mode_id uuid references public.delivery_mode (id),
  payment_term_id  uuid references public.payment_term (id),
  total            numeric(14,2) not null check (total >= 0),  -- excluding VAT
  vat_amount       numeric(14,2) not null default 0,
  total_incl_vat   numeric(14,2) not null,
  reason           text,
  created_at       timestamptz not null default now()
);
create index purchase_order_vendor_idx on public.purchase_order (vendor_id, status);

create table public.purchase_order_line (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_order (id) on delete cascade,
  award_line_id     uuid not null references public.award_line (id),
  quantity          numeric(14,3) not null check (quantity > 0),
  unit_price        numeric(14,2) not null check (unit_price > 0),  -- excluding VAT, without extra costs
  line_total        numeric(14,2) not null
);

create table public.decision (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.company (id),
  type              text not null check (type in ('OPENING', 'WINNER', 'PO')),
  sourcing_id       uuid not null references public.sourcing (id),
  purchase_order_id uuid references public.purchase_order (id),
  status            text not null default 'VOTING' check (status in ('VOTING', 'APPROVED', 'REJECTED', 'NO_DECISION')),
  result_rule       text check (result_rule in ('MAJORITY', 'CHAIR_CASTING_VOTE', 'NO_QUORUM', 'TIE_WITHOUT_CHAIR')),
  opened_at         timestamptz not null default now(),
  deadline          timestamptz not null,
  closed_at         timestamptz,
  check ((type = 'PO') = (purchase_order_id is not null))
);
create index decision_voting_idx on public.decision (deadline) where status = 'VOTING';
create unique index decision_one_open on public.decision (sourcing_id, type, coalesce(purchase_order_id,
  '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'VOTING';

create table public.decision_voter (
  id          uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decision (id) on delete cascade,
  user_id     uuid not null references public.app_user (id),
  is_chair    boolean not null default false,
  vote        text not null default 'NONE' check (vote in ('NONE', 'FOR', 'AGAINST', 'CONFLICT')),
  comment     text,
  voted_at    timestamptz,
  unique (decision_id, user_id),
  check (vote not in ('AGAINST', 'CONFLICT') or comment is not null)
);

create table public.minutes (
  id          uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique references public.decision (id),
  number      text not null unique,
  created_at  timestamptz not null default now()
);

-- CMT-03 AC4: minutes are never changed or deleted.
create function app.refuse_minutes_change() returns trigger
language plpgsql as $$
begin
  raise exception 'Minutes cannot be changed or deleted' using errcode = '42501';
end $$;
create trigger minutes_immutable before update or delete on public.minutes
  for each row execute function app.refuse_minutes_change();

------------------------------------------------------------------
-- 5. Status audit (NFR-011): every entity in the Status Transition Model
------------------------------------------------------------------
create trigger plan_line_audit after insert or update of status on public.plan_line
  for each row execute function app.audit_status_change('plan_line');
create trigger requisition_audit after insert or update of status on public.requisition
  for each row execute function app.audit_status_change('requisition');
create trigger sourcing_audit after insert or update of status on public.sourcing
  for each row execute function app.audit_status_change('sourcing');
create trigger invitation_audit after insert or update of status on public.invitation
  for each row execute function app.audit_status_change('invitation');
create trigger proposal_audit after insert or update of status on public.proposal
  for each row execute function app.audit_status_change('proposal');
create trigger decision_audit after insert or update of status on public.decision
  for each row execute function app.audit_status_change('decision');
create trigger purchase_order_audit after insert or update of status on public.purchase_order
  for each row execute function app.audit_status_change('purchase_order');

------------------------------------------------------------------
-- 6. Visibility helpers (NFR-002 sealed proposals, CMT-04 two envelopes)
------------------------------------------------------------------
-- Who may read bids at all once they are open: PS, CM, Admin (Role Matrix).
create function app.can_view_bids() returns boolean
language sql stable set search_path = '' as $$
  select app.can_view_vendors()
$$;

-- Bidders' names and proposal records: from AWAITING_OPENING (committee sees names) or once opened.
create function app.bids_visible(p_sourcing uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sourcing s where s.id = p_sourcing
                 and (s.bids_opened_at is not null or s.status = 'AWAITING_OPENING'))
$$;

-- Prices of one proposal line: prices opened; Tender only for proposals that passed the technical
-- check; final-offer prices only after the round closes.
create function app.prices_visible(p_proposal uuid, p_round integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.proposal p join public.sourcing s on s.id = p.sourcing_id
                 where p.id = p_proposal and s.prices_opened_at is not null
                   and (s.type <> 'TENDER' or p.passed_at is not null)
                   and (p_round = 1 or s.status <> 'FINAL_OFFER_ROUND'))
$$;

-- Plan readers (Role Matrix "View the plan"): Requester, Approver, PS, Admin.
create function app.can_view_plan() returns boolean
language sql stable set search_path = '' as $$
  select app.has_any_role(array['REQUESTER', 'APPROVER', 'PROCUREMENT_SPECIALIST', 'ADMIN']::public.app_role[])
$$;

-- Decisions and minutes (Role Matrix "View minutes"): Approver, PS, CM, Admin; never vendors.
create function app.can_view_minutes() returns boolean
language sql stable set search_path = '' as $$
  select app.has_any_role(array['APPROVER', 'PROCUREMENT_SPECIALIST', 'COMMITTEE_MEMBER', 'ADMIN']::public.app_role[])
$$;

------------------------------------------------------------------
-- 7. Read policies (writes come with each slice's functions)
------------------------------------------------------------------
alter table public.plan_line enable row level security;
create policy plan_line_select on public.plan_line for select to authenticated     -- PLN-01 AC3, AC5
  using ((select app.can_view_plan()) and company_id = (select app.current_company_id()));
create policy plan_line_admin_write on public.plan_line for all to authenticated   -- PLN-01 AC1, AC2
  using ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()))
  with check ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()));

-- PR: the Requester sees own PRs in any status; other internal users see them once submitted.
alter table public.requisition enable row level security;
create policy requisition_select on public.requisition for select to authenticated
  using (company_id = (select app.current_company_id())
         and (requester_id = (select auth.uid()) or ((select app.is_internal()) and status <> 'DRAFT')));

alter table public.requisition_line enable row level security;
create policy requisition_line_select on public.requisition_line for select to authenticated
  using (exists (select 1 from public.requisition r where r.id = requisition_line.requisition_id));

-- Sourcing and its lines: internal users. Vendors get a reduced view (no PR prices) in Slice 4.
alter table public.sourcing enable row level security;
create policy sourcing_select on public.sourcing for select to authenticated
  using ((select app.is_internal()) and company_id = (select app.current_company_id()));

alter table public.sourcing_line enable row level security;
create policy sourcing_line_select on public.sourcing_line for select to authenticated
  using (exists (select 1 from public.sourcing s where s.id = sourcing_line.sourcing_id));

-- Invitation: the vendor its own; PS / CM / Admin (the owner sees decline reasons, RFQ-02 AC2).
alter table public.invitation enable row level security;
create policy invitation_select on public.invitation for select to authenticated
  using (vendor_id = (select app.current_vendor_id())
         or ((select app.can_view_bids()) and company_id = (select app.current_company_id())));

-- Proposal: the vendor its own; PS / CM / Admin only once bids are visible (NFR-002).
alter table public.proposal enable row level security;
create policy proposal_select on public.proposal for select to authenticated
  using (vendor_id = (select app.current_vendor_id())
         or ((select app.can_view_bids()) and company_id = (select app.current_company_id())
             and app.bids_visible(sourcing_id)));

alter table public.proposal_line enable row level security;
create policy proposal_line_select on public.proposal_line for select to authenticated
  using (exists (select 1 from public.proposal p where p.id = proposal_line.proposal_id
                 and p.vendor_id = (select app.current_vendor_id()))
         or ((select app.can_view_bids()) and app.prices_visible(proposal_id, round)));

alter table public.final_offer_request enable row level security;
create policy final_offer_request_select on public.final_offer_request for select to authenticated
  using (vendor_id = (select app.current_vendor_id())
         or ((select app.can_view_bids()) and exists (select 1 from public.sourcing s
                                                      where s.id = final_offer_request.sourcing_id)));

alter table public.comparison_cost enable row level security;
create policy comparison_cost_select on public.comparison_cost for select to authenticated
  using ((select app.can_view_bids()) and app.prices_visible(proposal_id, 1));

alter table public.award_line enable row level security;
create policy award_line_select on public.award_line for select to authenticated
  using ((select app.is_internal()) and exists (select 1 from public.sourcing_line l
                                                where l.id = award_line.sourcing_line_id));

-- Q&A: the asking vendor its own questions; PS and Admin all. Published answers reach the other
-- vendors through a function without the asker's name (RFQ-03, Slice 6).
alter table public.question enable row level security;
create policy question_select on public.question for select to authenticated
  using ((vendor_id is not null and vendor_id = (select app.current_vendor_id()))
         or ((select app.has_any_role(array['PROCUREMENT_SPECIALIST', 'ADMIN']::public.app_role[]))
             and exists (select 1 from public.sourcing s where s.id = question.sourcing_id)));

alter table public.committee enable row level security;
create policy committee_select on public.committee for select to authenticated
  using ((select app.is_internal()) and company_id = (select app.current_company_id()));
alter table public.committee_member enable row level security;
create policy committee_member_select on public.committee_member for select to authenticated
  using (exists (select 1 from public.committee c where c.id = committee_member.committee_id));

alter table public.decision enable row level security;
create policy decision_select on public.decision for select to authenticated
  using ((select app.can_view_minutes()) and company_id = (select app.current_company_id()));

-- CMT-02 AC6: while VOTING a member sees only their own vote; who has voted comes from a function.
alter table public.decision_voter enable row level security;
create policy decision_voter_select on public.decision_voter for select to authenticated
  using (exists (select 1 from public.decision d where d.id = decision_voter.decision_id
                 and (decision_voter.user_id = (select auth.uid()) or d.status <> 'VOTING')));

alter table public.minutes enable row level security;
create policy minutes_select on public.minutes for select to authenticated
  using (exists (select 1 from public.decision d where d.id = minutes.decision_id));

-- PO: internal users; the vendor its own once FULLY_APPROVED (PO-02: approved before the vendor sees it).
alter table public.purchase_order enable row level security;
create policy purchase_order_select on public.purchase_order for select to authenticated
  using (company_id = (select app.current_company_id())
         and ((select app.is_internal())
              or (vendor_id = (select app.current_vendor_id())
                  and status in ('FULLY_APPROVED', 'ACCEPTED', 'DECLINED_BY_VENDOR'))));

alter table public.purchase_order_line enable row level security;
create policy purchase_order_line_select on public.purchase_order_line for select to authenticated
  using (exists (select 1 from public.purchase_order po where po.id = purchase_order_line.purchase_order_id));

------------------------------------------------------------------
-- 8. History and file access for the procurement records
------------------------------------------------------------------
create or replace function app.can_read_record(p_record_type text, p_record_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_record_type in ('vendor', 'vendor_standing') then
      p_record_id = app.current_vendor_id() or app.can_view_vendors()
    when p_record_type = 'questionnaire_response' then
      (select r.vendor_id = app.current_vendor_id() or app.can_view_vendors()
       from public.questionnaire_response r where r.id = p_record_id)
    when p_record_type = 'category_application' then
      (select a.vendor_id = app.current_vendor_id() or app.can_view_vendors()
       from public.category_application a where a.id = p_record_id)
    when p_record_type = 'invitation' then
      (select i.vendor_id = app.current_vendor_id() or (app.can_view_bids() and app.bids_visible(i.sourcing_id))
       from public.invitation i where i.id = p_record_id)
    when p_record_type = 'proposal' then
      (select p.vendor_id = app.current_vendor_id() or (app.can_view_bids() and app.bids_visible(p.sourcing_id))
       from public.proposal p where p.id = p_record_id)
    when p_record_type = 'purchase_order' then
      (select app.is_internal() or (po.vendor_id = app.current_vendor_id()
                                    and po.status in ('FULLY_APPROVED', 'ACCEPTED', 'DECLINED_BY_VENDOR'))
       from public.purchase_order po where po.id = p_record_id)
    when p_record_type = 'decision' then app.can_view_minutes()
    when p_record_type = 'plan_line' then app.can_view_plan()
    else app.is_internal()
  end
$$;

create or replace function app.can_read_file(p_owner_type text, p_owner_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_owner_type in ('vendor', 'vendor_brand', 'vendor_certificate', 'questionnaire_answer', 'category_application')
      then coalesce(app.file_owner_vendor(p_owner_type, p_owner_id) = app.current_vendor_id(), false)
           or app.can_view_vendors()
    when p_owner_type = 'requisition' then
      exists (select 1 from public.requisition r where r.id = p_owner_id
              and (r.requester_id = auth.uid() or (app.is_internal() and r.status <> 'DRAFT')))
    when p_owner_type = 'sourcing' then app.is_internal()
    -- technical documents: the vendor its own; internal only once the bids are opened (CMT-04 AC2)
    when p_owner_type = 'proposal' then
      exists (select 1 from public.proposal p join public.sourcing s on s.id = p.sourcing_id
              where p.id = p_owner_id
                and (p.vendor_id = app.current_vendor_id()
                     or (app.can_view_bids() and s.bids_opened_at is not null)))
    when p_owner_type = 'question' then
      exists (select 1 from public.question q where q.id = p_owner_id
              and (q.vendor_id = app.current_vendor_id()
                   or app.has_any_role(array['PROCUREMENT_SPECIALIST', 'ADMIN']::public.app_role[])))
    when p_owner_type = 'minutes' then app.can_view_minutes()
    when p_owner_type = 'purchase_order' then
      exists (select 1 from public.purchase_order po where po.id = p_owner_id
              and (app.is_internal() or (po.vendor_id = app.current_vendor_id()
                                         and po.status in ('FULLY_APPROVED', 'ACCEPTED', 'DECLINED_BY_VENDOR'))))
    else false
  end
$$;

------------------------------------------------------------------
-- 9. Grants
------------------------------------------------------------------
revoke all on public.doc_counter, public.plan_line, public.requisition, public.requisition_line, public.sourcing,
              public.sourcing_line, public.invitation, public.proposal, public.proposal_line,
              public.final_offer_request, public.comparison_cost, public.award_line, public.question,
              public.committee, public.committee_member, public.decision, public.decision_voter, public.minutes,
              public.purchase_order, public.purchase_order_line from anon;
revoke all on public.doc_counter from authenticated;
revoke insert, update, delete on public.minutes from authenticated, service_role;

revoke execute on all functions in schema app from public, anon, authenticated, service_role;
grant execute on function app.current_company_id(), app.has_role(public.app_role), app.is_internal(),
                          app.can_read_record(text, uuid), app.has_any_role(public.app_role[]),
                          app.can_view_vendors(), app.current_vendor_id(), app.vendor_registration_editable(uuid),
                          app.can_read_file(text, uuid), app.today(), app.certificate_status(date),
                          app.can_view_bids(), app.bids_visible(uuid), app.prices_visible(uuid, integer),
                          app.can_view_plan(), app.can_view_minutes(), app.price_excl_vat(numeric, boolean, numeric),
                          app.fail(text)
  to authenticated;
