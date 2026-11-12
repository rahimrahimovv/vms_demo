-- Slice 2b: short account form + registration in steps (REG-01, REG-07, REG-06 AC3 / AC6 / AC7).
-- vendor_contact (RLS in this migration), file kind proof_of_authority, draft-friendly bank accounts,
-- register_vendor without owners and accounts, registration_submit with the step rules,
-- contact-person functions. "Incomplete registrations" is a plain read of public.vendor (status DRAFT).

------------------------------------------------------------------
-- 1. vendor_contact
------------------------------------------------------------------
create table public.vendor_contact (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.company (id),
  vendor_id               uuid not null references public.vendor (id) on delete cascade,
  full_name               text not null check (btrim(full_name) <> ''),
  position               text,
  phone                   text not null check (phone ~ '^\+[0-9]{8,15}$'),
  email                   text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  is_primary              boolean not null default false,
  is_legal_representative boolean not null default false,
  created_at              timestamptz not null default now()
);
create index vendor_contact_vendor_idx on public.vendor_contact (vendor_id);
create unique index vendor_contact_primary_key on public.vendor_contact (vendor_id) where is_primary;

-- Existing vendors: the first contact person comes from the vendor row, marked primary.
insert into public.vendor_contact (company_id, vendor_id, full_name, phone, email, is_primary)
select v.company_id, v.id, v.contact_person, v.phone, v.contact_email, true
from public.vendor v
where not exists (select 1 from public.vendor_contact c where c.vendor_id = v.id and c.is_primary);

------------------------------------------------------------------
-- 2. Files: new owner type and kind
------------------------------------------------------------------
alter table public.file drop constraint file_owner_type_check;
alter table public.file add constraint file_owner_type_check check (owner_type in (
  'vendor', 'vendor_brand', 'vendor_certificate', 'vendor_contact', 'questionnaire_answer',
  'category_application', 'requisition', 'sourcing', 'proposal', 'question', 'minutes', 'purchase_order'));
alter table public.file drop constraint file_kind_check;
alter table public.file add constraint file_kind_check check (kind in (
  'charter', 'id_card', 'registration_certificate', 'vat_certificate', 'proof_of_authority', 'licence',
  'technical_document', 'justification', 'attachment', 'pdf'));

