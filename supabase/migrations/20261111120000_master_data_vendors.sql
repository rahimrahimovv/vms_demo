-- Slice 2 · REG-01 to REG-06, plus the MDM-01 / MDM-02 tables (Admin screens in Slice 3)
-- Dictionaries, category tree, item, vendor + profile, file, questionnaire, category application, AVL.
-- Conventions:
--   * Status changes go through the SECURITY DEFINER functions in section 9 (exposed as RPC);
--     they check role and transition, pass the comment with app.audit_reason and notify.
--   * Errors raised for the UI carry a message key from messages/en.json as the exception text.
--   * "Today" is the Asia/Baku date (app.today()).

create extension if not exists pg_cron;

------------------------------------------------------------------
-- 0. Shared helpers
------------------------------------------------------------------
create function app.today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Baku')::date
$$;

create function app.has_any_role(p_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_role r join public.app_user u on u.id = r.user_id
    where r.user_id = (select auth.uid()) and u.is_active and r.role = any (p_roles))
$$;

-- Procurement Specialist, Committee Member, Admin: read vendor data and vendor cards (Role Matrix).
create function app.can_view_vendors() returns boolean
language sql stable set search_path = '' as $$
  select app.has_any_role(array['PROCUREMENT_SPECIALIST', 'COMMITTEE_MEMBER', 'ADMIN']::public.app_role[])
$$;

create function app.setting(p_company uuid, p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select s.value from public.setting s where s.company_id = p_company and s.key = p_key
$$;

create function app.active_user_ids(p_company uuid, p_role public.app_role) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(u.id), '{}') from public.app_user u join public.user_role r on r.user_id = u.id
  where u.company_id = p_company and u.is_active and r.role = p_role
$$;

-- The audit trigger now takes an optional status column (default 'status'), so vendor.standing
-- is audited as record type 'vendor_standing' next to the registration status.
create or replace function app.audit_status_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_col  text  := coalesce(tg_argv[1], 'status');
  v_new  jsonb := to_jsonb(new);
  v_from text  := case when tg_op = 'UPDATE' then to_jsonb(old) ->> v_col end;
begin
  if v_new ->> v_col is null
     or (tg_op = 'UPDATE' and v_from is not distinct from v_new ->> v_col) then
    return null;
  end if;
  insert into public.audit_entry (company_id, record_type, record_id, from_status, to_status, user_id, reason)
  values (coalesce((v_new ->> 'company_id')::uuid, app.current_company_id()),
          tg_argv[0], (v_new ->> 'id')::uuid, v_from, v_new ->> v_col,
          auth.uid(), nullif(current_setting('app.audit_reason', true), ''));
  return null;
end $$;

-- Raise a UI error: the message is a key in messages/en.json (errors.*).
create function app.fail(p_key text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception '%', p_key using errcode = 'P0001';
end $$;

------------------------------------------------------------------
-- 1. Dictionaries (MDM-01). Codes of Incoterms never change.
------------------------------------------------------------------
create table public.incoterm (
  code      text primary key check (code ~ '^[A-Z]{3}$'),
  name      text not null check (btrim(name) <> ''),
  is_active boolean not null default true
);
create unique index incoterm_name_key on public.incoterm (lower(name));

create table public.payment_term (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.company (id),
  name                text not null check (btrim(name) <> ''),
  advance_percent     numeric(5,2) not null default 0 check (advance_percent between 0 and 100),
  days_after_delivery integer not null default 0 check (days_after_delivery >= 0),
  is_active           boolean not null default true
);
create unique index payment_term_name_key on public.payment_term (company_id, lower(name));

create table public.delivery_place (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id),
  name       text not null check (btrim(name) <> ''),
  type       text not null check (type in ('WAREHOUSE', 'PORT', 'CITY')),
  address    text,
  is_active  boolean not null default true
);
create unique index delivery_place_name_key on public.delivery_place (company_id, lower(name));

create table public.delivery_mode (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id),
  name       text not null check (btrim(name) <> ''),
  is_active  boolean not null default true
);
create unique index delivery_mode_name_key on public.delivery_mode (company_id, lower(name));

------------------------------------------------------------------
-- 2. Category tree and item catalogue (MDM-02).
--    FKs are RESTRICT: an entry in use, or a parent with children, cannot be deleted.
------------------------------------------------------------------
create table public.category (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.company (id),
  parent_id        uuid references public.category (id) on delete restrict,
  name             text not null check (btrim(name) <> ''),
  licence_required boolean not null default false,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create unique index category_sibling_name_key on public.category
  (company_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index category_parent_idx on public.category (parent_id);

-- The category and all its parents (a qualification in a parent covers its children).
create function app.category_ancestors(p_category uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with recursive up as (
    select c.id, c.parent_id from public.category c where c.id = p_category
    union all
    select c.id, c.parent_id from public.category c join up on c.id = up.parent_id
  ) select id from up
$$;

create function app.category_needs_licence(p_category uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.category c
                 where c.id in (select app.category_ancestors(p_category)) and c.licence_required)
$$;

-- No cycles, parent in the same company.
create function app.check_category_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is not null then
    if not exists (select 1 from public.category p where p.id = new.parent_id and p.company_id = new.company_id) then
      perform app.fail('errors.categoryParentInvalid');
    end if;
    if new.id in (select app.category_ancestors(new.parent_id)) then
      perform app.fail('errors.categoryParentInvalid');
    end if;
  end if;
  return new;
end $$;
create trigger category_parent_check before insert or update of parent_id on public.category
  for each row execute function app.check_category_parent();

create table public.item (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.company (id),
  category_id uuid not null references public.category (id) on delete restrict,
  code        text not null check (btrim(code) <> ''),
  name        text not null check (btrim(name) <> ''),
  unit        text not null check (btrim(unit) <> ''),
  is_active   boolean not null default true
);
create unique index item_code_key on public.item (company_id, lower(code));
create index item_category_idx on public.item (category_id);

------------------------------------------------------------------
-- 3. Vendor (REG-01, REG-02, REG-06). One row per vendor company or individual.
------------------------------------------------------------------
create table public.vendor (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.company (id),
  vendor_type              text not null check (vendor_type in ('LOCAL_COMPANY', 'INDIVIDUAL', 'FOREIGN_COMPANY')),
  legal_name               text not null check (btrim(legal_name) <> ''),
  voen                     text check (voen ~ '^[0-9]{10}$'),
  foreign_tax_number       text check (char_length(btrim(foreign_tax_number)) between 3 and 30),
  country_code             text not null check (country_code ~ '^[A-Z]{2}$'),
  id_card_number           text,
  legal_address            text,
  director_name            text,
  is_vat_payer             boolean,
  contact_person           text not null check (btrim(contact_person) <> ''),
  contact_email            text not null,
  phone                    text not null check (phone ~ '^\+[0-9]{8,15}$'),
  status                  text not null default 'DRAFT'
                           check (status in ('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED')),
  standing                 text check (standing in ('ACTIVE', 'HOLD', 'BLACKLISTED')),
  standing_until           date,
  standing_reason          text,
  founded_on               date,
  main_activity            text check (main_activity in ('MANUFACTURER', 'DISTRIBUTOR', 'OFFICIAL_DEALER',
                                                         'SERVICE_PROVIDER', 'TRADER', 'OTHER')),
  main_goods               text[] not null default '{}' check (cardinality(main_goods) <= 20),
  bank_guarantee_available boolean not null default false,
  bank_guarantee_types     text[] not null default '{}'
                           check (bank_guarantee_types <@ array['BID', 'ADVANCE', 'PERFORMANCE']),
  bank_guarantee_max       numeric(14,2) check (bank_guarantee_max > 0),
  bank_guarantee_currency  text check (bank_guarantee_currency ~ '^[A-Z]{3}$'),
  review_comment           text,
  submitted_at             timestamptz,
  created_at               timestamptz not null default now(),
  -- REG-01 AC1-AC3: fields required per type
  constraint vendor_local_fields check (vendor_type <> 'LOCAL_COMPANY' or
    (voen is not null and legal_address is not null and director_name is not null and is_vat_payer is not null)),
  constraint vendor_individual_fields check (vendor_type <> 'INDIVIDUAL' or id_card_number is not null),
  constraint vendor_foreign_fields check (vendor_type <> 'FOREIGN_COMPANY' or
    (foreign_tax_number is not null and voen is null and legal_address is not null)),
  constraint vendor_standing_after_approval check (standing is null or status = 'APPROVED')
);
-- REG-01 AC7: one vendor per tax number
create unique index vendor_voen_key on public.vendor (voen) where voen is not null;
create unique index vendor_foreign_tax_key on public.vendor (upper(btrim(foreign_tax_number)))
  where foreign_tax_number is not null;
create index vendor_company_status_idx on public.vendor (company_id, status);

alter table public.app_user add column vendor_id uuid references public.vendor (id);
create unique index app_user_vendor_key on public.app_user (vendor_id) where vendor_id is not null;

create trigger vendor_audit after insert or update of status on public.vendor
  for each row execute function app.audit_status_change('vendor');
create trigger vendor_standing_audit after insert or update of standing on public.vendor
  for each row execute function app.audit_status_change('vendor_standing', 'standing');

create function app.current_vendor_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.vendor_id from public.app_user u where u.id = (select auth.uid()) and u.is_active
$$;

create function app.vendor_user_ids(p_vendor uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(u.id), '{}') from public.app_user u where u.vendor_id = p_vendor and u.is_active
$$;

-- Registration fields (and owners) change only while DRAFT or RETURNED; profile fields any time.
create function app.vendor_registration_editable(p_vendor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vendor v where v.id = p_vendor and v.status in ('DRAFT', 'RETURNED'))
$$;

create function app.guard_vendor_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Only direct API writes are guarded; SECURITY DEFINER functions run as the owner.
  if current_user = 'authenticated' and old.status not in ('DRAFT', 'RETURNED') and
     (new.vendor_type, new.legal_name, new.voen, new.foreign_tax_number, new.country_code, new.id_card_number,
      new.legal_address, new.director_name, new.is_vat_payer, new.contact_person, new.phone, new.founded_on)
     is distinct from
     (old.vendor_type, old.legal_name, old.voen, old.foreign_tax_number, old.country_code, old.id_card_number,
      old.legal_address, old.director_name, old.is_vat_payer, old.contact_person, old.phone, old.founded_on) then
    perform app.fail('errors.registrationReadOnly');
  end if;
  return new;
end $$;
create trigger vendor_guard before update on public.vendor
  for each row execute function app.guard_vendor_update();

create table public.vendor_owner (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendor (id) on delete cascade,
  full_name     text not null check (btrim(full_name) <> ''),
  id_number     text not null check (btrim(id_number) <> ''),
  share_percent numeric(5,2) check (share_percent > 0 and share_percent <= 100),
  role          text not null check (role in ('FOUNDER', 'SHAREHOLDER', 'HEAD'))
);
create index vendor_owner_vendor_idx on public.vendor_owner (vendor_id);
create index vendor_owner_id_number_idx on public.vendor_owner (upper(btrim(id_number)));

-- REG-06 AC2: checked at commit, so a form can replace all owners in one transaction.
create function app.check_owner_shares() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select coalesce(sum(o.share_percent), 0) from public.vendor_owner o where o.vendor_id = new.vendor_id) > 100 then
    perform app.fail('errors.sharesOver100');
  end if;
  return null;
end $$;
create constraint trigger vendor_owner_shares after insert or update on public.vendor_owner
  deferrable initially deferred for each row execute function app.check_owner_shares();

-- REG-01 AC4, REG-06 AC3: one or more bank accounts, exactly one of them main.
create table public.vendor_bank_account (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references public.vendor (id) on delete cascade,
  bank_name  text not null check (btrim(bank_name) <> ''),
  iban       text not null check (iban ~ '^[A-Z0-9]{1,34}$'),
  swift      text not null check (btrim(swift) <> ''),
  currency   text not null check (currency ~ '^[A-Z]{3}$'),
  is_main    boolean not null default false,
  created_at timestamptz not null default now()
);
create index vendor_bank_account_vendor_idx on public.vendor_bank_account (vendor_id);
create unique index vendor_bank_account_main_key on public.vendor_bank_account (vendor_id) where is_main;

-- Checked at commit, so the accounts can be replaced in one transaction. Skipped when the vendor
-- itself is deleted (cascade).
create function app.check_bank_accounts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_vendor uuid := coalesce(new.vendor_id, old.vendor_id);
begin
  if exists (select 1 from public.vendor v where v.id = v_vendor) then
    if not exists (select 1 from public.vendor_bank_account a where a.vendor_id = v_vendor) then
      perform app.fail('errors.bankAccountRequired');
    end if;
    if (select count(*) from public.vendor_bank_account a where a.vendor_id = v_vendor and a.is_main) <> 1 then
      perform app.fail('errors.mainAccountOne');
    end if;
  end if;
  return null;
end $$;
create constraint trigger vendor_bank_account_rules after insert or update or delete on public.vendor_bank_account
  deferrable initially deferred for each row execute function app.check_bank_accounts();

create table public.vendor_brand (
  id                 uuid primary key default gen_random_uuid(),
  vendor_id          uuid not null references public.vendor (id) on delete cascade,
  brand              text not null check (btrim(brand) <> ''),
  is_official_dealer boolean not null default false
);
create unique index vendor_brand_key on public.vendor_brand (vendor_id, lower(brand));

create table public.vendor_certificate (
  id                  uuid primary key default gen_random_uuid(),
  vendor_id           uuid not null references public.vendor (id) on delete cascade,
  type                text not null check (type in ('ISO_9001', 'ISO_14001', 'ISO_45001', 'HSE_POLICY', 'PRODUCT',
                                                    'LICENCE', 'REFERENCE', 'CATALOGUE', 'OTHER')),
  number              text,
  issuer              text,
  issued_on           date not null,
  expires_on          date check (expires_on >= issued_on),
  reminder_sent_at    timestamptz,  -- "expires in 30 days" sent
  expired_notified_at timestamptz,  -- "expired" sent
  created_at          timestamptz not null default now()
);
create index vendor_certificate_vendor_idx on public.vendor_certificate (vendor_id);

-- Calculation Rules: VALID (no expiry or > 30 days away), EXPIRING (within 30 days),
-- EXPIRED from the day after the expiry date.
create function app.certificate_status(p_expires_on date) returns text
language sql stable set search_path = '' as $$
  select case
    when p_expires_on is null or p_expires_on - app.today() > 30 then 'VALID'
    when app.today() > p_expires_on then 'EXPIRED'
    else 'EXPIRING'
  end
$$;

------------------------------------------------------------------
-- 4. Files (metadata; content in the private Storage bucket "files").
--    Uploads and downloads go through the server, which checks type and size (NFR-009)
--    and creates short-lived signed URLs only for rows the user can read here.
------------------------------------------------------------------
create table public.file (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.company (id),
  owner_type   text not null check (owner_type in ('vendor', 'vendor_brand', 'vendor_certificate', 'questionnaire_answer',
                                                   'category_application', 'requisition', 'sourcing', 'proposal',
                                                   'question', 'minutes', 'purchase_order')),
  owner_id     uuid not null,
  kind         text check (kind in ('charter', 'id_card', 'registration_certificate', 'vat_certificate', 'licence',
                                    'technical_document', 'justification', 'attachment', 'pdf')),
  file_name    text not null check (btrim(file_name) <> ''),
  mime_type    text not null check (mime_type in (
                 'application/pdf', 'image/jpeg', 'image/png',
                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  size_bytes   integer not null check (size_bytes between 1 and 10485760),
  storage_path text not null unique,
  uploaded_by  uuid references public.app_user (id),
  uploaded_at  timestamptz not null default now()
);
create index file_owner_idx on public.file (owner_type, owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 10485760, array[
  'application/pdf', 'image/jpeg', 'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;
-- No storage.objects policies: only the server (secret key) reads and writes the bucket.

------------------------------------------------------------------
-- 5. Qualification questionnaire (REG-05)
------------------------------------------------------------------
create table public.questionnaire_question (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.company (id),
  section           text,  -- e.g. General, Finance, Quality, HSE
  reviewer_role     text,  -- department that reviews the section; review screen in a later phase
  text              text not null check (btrim(text) <> ''),
  answer_type       text not null check (answer_type in ('SINGLE_CHOICE', 'YES_NO')),
  weight            integer not null check (weight between 1 and 5),
  evidence_required boolean not null default false,
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create table public.questionnaire_option (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questionnaire_question (id) on delete cascade,
  label       text not null check (btrim(label) <> ''),
  points      integer not null check (points between 0 and 10),
  sort_order  integer not null default 0,
  unique (id, question_id)
);

create table public.questionnaire_response (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.company (id),
  vendor_id      uuid not null references public.vendor (id) on delete cascade,
  attempt_no     integer not null check (attempt_no > 0),
  status         text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED', 'RETURNED', 'GRADED', 'EXPIRED')),
  score          numeric(4,1),  -- stored when GRADED; the specialist sees it live before that
  grade          text check (grade in ('A', 'B', 'C', 'D')),
  valid_until    date,
  review_comment text,
  reviewed_by    uuid references public.app_user (id),
  reviewed_at    timestamptz,
  submitted_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (vendor_id, attempt_no),
  check ((status in ('GRADED', 'EXPIRED')) = (grade is not null and score is not null and valid_until is not null))
);
create unique index questionnaire_open_key on public.questionnaire_response (vendor_id)
  where status in ('DRAFT', 'SUBMITTED', 'RETURNED');

-- Answer rows are created when the attempt starts, with the weight and maximum points of that
-- moment, so later question edits apply only to questionnaires started after the save (REG-05 AC1).
create table public.questionnaire_answer (
  id             uuid primary key default gen_random_uuid(),
  response_id    uuid not null references public.questionnaire_response (id) on delete cascade,
  question_id    uuid not null references public.questionnaire_question (id),
  option_id      uuid,
  points_awarded integer not null default 0 check (points_awarded between 0 and 10),
  weight         integer not null check (weight between 1 and 5),
  max_points     integer not null check (max_points between 0 and 10),
  adjust_comment text,
  unique (response_id, question_id),
  foreign key (option_id, question_id) references public.questionnaire_option (id, question_id),
  check (points_awarded <= max_points)
);

create trigger questionnaire_audit after insert or update of status on public.questionnaire_response
  for each row execute function app.audit_status_change('questionnaire_response');

-- Calculation Rules: sum(weight × points ÷ max) ÷ sum(weight) × 100, 1 decimal.
create function app.questionnaire_score(p_response uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select round(coalesce(sum(a.weight * coalesce(a.points_awarded::numeric / nullif(a.max_points, 0), 0)), 0)
               / nullif(sum(a.weight), 0) * 100, 1)
  from public.questionnaire_answer a where a.response_id = p_response
$$;

create function app.grade_for(p_company uuid, p_score numeric) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_score >= (b ->> 'A')::numeric then 'A'
    when p_score >= (b ->> 'B')::numeric then 'B'
    when p_score >= (b ->> 'C')::numeric then 'C'
    else 'D' end
  from (select app.setting(p_company, 'grade_bands') as b) s
$$;

------------------------------------------------------------------
-- 6. Category application (REG-03, REG-04)
------------------------------------------------------------------
create table public.category_application (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.company (id),
  vendor_id   uuid not null references public.vendor (id) on delete cascade,
  category_id uuid not null references public.category (id) on delete restrict,
  status      text not null default 'PENDING' check (status in ('PENDING', 'QUALIFIED', 'REJECTED', 'EXPIRED')),
  valid_until date,
  reason      text,
  decided_by  uuid references public.app_user (id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  check ((status in ('QUALIFIED', 'EXPIRED')) = (valid_until is not null))
);
create unique index category_application_open_key on public.category_application (vendor_id, category_id)
  where status in ('PENDING', 'QUALIFIED');
create index category_application_category_idx on public.category_application (category_id, status);

create trigger category_application_audit after insert or update of status on public.category_application
  for each row execute function app.audit_status_change('category_application');

------------------------------------------------------------------
-- 7. Standing, grade and AVL, checked on read (the daily job only tidies statuses)
------------------------------------------------------------------
create function app.vendor_is_active(p_vendor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vendor v where v.id = p_vendor and v.status = 'APPROVED'
                 and (v.standing = 'ACTIVE' or (v.standing = 'HOLD' and app.today() >= v.standing_until)))
$$;

-- Latest graded attempt that is still valid, or null.
create function app.vendor_grade(p_vendor uuid) returns text
language sql stable security definer set search_path = '' as $$
  select r.grade from public.questionnaire_response r
  where r.vendor_id = p_vendor and r.status = 'GRADED' and r.valid_until >= app.today()
  order by r.attempt_no desc limit 1
$$;

create function app.is_in_avl(p_vendor uuid, p_category uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.vendor_is_active(p_vendor)
     and coalesce(app.vendor_grade(p_vendor) in ('A', 'B', 'C'), false)
     and exists (select 1 from public.category_application a
                 where a.vendor_id = p_vendor and a.status = 'QUALIFIED' and a.valid_until >= app.today()
                   and a.category_id in (select app.category_ancestors(p_category)))
$$;

------------------------------------------------------------------
-- 8. Row-level security
------------------------------------------------------------------
-- Dictionaries and categories: every signed-in user of the company reads (vendors need the
-- dropdowns and the tree); the Admin writes. Items: internal users read.
alter table public.incoterm enable row level security;
create policy incoterm_select on public.incoterm for select to authenticated using (true);
create policy incoterm_admin_update on public.incoterm for update to authenticated
  using ((select app.has_role('ADMIN'))) with check ((select app.has_role('ADMIN')));
revoke insert, update, delete on public.incoterm from authenticated;
grant update (name, is_active) on public.incoterm to authenticated;  -- MDM-01 AC1: codes fixed

do $$
declare t text;
begin
  foreach t in array array['payment_term', 'delivery_place', 'delivery_mode', 'category'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %1$s_select on public.%1$I for select to authenticated
                     using (company_id = (select app.current_company_id()))$p$, t);
    execute format($p$create policy %1$s_admin_write on public.%1$I for all to authenticated
                     using ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()))
                     with check ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()))$p$, t);
  end loop;
end $$;

alter table public.item enable row level security;
create policy item_select on public.item for select to authenticated
  using ((select app.is_internal()) and company_id = (select app.current_company_id()));
create policy item_admin_write on public.item for all to authenticated
  using ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()))
  with check ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()));

-- Vendor: own row, or PS / CM / Admin of the company. Created only by public.register_vendor
-- (server). The vendor edits its own fields; status, standing and review fields only via functions.
alter table public.vendor enable row level security;
create policy vendor_select on public.vendor for select to authenticated
  using (id = (select app.current_vendor_id())
         or ((select app.can_view_vendors()) and company_id = (select app.current_company_id())));
create policy vendor_update_own on public.vendor for update to authenticated
  using (id = (select app.current_vendor_id())) with check (id = (select app.current_vendor_id()));
revoke insert, update, delete on public.vendor from authenticated;
grant update (vendor_type, legal_name, voen, foreign_tax_number, country_code, id_card_number, legal_address,
              director_name, is_vat_payer, contact_person, phone, founded_on,
              main_activity, main_goods, bank_guarantee_available, bank_guarantee_types,
              bank_guarantee_max, bank_guarantee_currency)
  on public.vendor to authenticated;  -- contact_email stays equal to the sign-in e-mail

alter table public.vendor_owner enable row level security;
create policy vendor_owner_select on public.vendor_owner for select to authenticated
  using (vendor_id = (select app.current_vendor_id())
         or ((select app.can_view_vendors()) and exists (
              select 1 from public.vendor v where v.id = vendor_owner.vendor_id
                and v.company_id = (select app.current_company_id()))));
create policy vendor_owner_write_own on public.vendor_owner for all to authenticated
  using (vendor_id = (select app.current_vendor_id()) and app.vendor_registration_editable(vendor_id))
  with check (vendor_id = (select app.current_vendor_id()) and app.vendor_registration_editable(vendor_id));

-- Bank accounts: read like owners; written only through public.register_vendor and
-- public.bank_accounts_save, which replace the whole list in one transaction.
alter table public.vendor_bank_account enable row level security;
create policy vendor_bank_account_select on public.vendor_bank_account for select to authenticated
  using (vendor_id = (select app.current_vendor_id())
         or ((select app.can_view_vendors()) and exists (
              select 1 from public.vendor v where v.id = vendor_bank_account.vendor_id
                and v.company_id = (select app.current_company_id()))));
revoke insert, update, delete on public.vendor_bank_account from authenticated;

-- Brands and certificates: the vendor keeps them at any time (REG-06 AC3, AC4).
do $$
declare t text;
begin
  foreach t in array array['vendor_brand', 'vendor_certificate'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %1$s_select on public.%1$I for select to authenticated
      using (vendor_id = (select app.current_vendor_id())
             or ((select app.can_view_vendors()) and exists (
                  select 1 from public.vendor v where v.id = %1$I.vendor_id
                    and v.company_id = (select app.current_company_id()))))$p$, t);
    execute format($p$create policy %1$s_write_own on public.%1$I for all to authenticated
      using (vendor_id = (select app.current_vendor_id()))
      with check (vendor_id = (select app.current_vendor_id()))$p$, t);
  end loop;
end $$;
revoke update on public.vendor_certificate from authenticated;
grant update (type, number, issuer, issued_on, expires_on) on public.vendor_certificate to authenticated;

-- Which vendor a file owner belongs to (null when the owner is not a vendor record).
create function app.file_owner_vendor(p_owner_type text, p_owner_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case p_owner_type
    when 'vendor'               then p_owner_id
    when 'vendor_brand'         then (select b.vendor_id from public.vendor_brand b where b.id = p_owner_id)
    when 'vendor_certificate'   then (select c.vendor_id from public.vendor_certificate c where c.id = p_owner_id)
    when 'questionnaire_answer' then (select r.vendor_id from public.questionnaire_answer a
                                      join public.questionnaire_response r on r.id = a.response_id where a.id = p_owner_id)
    when 'category_application' then (select a.vendor_id from public.category_application a where a.id = p_owner_id)
  end
$$;

-- Replaced in the procurement migration with the sourcing / proposal / PO rules.
create function app.can_read_file(p_owner_type text, p_owner_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_owner_type in ('vendor', 'vendor_brand', 'vendor_certificate', 'questionnaire_answer', 'category_application')
      then coalesce(app.file_owner_vendor(p_owner_type, p_owner_id) = app.current_vendor_id(), false)
           or app.can_view_vendors()
    else false
  end
$$;

alter table public.file enable row level security;
create policy file_select on public.file for select to authenticated
  using (company_id = (select app.current_company_id()) and app.can_read_file(owner_type, owner_id));
revoke insert, update, delete on public.file from authenticated;  -- written by the server only

-- Questionnaire: Admin builds it; PS / CM / Admin read it. Vendors never read points or scores
-- directly; they use public.vendor_questionnaire() and public.questionnaire_save().
alter table public.questionnaire_question enable row level security;
create policy questionnaire_question_select on public.questionnaire_question for select to authenticated
  using ((select app.can_view_vendors()) and company_id = (select app.current_company_id()));
create policy questionnaire_question_admin_write on public.questionnaire_question for all to authenticated
  using ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()))
  with check ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()));