create or replace function app.file_owner_vendor(p_owner_type text, p_owner_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case p_owner_type
    when 'vendor'               then p_owner_id
    when 'vendor_brand'         then (select b.vendor_id from public.vendor_brand b where b.id = p_owner_id)
    when 'vendor_certificate'   then (select c.vendor_id from public.vendor_certificate c where c.id = p_owner_id)
    when 'vendor_contact'       then (select c.vendor_id from public.vendor_contact c where c.id = p_owner_id)
    when 'questionnaire_answer' then (select r.vendor_id from public.questionnaire_answer a
                                      join public.questionnaire_response r on r.id = a.response_id where a.id = p_owner_id)
    when 'category_application' then (select a.vendor_id from public.category_application a where a.id = p_owner_id)
  end
$$;

create or replace function app.can_read_file(p_owner_type text, p_owner_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_owner_type in ('vendor', 'vendor_brand', 'vendor_certificate', 'vendor_contact', 'questionnaire_answer',
                          'category_application')
      then coalesce(app.file_owner_vendor(p_owner_type, p_owner_id) = app.current_vendor_id(), false)
           or app.can_view_vendors()
    when p_owner_type = 'requisition' then
      exists (select 1 from public.requisition r where r.id = p_owner_id
              and (r.requester_id = auth.uid() or (app.is_internal() and r.status <> 'DRAFT')))
    when p_owner_type = 'sourcing' then app.is_internal()
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
-- 3. RLS: a vendor reads its own contacts; Procurement Specialist, Committee Member and Admin read
--    the company's. Written only through the functions below.
------------------------------------------------------------------
alter table public.vendor_contact enable row level security;
create policy vendor_contact_select on public.vendor_contact for select to authenticated
  using (vendor_id = (select app.current_vendor_id())
         or ((select app.can_view_vendors()) and company_id = (select app.current_company_id())));
revoke all on public.vendor_contact from anon;
revoke insert, update, delete on public.vendor_contact from authenticated;

------------------------------------------------------------------
-- 4. Bank accounts while the registration is being filled in (DRAFT / RETURNED): the list may be
--    empty or have no main account yet; the rules are checked at Submit. After approval the
--    strict rule of REG-06 AC3 applies as before.
------------------------------------------------------------------
create or replace function app.check_bank_accounts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_vendor uuid := coalesce(new.vendor_id, old.vendor_id);
begin
  if exists (select 1 from public.vendor v where v.id = v_vendor) then
    if app.vendor_registration_editable(v_vendor) then
      return null;
    end if;
    if not exists (select 1 from public.vendor_bank_account a where a.vendor_id = v_vendor) then
      perform app.fail('errors.bankAccountRequired');
    end if;
    if (select count(*) from public.vendor_bank_account a where a.vendor_id = v_vendor and a.is_main) <> 1 then
      perform app.fail('errors.mainAccountOne');
    end if;
  end if;
  return null;
end $$;

-- REG-07 AC5, AC8: replaces the list while DRAFT or RETURNED; the rows are already complete (the
-- server keeps incomplete rows out), an empty list is allowed. Rules are re-checked at Submit.
create function public.registration_bank_save(p_accounts jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_vendor uuid := app.current_vendor_id();
begin
  if v_vendor is null then perform app.fail('errors.noAccess'); end if;
  if not app.vendor_registration_editable(v_vendor) then perform app.fail('errors.registrationReadOnly'); end if;
  if jsonb_typeof(coalesce(p_accounts, 'null')) <> 'array' then perform app.fail('errors.bankAccountRequired'); end if;
  if exists (select 1 from jsonb_populate_recordset(null::public.vendor_bank_account, p_accounts) a
             where coalesce(btrim(a.bank_name), '') = '' or coalesce(btrim(a.swift), '') = ''
                or coalesce(a.currency, '') !~ '^[A-Za-z]{3}$') then
    perform app.fail('errors.bankAccountIncomplete');
  end if;
  if exists (select 1 from jsonb_populate_recordset(null::public.vendor_bank_account, p_accounts) a
             where upper(regexp_replace(coalesce(a.iban, ''), '\s', '', 'g')) !~ '^[A-Z0-9]{1,34}$') then
    perform app.fail('errors.ibanFormat');
  end if;
  if (select count(*) from jsonb_populate_recordset(null::public.vendor_bank_account, p_accounts) a where a.is_main) > 1 then
    perform app.fail('errors.mainAccountOne');
  end if;
  delete from public.vendor_bank_account where vendor_id = v_vendor;
  insert into public.vendor_bank_account (vendor_id, bank_name, iban, swift, currency, is_main)
  select v_vendor, btrim(a.bank_name), upper(regexp_replace(a.iban, '\s', '', 'g')),
         upper(regexp_replace(a.swift, '\s', '', 'g')), upper(a.currency), coalesce(a.is_main, false)
  from jsonb_populate_recordset(null::public.vendor_bank_account, p_accounts) a;
end $$;

------------------------------------------------------------------
-- 5. REG-01: register_vendor with the short form. Owners and accounts stay optional (default empty);
--    the first contact person is the person from the form.
------------------------------------------------------------------
create or replace function public.register_vendor(p_user_id uuid, p_vendor jsonb, p_owners jsonb default '[]',
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

  if jsonb_typeof(coalesce(p_accounts, 'null')) = 'array' and jsonb_array_length(p_accounts) > 0 then
    perform app.replace_bank_accounts(v_id, p_accounts);
  end if;

  insert into public.vendor_contact (company_id, vendor_id, full_name, phone, email, is_primary)
  values (v_company, v_id, v_row.contact_person, v_row.phone, lower(v_row.contact_email), true);

  insert into public.app_user (id, company_id, vendor_id, full_name, email)
  values (p_user_id, v_company, v_id, v_row.contact_person, lower(v_row.contact_email));
  insert into public.user_role (user_id, role) values (p_user_id, 'VENDOR');
  return v_id;
end $$;

------------------------------------------------------------------
-- 6. Contact persons (REG-07 AC4, REG-06 AC3). One row per call, so the proof files keep their owner.
--    p_proof_incoming: the server has just checked a proof file and stores it right after this call.
------------------------------------------------------------------
create function app.contact_rules_ok(p_vendor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vendor_contact c
                 where c.vendor_id = p_vendor and c.is_legal_representative
                   and app.has_file('vendor_contact', c.id, 'proof_of_authority'))
$$;

create function public.contact_save(p_id uuid, p_full_name text, p_position text, p_phone text, p_email text,
                                    p_legal boolean, p_proof_incoming boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v        public.vendor;
  c        public.vendor_contact;
  v_id     uuid;
  v_phone  text := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g');
begin
  select * into v from public.vendor where id = app.current_vendor_id() for update;
  if v.id is null then perform app.fail('errors.noAccess'); end if;
  if v.status not in ('DRAFT', 'RETURNED', 'APPROVED') then perform app.fail('errors.registrationReadOnly'); end if;
  if coalesce(btrim(p_full_name), '') = '' or coalesce(btrim(p_email), '') = '' then perform app.fail('errors.required'); end if;
  if v_phone !~ '^\+[0-9]{8,15}$' then perform app.fail('errors.phoneFormat'); end if;
  if btrim(p_email) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then perform app.fail('errors.emailInvalid'); end if;

  if p_id is not null then
    select * into c from public.vendor_contact where id = p_id and vendor_id = v.id;
    if c.id is null then perform app.fail('errors.noAccess'); end if;
  end if;
  if v.vendor_type = 'INDIVIDUAL' then p_legal := false; end if;
  if coalesce(p_legal, false) and not coalesce(p_proof_incoming, false)
     and (c.id is null or not app.has_file('vendor_contact', c.id, 'proof_of_authority')) then
    perform app.fail('errors.proofRequired');
  end if;

  if c.id is null then
    insert into public.vendor_contact (company_id, vendor_id, full_name, position, phone, email, is_legal_representative)
    values (v.company_id, v.id, btrim(p_full_name), nullif(btrim(p_position), ''), v_phone, lower(btrim(p_email)),
            coalesce(p_legal, false))
    returning id into v_id;
  else
    update public.vendor_contact
       set full_name = btrim(p_full_name), position = nullif(btrim(p_position), ''), phone = v_phone,
           email = lower(btrim(p_email)), is_legal_representative = coalesce(p_legal, false)
     where id = c.id;
    v_id := c.id;
    -- the primary contact's name and phone stay the vendor's contact person and phone;
    -- the sign-in e-mail is not touched
    if c.is_primary then
      update public.vendor set contact_person = btrim(p_full_name), phone = v_phone where id = v.id;
    end if;
    -- after approval the last legal representative with a proof file cannot be dropped
    if v.status = 'APPROVED' and v.vendor_type <> 'INDIVIDUAL' and not coalesce(p_proof_incoming, false)
       and not app.contact_rules_ok(v.id) then
      perform app.fail('errors.keepLegalRepresentative');
    end if;
  end if;
  return v_id;
end $$;

create function public.contact_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.vendor;
  c public.vendor_contact;
begin
  select * into v from public.vendor where id = app.current_vendor_id() for update;
  if v.id is null then perform app.fail('errors.noAccess'); end if;
  if v.status not in ('DRAFT', 'RETURNED', 'APPROVED') then perform app.fail('errors.registrationReadOnly'); end if;
  select * into c from public.vendor_contact where id = p_id and vendor_id = v.id;
  if c.id is null then perform app.fail('errors.noAccess'); end if;
  if c.is_primary then perform app.fail('errors.noAccess'); end if;
  delete from public.vendor_contact where id = c.id;
  if v.status = 'APPROVED' and v.vendor_type <> 'INDIVIDUAL' and not app.contact_rules_ok(v.id) then
    perform app.fail('errors.keepLegalRepresentative');   -- the error rolls the delete back
  end if;
end $$;

-- Called by the server after it swapped a proof file on an approved registration.
create function public.contact_check() returns void
language plpgsql security definer set search_path = '' as $$
declare v public.vendor;
begin
  select * into v from public.vendor where id = app.current_vendor_id();
  if v.id is null then perform app.fail('errors.noAccess'); end if;
  if v.status = 'APPROVED' and v.vendor_type <> 'INDIVIDUAL' and not app.contact_rules_ok(v.id) then
    perform app.fail('errors.keepLegalRepresentative');
  end if;
end $$;

------------------------------------------------------------------
-- 7. REG-07 AC9: Submit checks every step again on the server. The rule on legal representatives
--    applies when a registration is submitted; vendors already SUBMITTED or APPROVED are not touched.
------------------------------------------------------------------
create or replace function public.registration_submit() returns void
language plpgsql security definer set search_path = '' as $$
declare v public.vendor;
begin
  select * into v from public.vendor where id = app.current_vendor_id() for update;
  if v.id is null then perform app.fail('errors.noAccess'); end if;
  if v.status not in ('DRAFT', 'RETURNED') then perform app.fail('errors.registrationReadOnly'); end if;

  -- Company details
  if v.vendor_type = 'LOCAL_COMPANY' then
    if coalesce(btrim(v.legal_address), '') = '' or coalesce(btrim(v.director_name), '') = '' or v.is_vat_payer is null then
      perform app.fail('errors.required');
    end if;
  elsif v.vendor_type = 'FOREIGN_COMPANY' then
    if coalesce(btrim(v.legal_address), '') = '' then perform app.fail('errors.required'); end if;
  end if;
  if v.vendor_type <> 'INDIVIDUAL' then                                              -- REG-06 AC1
    if v.founded_on is null then perform app.fail('errors.foundedOnRequired'); end if;
    if not exists (select 1 from public.vendor_owner o where o.vendor_id = v.id and o.role = 'HEAD') then
      perform app.fail('errors.headOwnerRequired');
    end if;
    if not app.contact_rules_ok(v.id) then perform app.fail('errors.legalRepresentativeRequired'); end if;
  end if;

  -- Bank accounts
  if not exists (select 1 from public.vendor_bank_account a where a.vendor_id = v.id) then
    perform app.fail('errors.bankAccountRequired');
  end if;
  if (select count(*) from public.vendor_bank_account a where a.vendor_id = v.id and a.is_main) <> 1 then
    perform app.fail('errors.mainAccountOne');
  end if;

  -- Documents
  if v.vendor_type = 'LOCAL_COMPANY' and not app.has_file('vendor', v.id, 'charter') then
    perform app.fail('errors.uploadCharter');
  elsif v.vendor_type = 'INDIVIDUAL' and not app.has_file('vendor', v.id, 'id_card') then
    perform app.fail('errors.uploadIdCard');
  elsif v.vendor_type = 'FOREIGN_COMPANY' and not app.has_file('vendor', v.id, 'registration_certificate') then
    perform app.fail('errors.uploadRegistrationCertificate');
  end if;
  if v.is_vat_payer and v.vendor_type <> 'FOREIGN_COMPANY' and not app.has_file('vendor', v.id, 'vat_certificate') then
    perform app.fail('errors.uploadVatCertificate');                                 -- REG-01 AC8
  end if;

  update public.vendor set status = 'SUBMITTED', submitted_at = now() where id = v.id;
  perform app.notify(app.active_user_ids(v.company_id, 'PROCUREMENT_SPECIALIST'), 'registration.submitted',
                     'vendor', v.id, v.legal_name, jsonb_build_object('vendorType', v.vendor_type));
end $$;

------------------------------------------------------------------
-- 8. Grants (new public functions are executable by anon by default: revoke, then grant)
------------------------------------------------------------------
revoke execute on function public.registration_bank_save(jsonb),
  public.contact_save(uuid, text, text, text, text, boolean, boolean),
  public.contact_delete(uuid), public.contact_check() from public, anon;
grant execute on function public.registration_bank_save(jsonb),
  public.contact_save(uuid, text, text, text, text, boolean, boolean),
  public.contact_delete(uuid), public.contact_check() to authenticated;
revoke execute on function app.contact_rules_ok(uuid) from public, anon, authenticated;