alter table public.questionnaire_option enable row level security;
create policy questionnaire_option_select on public.questionnaire_option for select to authenticated
  using ((select app.can_view_vendors()) and exists (
           select 1 from public.questionnaire_question q where q.id = questionnaire_option.question_id
             and q.company_id = (select app.current_company_id())));
create policy questionnaire_option_admin_write on public.questionnaire_option for all to authenticated
  using ((select app.has_role('ADMIN')) and exists (
           select 1 from public.questionnaire_question q where q.id = questionnaire_option.question_id
             and q.company_id = (select app.current_company_id())))
  with check ((select app.has_role('ADMIN')) and exists (
           select 1 from public.questionnaire_question q where q.id = questionnaire_option.question_id
             and q.company_id = (select app.current_company_id())));

-- The vendor reads its own attempts (score and grade are empty until GRADED).
alter table public.questionnaire_response enable row level security;
create policy questionnaire_response_select on public.questionnaire_response for select to authenticated
  using (vendor_id = (select app.current_vendor_id())
         or ((select app.can_view_vendors()) and company_id = (select app.current_company_id())));
revoke insert, update, delete on public.questionnaire_response from authenticated;

alter table public.questionnaire_answer enable row level security;
create policy questionnaire_answer_select on public.questionnaire_answer for select to authenticated
  using ((select app.can_view_vendors()) and exists (
           select 1 from public.questionnaire_response r where r.id = questionnaire_answer.response_id
             and r.company_id = (select app.current_company_id())));
revoke insert, update, delete on public.questionnaire_answer from authenticated;

alter table public.category_application enable row level security;
create policy category_application_select on public.category_application for select to authenticated
  using (vendor_id = (select app.current_vendor_id())
         or ((select app.can_view_vendors()) and company_id = (select app.current_company_id())));
revoke insert, update, delete on public.category_application from authenticated;

-- History (PLT-02 AC5): vendor records for their vendor and for PS / CM / Admin.
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
    when p_record_type in ('invitation', 'proposal') then false  -- procurement migration
    else app.is_internal()
  end
$$;

------------------------------------------------------------------
-- 9. Functions the screens call (RPC). Each checks the caller's role and the transition.
------------------------------------------------------------------

-- REG-01: called by the server with the secret key after it created the Auth user with
-- email_confirm = true (no confirmation e-mail). The single buying company owns the vendor.
-- REG-01 AC4, REG-06 AC3: replaces the vendor's bank accounts; the constraint trigger checks
-- "at least one" and "exactly one main" at commit.
create function app.replace_bank_accounts(p_vendor uuid, p_accounts jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(coalesce(p_accounts, 'null')) <> 'array' or jsonb_array_length(p_accounts) = 0 then
    perform app.fail('errors.bankAccountRequired');
  end if;
  -- the same messages as the form, instead of a unique or check violation
  if exists (select 1 from jsonb_populate_recordset(null::public.vendor_bank_account, p_accounts) a
             where coalesce(btrim(a.bank_name), '') = '' or coalesce(btrim(a.swift), '') = ''
                or coalesce(a.currency, '') !~ '^[A-Za-z]{3}$') then
    perform app.fail('errors.bankAccountIncomplete');
  end if;
  if exists (select 1 from jsonb_populate_recordset(null::public.vendor_bank_account, p_accounts) a
             where upper(regexp_replace(coalesce(a.iban, ''), '\s', '', 'g')) !~ '^[A-Z0-9]{1,34}$') then
    perform app.fail('errors.ibanFormat');
  end if;
  if (select count(*) from jsonb_populate_recordset(null::public.vendor_bank_account, p_accounts) a
      where a.is_main) <> 1 then
    perform app.fail('errors.mainAccountOne');
  end if;
  delete from public.vendor_bank_account where vendor_id = p_vendor;
  insert into public.vendor_bank_account (vendor_id, bank_name, iban, swift, currency, is_main)
  select p_vendor, btrim(a.bank_name), upper(regexp_replace(a.iban, '\s', '', 'g')),
         upper(regexp_replace(a.swift, '\s', '', 'g')), upper(a.currency), coalesce(a.is_main, false)
  from jsonb_populate_recordset(null::public.vendor_bank_account, p_accounts) a;
end $$;

create function public.register_vendor(p_user_id uuid, p_vendor jsonb, p_owners jsonb default '[]',
                                       p_accounts jsonb default '[]')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  v_row     public.vendor;
  v_id      uuid;
begin
  select id into v_company from public.company order by created_at limit 1;
  v_row := jsonb_populate_record(null::public.vendor, p_vendor);
  insert into public.vendor (company_id, vendor_type, legal_name, voen, foreign_tax_number, country_code,
                             id_card_number, legal_address, director_name, is_vat_payer, contact_person,
                             contact_email, phone, founded_on)
  values (v_company, v_row.vendor_type, v_row.legal_name, v_row.voen, v_row.foreign_tax_number,
          v_row.country_code, v_row.id_card_number, v_row.legal_address, v_row.director_name,
          v_row.is_vat_payer, v_row.contact_person, lower(v_row.contact_email), v_row.phone,
          v_row.founded_on)
  returning id into v_id;

  insert into public.vendor_owner (vendor_id, full_name, id_number, share_percent, role)
  select v_id, o.full_name, o.id_number, o.share_percent, o.role
  from jsonb_populate_recordset(null::public.vendor_owner, coalesce(p_owners, '[]')) o;

  perform app.replace_bank_accounts(v_id, p_accounts);

  insert into public.app_user (id, company_id, vendor_id, full_name, email)
  values (p_user_id, v_company, v_id, v_row.contact_person, lower(v_row.contact_email));
  insert into public.user_role (user_id, role) values (p_user_id, 'VENDOR');
  return v_id;
end $$;

-- REG-01 AC7 check before the Auth user is created (server only).
create function public.vendor_tax_number_taken(p_voen text, p_foreign_tax_number text, p_except uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vendor v
                 where v.id is distinct from p_except
                   and ((p_voen is not null and v.voen = p_voen)
                     or (p_foreign_tax_number is not null
                         and upper(btrim(v.foreign_tax_number)) = upper(btrim(p_foreign_tax_number)))))
$$;

create function app.has_file(p_owner_type text, p_owner_id uuid, p_kind text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.file f
                 where f.owner_type = p_owner_type and f.owner_id = p_owner_id
                   and (p_kind is null or f.kind = p_kind))
$$;

-- REG-01 AC10, REG-02 AC4: DRAFT or RETURNED -> SUBMITTED
create function public.registration_submit() returns void
language plpgsql security definer set search_path = '' as $$
declare v public.vendor;
begin
  select * into v from public.vendor where id = app.current_vendor_id() for update;
  if v.id is null then perform app.fail('errors.noAccess'); end if;
  if v.status not in ('DRAFT', 'RETURNED') then perform app.fail('errors.registrationReadOnly'); end if;

  if v.vendor_type = 'LOCAL_COMPANY' and not app.has_file('vendor', v.id, 'charter') then
    perform app.fail('errors.uploadCharter');
  elsif v.vendor_type = 'INDIVIDUAL' and not app.has_file('vendor', v.id, 'id_card') then
    perform app.fail('errors.uploadIdCard');
  elsif v.vendor_type = 'FOREIGN_COMPANY' and not app.has_file('vendor', v.id, 'registration_certificate') then
    perform app.fail('errors.uploadRegistrationCertificate');
  end if;
  if v.is_vat_payer and not app.has_file('vendor', v.id, 'vat_certificate') then
    perform app.fail('errors.uploadVatCertificate');                                 -- REG-01 AC8
  end if;
  if v.vendor_type <> 'INDIVIDUAL' then                                              -- REG-06 AC1
    if v.founded_on is null then perform app.fail('errors.foundedOnRequired'); end if;
    if not exists (select 1 from public.vendor_owner o where o.vendor_id = v.id and o.role = 'HEAD') then
      perform app.fail('errors.headOwnerRequired');
    end if;
  end if;

  update public.vendor set status = 'SUBMITTED', submitted_at = now() where id = v.id;
  perform app.notify(app.active_user_ids(v.company_id, 'PROCUREMENT_SPECIALIST'), 'registration.submitted',
                     'vendor', v.id, v.legal_name, jsonb_build_object('vendorType', v.vendor_type));
end $$;

-- REG-01 AC4 (registration form) and REG-06 AC3 (Profile, at any time): the vendor's own accounts.
create function public.bank_accounts_save(p_accounts jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_vendor uuid := app.current_vendor_id();
begin
  if v_vendor is null then perform app.fail('errors.noAccess'); end if;
  perform app.replace_bank_accounts(v_vendor, p_accounts);
end $$;

-- REG-02 AC2, AC3, AC5: SUBMITTED -> APPROVED | RETURNED | REJECTED
create function public.registration_decide(p_vendor uuid, p_decision text, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v        public.vendor;
  v_status text := case p_decision when 'APPROVE' then 'APPROVED' when 'RETURN' then 'RETURNED'
                                   when 'REJECT' then 'REJECTED' end;
begin
  if not app.has_role('PROCUREMENT_SPECIALIST') then perform app.fail('errors.noAccess'); end if;
  select * into v from public.vendor where id = p_vendor and company_id = app.current_company_id() for update;
  if v.id is null or v_status is null then perform app.fail('errors.noAccess'); end if;
  if v.status <> 'SUBMITTED' then perform app.fail('errors.statusChanged'); end if;
  if v_status <> 'APPROVED' and nullif(btrim(p_comment), '') is null then
    perform app.fail(case v_status when 'RETURNED' then 'errors.commentRequired' else 'errors.reasonRequired' end);
  end if;

  perform set_config('app.audit_reason', coalesce(btrim(p_comment), ''), true);
  update public.vendor
     set status = v_status,
         review_comment = case when v_status = 'APPROVED' then review_comment else btrim(p_comment) end,
         standing = case when v_status = 'APPROVED' then 'ACTIVE' else standing end
   where id = v.id;
  perform app.notify(app.vendor_user_ids(v.id), 'registration.' || lower(v_status), 'vendor', v.id, v.legal_name,
                     jsonb_build_object('comment', btrim(p_comment)));
end $$;

-- REG-05 AC2, AC7, AC8: start an attempt. Allowed with an APPROVED registration, active standing,
-- no open attempt, and no valid A-C grade (first attempt, after a D, after expiry) or a valid grade
-- in its last 30 days.
create function public.questionnaire_start() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v    public.vendor;
  v_id uuid;
begin
  select * into v from public.vendor where id = app.current_vendor_id() for update;
  if v.id is null then perform app.fail('errors.noAccess'); end if;
  if v.status <> 'APPROVED' then perform app.fail('errors.registrationNotApproved'); end if;
  if not app.vendor_is_active(v.id) then perform app.fail('errors.vendorOnHold'); end if;
  select id into v_id from public.questionnaire_response
   where vendor_id = v.id and status in ('DRAFT', 'SUBMITTED', 'RETURNED');
  if v_id is not null then return v_id; end if;
  if exists (select 1 from public.questionnaire_response g
             where g.vendor_id = v.id and g.status = 'GRADED' and g.grade in ('A', 'B', 'C')
               and g.valid_until - app.today() > 30) then
    perform app.fail('errors.gradeStillValid');
  end if;
  if not exists (select 1 from public.questionnaire_question q where q.company_id = v.company_id and q.is_active) then
    perform app.fail('errors.questionnaireEmpty');
  end if;
  if v.standing = 'HOLD' then  -- the hold period is over (checked above)
    perform set_config('app.audit_reason', '', true);
    update public.vendor set standing = 'ACTIVE', standing_until = null, standing_reason = null where id = v.id;
  end if;

  insert into public.questionnaire_response (company_id, vendor_id, attempt_no)
  values (v.company_id, v.id,
          coalesce((select max(attempt_no) from public.questionnaire_response where vendor_id = v.id), 0) + 1)
  returning id into v_id;
  insert into public.questionnaire_answer (response_id, question_id, weight, max_points)
  select v_id, q.id, q.weight, coalesce((select max(o.points) from public.questionnaire_option o
                                         where o.question_id = q.id), 0)
  from public.questionnaire_question q where q.company_id = v.company_id and q.is_active;
  return v_id;
end $$;

-- The vendor's view of its attempt: questions and option labels, never points.
create function public.vendor_questionnaire(p_response uuid)
returns table (answer_id uuid, question_id uuid, section text, question_text text, answer_type text,
               evidence_required boolean, sort_order integer, option_id uuid, options jsonb)
language sql stable security definer set search_path = '' as $$
  select a.id, q.id, q.section, q.text, q.answer_type, q.evidence_required, q.sort_order, a.option_id,
         (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.sort_order), '[]')
          from public.questionnaire_option o where o.question_id = q.id)
  from public.questionnaire_answer a
  join public.questionnaire_response r on r.id = a.response_id
  join public.questionnaire_question q on q.id = a.question_id
  where r.id = p_response and r.vendor_id = app.current_vendor_id()
  order by q.sort_order, q.text
$$;

-- REG-05 AC2: save answers as DRAFT. p_answers = [{ "questionId": uuid, "optionId": uuid | null }]
create function public.questionnaire_save(p_response uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.questionnaire_response;
begin
  select * into r from public.questionnaire_response
   where id = p_response and vendor_id = app.current_vendor_id() for update;
  if r.id is null then perform app.fail('errors.noAccess'); end if;
  if r.status not in ('DRAFT', 'RETURNED') then perform app.fail('errors.questionnaireReadOnly'); end if;
  update public.questionnaire_answer a
     set option_id = x."optionId",
         points_awarded = coalesce((select o.points from public.questionnaire_option o
                                    where o.id = x."optionId" and o.question_id = a.question_id), 0),
         adjust_comment = null
    from jsonb_to_recordset(p_answers) as x("questionId" uuid, "optionId" uuid)
   where a.response_id = r.id and a.question_id = x."questionId";
end $$;

-- REG-05 AC3: complete attempt -> SUBMITTED (the score is calculated live for the specialist).
create function public.questionnaire_submit(p_response uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r      public.questionnaire_response;
  v_name text;
begin
  select * into r from public.questionnaire_response
   where id = p_response and vendor_id = app.current_vendor_id() for update;
  if r.id is null then perform app.fail('errors.noAccess'); end if;
  if r.status not in ('DRAFT', 'RETURNED') then perform app.fail('errors.questionnaireReadOnly'); end if;
  if exists (select 1 from public.questionnaire_answer a where a.response_id = r.id and a.option_id is null) then
    perform app.fail('errors.answerEveryQuestion');
  end if;
  if exists (select 1 from public.questionnaire_answer a join public.questionnaire_question q on q.id = a.question_id
             where a.response_id = r.id and q.evidence_required
               and not app.has_file('questionnaire_answer', a.id)) then
    perform app.fail('errors.attachEvidence');
  end if;
  update public.questionnaire_response set status = 'SUBMITTED', submitted_at = now() where id = r.id;
  select legal_name into v_name from public.vendor where id = r.vendor_id;
  perform app.notify(app.active_user_ids(r.company_id, 'PROCUREMENT_SPECIALIST'), 'questionnaire.submitted',
                     'questionnaire_response', r.id, v_name, '{}');
end $$;

-- REG-05 AC4: the specialist changes an answer's points, only with a comment.
create function public.questionnaire_adjust(p_answer uuid, p_points integer, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  if not app.has_role('PROCUREMENT_SPECIALIST') then perform app.fail('errors.noAccess'); end if;
  select qa.id, qa.max_points, r.status into a
    from public.questionnaire_answer qa join public.questionnaire_response r on r.id = qa.response_id
   where qa.id = p_answer and r.company_id = app.current_company_id() for update of qa;
  if a.id is null then perform app.fail('errors.noAccess'); end if;
  if a.status <> 'SUBMITTED' then perform app.fail('errors.statusChanged'); end if;
  if nullif(btrim(p_comment), '') is null then perform app.fail('errors.commentRequired'); end if;
  if p_points is null or p_points < 0 or p_points > a.max_points then perform app.fail('errors.pointsOutOfRange'); end if;
  update public.questionnaire_answer set points_awarded = p_points, adjust_comment = btrim(p_comment) where id = a.id;
end $$;

-- REG-05 AC5-AC7: SUBMITTED -> GRADED (with the D rule) | RETURNED
create function public.questionnaire_decide(p_response uuid, p_decision text, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r       public.questionnaire_response;
  v_score numeric;
  v_grade text;
  v_until date;
  v_prev  text;
  v_name  text;
begin
  if not app.has_role('PROCUREMENT_SPECIALIST') then perform app.fail('errors.noAccess'); end if;
  select * into r from public.questionnaire_response
   where id = p_response and company_id = app.current_company_id() for update;
  if r.id is null or p_decision not in ('CONFIRM', 'RETURN') then perform app.fail('errors.noAccess'); end if;
  if r.status <> 'SUBMITTED' then perform app.fail('errors.statusChanged'); end if;
  select legal_name into v_name from public.vendor where id = r.vendor_id;

  if p_decision = 'RETURN' then
    if nullif(btrim(p_comment), '') is null then perform app.fail('errors.commentRequired'); end if;
    perform set_config('app.audit_reason', btrim(p_comment), true);
    update public.questionnaire_response
       set status = 'RETURNED', review_comment = btrim(p_comment), reviewed_by = auth.uid(), reviewed_at = now()
     where id = r.id;
    perform app.notify(app.vendor_user_ids(r.vendor_id), 'questionnaire.returned', 'questionnaire_response',
                       r.id, v_name, jsonb_build_object('comment', btrim(p_comment)));
    return;
  end if;

  v_score := app.questionnaire_score(r.id);
  v_grade := app.grade_for(r.company_id, v_score);
  v_until := (app.today() + make_interval(
               months => (app.setting(r.company_id, 'qualification_months') #>> '{}')::integer))::date;
  -- REG-05 AC8: a new grade replaces an earlier one that is still valid.
  perform set_config('app.audit_reason', 'Replaced by a new grade', true);
  update public.questionnaire_response set status = 'EXPIRED'
   where vendor_id = r.vendor_id and status = 'GRADED' and id <> r.id;

  perform set_config('app.audit_reason', coalesce(btrim(p_comment), ''), true);
  update public.questionnaire_response
     set status = 'GRADED', score = v_score, grade = v_grade, valid_until = v_until,
         review_comment = nullif(btrim(p_comment), ''), reviewed_by = auth.uid(), reviewed_at = now()
   where id = r.id;

  -- D rule: a second consecutive D puts the vendor on HOLD for d_block_months (Calculation Rules).
  if v_grade = 'D' then
    select grade into v_prev from public.questionnaire_response
     where vendor_id = r.vendor_id and attempt_no < r.attempt_no and grade is not null
     order by attempt_no desc limit 1;
    if v_prev = 'D' then
      perform set_config('app.audit_reason', 'Second consecutive D grade', true);
      update public.vendor
         set standing = 'HOLD', standing_reason = 'Second consecutive D grade',
             standing_until = (app.today() + make_interval(
               months => (app.setting(r.company_id, 'd_block_months') #>> '{}')::integer))::date
       where id = r.vendor_id;
    end if;
  end if;

  perform app.notify(app.vendor_user_ids(r.vendor_id), 'questionnaire.graded', 'questionnaire_response', r.id,
                     v_name, jsonb_build_object('grade', v_grade, 'score', v_score, 'validUntil', v_until));
end $$;

-- REG-03 AC1-AC4: one PENDING application per call. The server uploads a licence file first with
-- owner_id = p_application_id when the category (or a parent) requires one.
create function public.category_apply(p_category uuid, p_application_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.vendor;
  c public.category;
begin
  select * into v from public.vendor where id = app.current_vendor_id();
  if v.id is null then perform app.fail('errors.noAccess'); end if;
  if v.status <> 'APPROVED' then perform app.fail('errors.registrationNotApproved'); end if;   -- REG-02 AC6
  if not app.vendor_is_active(v.id) or not coalesce(app.vendor_grade(v.id) in ('A', 'B', 'C'), false) then
    perform app.fail('errors.questionnaireFirst');
  end if;
  select * into c from public.category where id = p_category and company_id = v.company_id and is_active;
  if c.id is null then perform app.fail('errors.noAccess'); end if;
  if app.category_needs_licence(c.id) and not app.has_file('category_application', p_application_id, 'licence') then
    perform app.fail('errors.licenceRequired');                                                -- REG-03 AC2
  end if;

  -- read-time expiry (REG-04 AC3), so an expired qualification does not block a new application
  update public.category_application set status = 'EXPIRED'
   where vendor_id = v.id and category_id = c.id and status = 'QUALIFIED' and valid_until < app.today();
  if exists (select 1 from public.category_application
             where vendor_id = v.id and category_id = c.id and status in ('PENDING', 'QUALIFIED')) then
    perform app.fail('errors.alreadyApplied');                                                 -- REG-03 AC3
  end if;

  insert into public.category_application (id, company_id, vendor_id, category_id)
  values (p_application_id, v.company_id, v.id, c.id);
  perform app.notify(app.active_user_ids(v.company_id, 'PROCUREMENT_SPECIALIST'), 'category.applied',
                     'category_application', p_application_id, v.legal_name,
                     jsonb_build_object('category', c.name));
end $$;

-- REG-04 AC1, AC2: PENDING -> QUALIFIED | REJECTED
create function public.category_decide(p_application uuid, p_decision text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a       public.category_application;
  v_until date;
  v_name  text;
  v_cat   text;
begin
  if not app.has_role('PROCUREMENT_SPECIALIST') then perform app.fail('errors.noAccess'); end if;
  select * into a from public.category_application
   where id = p_application and company_id = app.current_company_id() for update;
  if a.id is null or p_decision not in ('QUALIFY', 'REJECT') then perform app.fail('errors.noAccess'); end if;
  if a.status <> 'PENDING' then perform app.fail('errors.statusChanged'); end if;
  if p_decision = 'REJECT' and nullif(btrim(p_reason), '') is null then perform app.fail('errors.reasonRequired'); end if;
  select legal_name into v_name from public.vendor where id = a.vendor_id;
  select name into v_cat from public.category where id = a.category_id;

  perform set_config('app.audit_reason', coalesce(btrim(p_reason), ''), true);
  if p_decision = 'QUALIFY' then
    v_until := (app.today() + make_interval(
                 months => (app.setting(a.company_id, 'qualification_months') #>> '{}')::integer))::date;
    update public.category_application
       set status = 'QUALIFIED', valid_until = v_until, decided_by = auth.uid(), decided_at = now() where id = a.id;
    perform app.notify(app.vendor_user_ids(a.vendor_id), 'category.qualified', 'category_application', a.id,
                       v_name, jsonb_build_object('category', v_cat, 'validUntil', v_until));
  else
    update public.category_application
       set status = 'REJECTED', reason = btrim(p_reason), decided_by = auth.uid(), decided_at = now() where id = a.id;
    perform app.notify(app.vendor_user_ids(a.vendor_id), 'category.rejected', 'category_application', a.id,
                       v_name, jsonb_build_object('category', v_cat, 'reason', btrim(p_reason)));
  end if;
end $$;

-- REG-04 AC4, REG-06 AC9: AVL of a category (PS, Admin). The page filters these rows further
-- on activity, brand, bank guarantee and certificate type.
create function public.avl_list(p_category uuid)
returns table (vendor_id uuid, legal_name text, vendor_type text, country_code text, grade text,
               grade_valid_until date, valid_until date, main_activity text,
               bank_guarantee_available boolean)
language sql stable security definer set search_path = '' as $$
  select v.id, v.legal_name, v.vendor_type, v.country_code, app.vendor_grade(v.id),
         (select max(r.valid_until) from public.questionnaire_response r
           where r.vendor_id = v.id and r.status = 'GRADED' and r.valid_until >= app.today()),
         (select max(a.valid_until) from public.category_application a
           where a.vendor_id = v.id and a.status = 'QUALIFIED' and a.valid_until >= app.today()
             and a.category_id in (select app.category_ancestors(p_category))),
         v.main_activity, v.bank_guarantee_available
  from public.vendor v
  where app.has_any_role(array['PROCUREMENT_SPECIALIST', 'ADMIN']::public.app_role[])
    and v.company_id = app.current_company_id()
    and app.is_in_avl(v.id, p_category)
  order by v.legal_name
$$;

-- REG-06 AC8: other vendors sharing an owner ID (internal viewers only).
create function public.vendor_shared_owners(p_vendor uuid)
returns table (vendor_id uuid, legal_name text)
language sql stable security definer set search_path = '' as $$
  select distinct v2.id, v2.legal_name
  from public.vendor_owner o1
  join public.vendor_owner o2 on upper(btrim(o2.id_number)) = upper(btrim(o1.id_number)) and o2.vendor_id <> o1.vendor_id
  join public.vendor v2 on v2.id = o2.vendor_id
  where o1.vendor_id = p_vendor and app.can_view_vendors() and v2.company_id = app.current_company_id()
$$;

------------------------------------------------------------------
-- 10. Certificates: reminders at once on save and daily (REG-06 AC5)
------------------------------------------------------------------
create function app.check_certificate(p_certificate uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c        record;
  v_status text;
  v_to     uuid[];
begin
  select vc.id, vc.vendor_id, vc.type, vc.expires_on, vc.reminder_sent_at, vc.expired_notified_at,
         v.company_id, v.legal_name into c
    from public.vendor_certificate vc join public.vendor v on v.id = vc.vendor_id
   where vc.id = p_certificate for update of vc;
  if c.id is null then return; end if;
  v_status := app.certificate_status(c.expires_on);
  v_to := app.vendor_user_ids(c.vendor_id) || app.active_user_ids(c.company_id, 'PROCUREMENT_SPECIALIST');
  if v_status = 'EXPIRING' and c.reminder_sent_at is null then
    update public.vendor_certificate set reminder_sent_at = now() where id = c.id;
    perform app.notify(v_to, 'certificate.expiring', 'vendor', c.vendor_id, c.legal_name,
                       jsonb_build_object('type', c.type, 'vendor', c.legal_name, 'expiresOn', c.expires_on));
  elsif v_status = 'EXPIRED' and c.expired_notified_at is null then
    update public.vendor_certificate
       set expired_notified_at = now(), reminder_sent_at = coalesce(reminder_sent_at, now()) where id = c.id;
    perform app.notify(v_to, 'certificate.expired', 'vendor', c.vendor_id, c.legal_name,
                       jsonb_build_object('type', c.type, 'vendor', c.legal_name));
  end if;
end $$;

-- A renewed expiry date starts the reminders again.
create function app.reset_certificate_reminders() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.expires_on is distinct from old.expires_on then
    new.reminder_sent_at := null;
    new.expired_notified_at := null;
  end if;
  return new;
end $$;
create trigger vendor_certificate_reset before update on public.vendor_certificate
  for each row execute function app.reset_certificate_reminders();

create function app.on_certificate_saved() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.check_certificate(new.id);
  return null;
end $$;
create trigger vendor_certificate_check after insert or update of expires_on on public.vendor_certificate
  for each row execute function app.on_certificate_saved();

------------------------------------------------------------------
-- 11. Daily job, 00:05 Asia/Baku (20:05 UTC). Reads already apply the dates; this tidies
--     statuses (audit entries by System) and sends certificate notices.
------------------------------------------------------------------
create function app.run_daily_jobs() returns void
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  perform set_config('app.audit_reason', '', true);
  update public.category_application set status = 'EXPIRED'
   where status = 'QUALIFIED' and valid_until < app.today();                        -- REG-04 AC3
  update public.questionnaire_response set status = 'EXPIRED'
   where status = 'GRADED' and valid_until < app.today();                           -- REG-05 AC8
  update public.vendor set standing = 'ACTIVE', standing_until = null, standing_reason = null
   where standing = 'HOLD' and standing_until <= app.today();                       -- hold period ends
  for c in select id from public.vendor_certificate
            where expires_on is not null
              and ((reminder_sent_at is null and expires_on - app.today() <= 30)
                or (expired_notified_at is null and expires_on < app.today())) loop
    perform app.check_certificate(c.id);
  end loop;
end $$;

select cron.schedule('vms-daily', '5 20 * * *', 'select app.run_daily_jobs()');

------------------------------------------------------------------
-- 12. Grants. New public functions are executable by anon by default: revoke, then grant.
------------------------------------------------------------------
revoke all on public.incoterm, public.payment_term, public.delivery_place, public.delivery_mode, public.category,
              public.item, public.vendor, public.vendor_owner, public.vendor_bank_account, public.vendor_brand,
              public.vendor_certificate, public.file, public.questionnaire_question, public.questionnaire_option, public.questionnaire_response,
              public.questionnaire_answer, public.category_application from anon;

revoke execute on all functions in schema app from public, anon, authenticated, service_role;
grant execute on function app.current_company_id(), app.has_role(public.app_role), app.is_internal(),
                          app.can_read_record(text, uuid), app.has_any_role(public.app_role[]),
                          app.can_view_vendors(), app.current_vendor_id(), app.vendor_registration_editable(uuid),
                          app.can_read_file(text, uuid), app.today(), app.certificate_status(date)
  to authenticated;
-- app.fail only raises an error key; triggers that run as the signed-in user (vendor guard) call it.
grant execute on function app.fail(text) to authenticated;

revoke execute on function public.register_vendor(uuid, jsonb, jsonb, jsonb), public.vendor_tax_number_taken(text, text, uuid),
  public.registration_submit(), public.bank_accounts_save(jsonb), public.registration_decide(uuid, text, text),
  public.questionnaire_start(),
  public.vendor_questionnaire(uuid), public.questionnaire_save(uuid, jsonb), public.questionnaire_submit(uuid),
  public.questionnaire_adjust(uuid, integer, text), public.questionnaire_decide(uuid, text, text),
  public.category_apply(uuid, uuid), public.category_decide(uuid, text, text), public.avl_list(uuid),
  public.vendor_shared_owners(uuid)
  from public, anon;
revoke execute on function public.register_vendor(uuid, jsonb, jsonb, jsonb), public.vendor_tax_number_taken(text, text, uuid)
  from authenticated;  -- server only (secret key)
