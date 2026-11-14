-- REG-08 (D-020): after approval, core company data (company details, owners, bank accounts, documents) changes only
-- through a change request that a Procurement Specialist approves. The data in force stays untouched until approval;
-- approval replaces it in one transaction. Also: reopening a rejected registration (REG-02 AC5, REG-08 AC14) and the
-- "Profile updated" entries for the free edits (REG-08 AC11).

------------------------------------------------------------------
-- 1. Files: a request owns its supporting files and the documents it proposes
------------------------------------------------------------------
alter table public.file drop constraint file_owner_type_check;
alter table public.file add constraint file_owner_type_check check (owner_type in (
  'vendor', 'vendor_brand', 'vendor_certificate', 'vendor_contact', 'vendor_change_request', 'questionnaire_answer',
  'category_application', 'requisition', 'sourcing', 'proposal', 'question', 'minutes', 'purchase_order'));
alter table public.file drop constraint file_kind_check;
alter table public.file add constraint file_kind_check check (kind in (
  'charter', 'id_card', 'registration_certificate', 'vat_certificate', 'proof_of_authority', 'change_support', 'licence',
  'technical_document', 'justification', 'attachment', 'pdf'));

------------------------------------------------------------------
-- 2. The request. Statuses exactly as in the Status Transition Model; every change writes an audit entry.
------------------------------------------------------------------
create table public.vendor_change_request (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.company (id),
  vendor_id      uuid not null references public.vendor (id) on delete cascade,
  section        text not null check (section in ('COMPANY_DETAILS', 'OWNERS', 'BANK_ACCOUNTS', 'DOCUMENTS')),
  status         text not null check (status in ('SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  reason         text not null check (btrim(reason) <> ''),
  current_values jsonb,                        -- snapshot of the data in force, taken at submit
  proposed_values jsonb not null,
  review_comment text,
  decided_by     uuid references public.app_user (id),
  decided_at     timestamptz,
  submitted_at   timestamptz,
  created_at     timestamptz not null default now()
);
-- one open request per vendor and section; RETURNED stays open until it is resubmitted or withdrawn
create unique index vendor_change_request_open_key on public.vendor_change_request (vendor_id, section)
  where status in ('SUBMITTED', 'RETURNED');
create index vendor_change_request_company_idx on public.vendor_change_request (company_id, status);
create trigger vendor_change_request_audit after insert or update of status on public.vendor_change_request
  for each row execute function app.audit_status_change('vendor_change_request');

alter table public.vendor_change_request enable row level security;
create policy vendor_change_request_select on public.vendor_change_request for select to authenticated
  using (vendor_id = (select app.current_vendor_id())
         or ((select app.can_view_vendors()) and company_id = (select app.current_company_id())));
revoke all on public.vendor_change_request from anon;
revoke insert, update, delete, truncate on public.vendor_change_request from authenticated;

create or replace function app.file_owner_vendor(p_owner_type text, p_owner_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case p_owner_type
    when 'vendor'               then p_owner_id
    when 'vendor_brand'         then (select b.vendor_id from public.vendor_brand b where b.id = p_owner_id)
    when 'vendor_certificate'   then (select c.vendor_id from public.vendor_certificate c where c.id = p_owner_id)
    when 'vendor_contact'       then (select c.vendor_id from public.vendor_contact c where c.id = p_owner_id)
    when 'vendor_change_request' then (select c.vendor_id from public.vendor_change_request c where c.id = p_owner_id)
    when 'questionnaire_answer' then (select r.vendor_id from public.questionnaire_answer a
                                      join public.questionnaire_response r on r.id = a.response_id where a.id = p_owner_id)
    when 'category_application' then (select a.vendor_id from public.category_application a where a.id = p_owner_id)
  end
$$;

-- The files of a request are private: the vendor reads its own, Procurement Specialist, Committee Member and Admin
-- read the company's, nobody else (a vendor never reads another vendor's files).
create or replace function app.can_read_file(p_owner_type text, p_owner_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_owner_type in ('vendor', 'vendor_brand', 'vendor_certificate', 'vendor_contact', 'vendor_change_request',
                          'questionnaire_answer', 'category_application')
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

create or replace function app.can_read_record(p_record_type text, p_record_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_record_type in ('vendor', 'vendor_standing') then
      p_record_id = app.current_vendor_id() or app.can_view_vendors()
    when p_record_type = 'vendor_change_request' then
      (select c.vendor_id = app.current_vendor_id() or app.can_view_vendors()
       from public.vendor_change_request c where c.id = p_record_id)
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
    when p_record_type = 'user' then
      p_record_id = auth.uid() or app.has_any_role(array['ADMIN', 'PROCUREMENT_SPECIALIST']::public.app_role[])
    else app.is_internal()
  end
$$;

------------------------------------------------------------------
-- 3. Values in force and the shape of a proposal, per section
------------------------------------------------------------------
create function app.cr_document_kinds(p_vendor uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select case v.vendor_type
           when 'LOCAL_COMPANY' then array['charter']
           when 'INDIVIDUAL' then array['id_card']
           else array['registration_certificate']
         end || case when v.is_vat_payer then array['vat_certificate'] else array[]::text[] end
  from public.vendor v where v.id = p_vendor
$$;

create function app.cr_current(p_vendor uuid, p_section text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v public.vendor;
begin
  select * into v from public.vendor where id = p_vendor;
  if p_section = 'COMPANY_DETAILS' then
    return case v.vendor_type
      when 'LOCAL_COMPANY' then jsonb_build_object('legal_name', v.legal_name, 'voen', v.voen,
        'legal_address', v.legal_address, 'director_name', v.director_name, 'is_vat_payer', v.is_vat_payer,
        'founded_on', v.founded_on)
      when 'FOREIGN_COMPANY' then jsonb_build_object('legal_name', v.legal_name,
        'foreign_tax_number', v.foreign_tax_number, 'legal_address', v.legal_address, 'founded_on', v.founded_on)
      else jsonb_build_object('legal_name', v.legal_name, 'voen', v.voen, 'id_card_number', v.id_card_number,
        'legal_address', v.legal_address)
    end;
  elsif p_section = 'OWNERS' then
    return jsonb_build_object('owners', coalesce((
      select jsonb_agg(jsonb_build_object('full_name', o.full_name, 'id_number', o.id_number,
                                          'share_percent', o.share_percent, 'role', o.role)
                       order by o.full_name, o.id_number)
      from public.vendor_owner o where o.vendor_id = p_vendor), '[]'::jsonb));
  elsif p_section = 'BANK_ACCOUNTS' then
    return jsonb_build_object('accounts', coalesce((
      select jsonb_agg(jsonb_build_object('bank_name', a.bank_name, 'iban', a.iban, 'swift', a.swift,
                                          'currency', a.currency, 'is_main', a.is_main)
                       order by a.is_main desc, a.iban)
      from public.vendor_bank_account a where a.vendor_id = p_vendor), '[]'::jsonb));
  else
    return jsonb_build_object('documents', coalesce((
      select jsonb_agg(distinct f.kind)
      from public.file f where f.owner_type = 'vendor' and f.owner_id = p_vendor
        and f.kind = any (app.cr_document_kinds(p_vendor))), '[]'::jsonb));
  end if;
end $$;

-- Validates a proposal against the rules of REG-07 / REG-06 and returns it normalised (trimmed text, empty = null),
-- in the same shape as app.cr_current. Raises the same messages as the forms. Called at submit and again at approval.
create function app.cr_validate(p_vendor uuid, p_section text, p_proposed jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.vendor;
  p jsonb := coalesce(p_proposed, '{}'::jsonb);
  n jsonb;
begin
  select * into v from public.vendor where id = p_vendor;

  if p_section = 'COMPANY_DETAILS' then
    begin
      n := case v.vendor_type
        when 'LOCAL_COMPANY' then jsonb_build_object(
          'legal_name', nullif(btrim(p ->> 'legal_name'), ''), 'voen', nullif(btrim(p ->> 'voen'), ''),
          'legal_address', nullif(btrim(p ->> 'legal_address'), ''), 'director_name', nullif(btrim(p ->> 'director_name'), ''),
          'is_vat_payer', (nullif(p ->> 'is_vat_payer', ''))::boolean,
          'founded_on', (nullif(btrim(p ->> 'founded_on'), ''))::date)
        when 'FOREIGN_COMPANY' then jsonb_build_object(
          'legal_name', nullif(btrim(p ->> 'legal_name'), ''),
          'foreign_tax_number', nullif(btrim(p ->> 'foreign_tax_number'), ''),
          'legal_address', nullif(btrim(p ->> 'legal_address'), ''),
          'founded_on', (nullif(btrim(p ->> 'founded_on'), ''))::date)
        else jsonb_build_object(
          'legal_name', nullif(btrim(p ->> 'legal_name'), ''), 'voen', nullif(btrim(p ->> 'voen'), ''),
          'id_card_number', nullif(btrim(p ->> 'id_card_number'), ''),
          'legal_address', nullif(btrim(p ->> 'legal_address'), ''))
      end;
    exception when others then
      perform app.fail('errors.dateInvalid');
    end;
    if n ->> 'legal_name' is null then perform app.fail('errors.required'); end if;
    if v.vendor_type = 'LOCAL_COMPANY' then
      if n ->> 'voen' is null or n ->> 'voen' !~ '^[0-9]{10}$' then perform app.fail('errors.voenFormat'); end if;
      if n ->> 'legal_address' is null or n ->> 'director_name' is null or n -> 'is_vat_payer' = 'null'::jsonb then
        perform app.fail('errors.required');
      end if;
    elsif v.vendor_type = 'FOREIGN_COMPANY' then
      if char_length(coalesce(n ->> 'foreign_tax_number', '')) not between 3 and 30 then
        perform app.fail('errors.foreignTaxFormat');
      end if;
      if n ->> 'legal_address' is null then perform app.fail('errors.required'); end if;
    else
      if n ->> 'voen' is not null and n ->> 'voen' !~ '^[0-9]{10}$' then perform app.fail('errors.voenFormat'); end if;
      if n ->> 'id_card_number' is null then perform app.fail('errors.required'); end if;
    end if;
    if v.vendor_type <> 'INDIVIDUAL' then
      if n -> 'founded_on' = 'null'::jsonb then perform app.fail('errors.foundedOnRequired'); end if;
      if (n ->> 'founded_on')::date > app.today() then perform app.fail('errors.dateInvalid'); end if;
    end if;
    if public.vendor_tax_number_taken(n ->> 'voen', n ->> 'foreign_tax_number', v.id, n ->> 'id_card_number') then
      perform app.fail('errors.taxNumberTaken');
    end if;

  elsif p_section = 'OWNERS' then
    if v.vendor_type = 'INDIVIDUAL' then perform app.fail('errors.noAccess'); end if;
    begin
      n := jsonb_build_object('owners', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'full_name', btrim(x ->> 'full_name'), 'id_number', btrim(x ->> 'id_number'),
                 'share_percent', (nullif(btrim(x ->> 'share_percent'), ''))::numeric, 'role', x ->> 'role')
               order by btrim(x ->> 'full_name'), btrim(x ->> 'id_number'))
        from jsonb_array_elements(case when jsonb_typeof(p -> 'owners') = 'array' then p -> 'owners' else '[]'::jsonb end) x),
        '[]'::jsonb));
    exception when others then
      perform app.fail('errors.ownerIncomplete');
    end;
    if jsonb_array_length(n -> 'owners') = 0
       or exists (select 1 from jsonb_array_elements(n -> 'owners') o
                  where coalesce(o ->> 'full_name', '') = '' or coalesce(o ->> 'id_number', '') = ''
                     or o ->> 'role' not in ('FOUNDER', 'SHAREHOLDER', 'HEAD')
                     or (o -> 'share_percent' <> 'null'::jsonb
                         and not ((o ->> 'share_percent')::numeric > 0 and (o ->> 'share_percent')::numeric <= 100))) then
      perform app.fail('errors.ownerIncomplete');
    end if;
    if not exists (select 1 from jsonb_array_elements(n -> 'owners') o where o ->> 'role' = 'HEAD') then
      perform app.fail('errors.headOwnerRequired');
    end if;
    if (select coalesce(sum((o ->> 'share_percent')::numeric), 0) from jsonb_array_elements(n -> 'owners') o
        where o -> 'share_percent' <> 'null'::jsonb) > 100 then
      perform app.fail('errors.sharesOver100');
    end if;

  elsif p_section = 'BANK_ACCOUNTS' then
    begin
      n := jsonb_build_object('accounts', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'bank_name', btrim(x ->> 'bank_name'), 'iban', upper(regexp_replace(coalesce(x ->> 'iban', ''), '\s', '', 'g')),
                 'swift', upper(regexp_replace(coalesce(x ->> 'swift', ''), '\s', '', 'g')),
                 'currency', upper(coalesce(x ->> 'currency', '')),
                 'is_main', coalesce((x ->> 'is_main')::boolean, false))
               order by coalesce((x ->> 'is_main')::boolean, false) desc, upper(regexp_replace(coalesce(x ->> 'iban', ''), '\s', '', 'g')))
        from jsonb_array_elements(case when jsonb_typeof(p -> 'accounts') = 'array' then p -> 'accounts' else '[]'::jsonb end) x),
        '[]'::jsonb));
    exception when others then
      perform app.fail('errors.bankAccountIncomplete');
    end;
    if jsonb_array_length(n -> 'accounts') = 0 then perform app.fail('errors.bankAccountRequired'); end if;
    if exists (select 1 from jsonb_array_elements(n -> 'accounts') a
               where coalesce(a ->> 'bank_name', '') = '' or coalesce(a ->> 'swift', '') = ''
                  or a ->> 'currency' !~ '^[A-Z]{3}$') then
      perform app.fail('errors.bankAccountIncomplete');
    end if;
    if exists (select 1 from jsonb_array_elements(n -> 'accounts') a where a ->> 'iban' !~ '^[A-Z0-9]{1,34}$') then
      perform app.fail('errors.ibanFormat');
    end if;
    if (select count(*) from jsonb_array_elements(n -> 'accounts') a where (a ->> 'is_main')::boolean) <> 1 then
      perform app.fail('errors.mainAccountOne');
    end if;

  elsif p_section = 'DOCUMENTS' then
    n := jsonb_build_object('documents', coalesce((
      select jsonb_agg(distinct k) from jsonb_array_elements_text(
        case when jsonb_typeof(p -> 'documents') = 'array' then p -> 'documents' else '[]'::jsonb end) k), '[]'::jsonb));
    if jsonb_array_length(n -> 'documents') = 0
       or exists (select 1 from jsonb_array_elements_text(n -> 'documents') k
                  where k <> all (app.cr_document_kinds(v.id))) then
      perform app.fail('errors.documentKinds');
    end if;
  else
    perform app.fail('errors.noAccess');
  end if;
  return n;
end $$;

-- A supporting file is required for a change of legal name, tax number, owners or bank accounts (REG-08 AC1).
create function app.cr_needs_support(p_vendor uuid, p_section text, p_norm jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare c jsonb;
begin
  if p_section in ('OWNERS', 'BANK_ACCOUNTS') then return true; end if;
  if p_section <> 'COMPANY_DETAILS' then return false; end if;
  c := app.cr_current(p_vendor, p_section);
  return (p_norm ->> 'legal_name') is distinct from (c ->> 'legal_name')
      or (p_norm ->> 'voen') is distinct from (c ->> 'voen')
      or (p_norm ->> 'foreign_tax_number') is distinct from (c ->> 'foreign_tax_number')
      or (p_norm ->> 'id_card_number') is distinct from (c ->> 'id_card_number');
end $$;

------------------------------------------------------------------
-- 4. The vendor submits, resubmits and withdraws (REG-08 AC1-AC4, AC7, AC8)
------------------------------------------------------------------
create function public.change_request_submit(p_section text, p_reason text, p_proposed jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_vendor uuid := app.current_vendor_id();
  v public.vendor;
  v_norm jsonb;
  v_id uuid;
begin
  if v_vendor is null then perform app.fail('errors.noAccess'); end if;
  select * into v from public.vendor where id = v_vendor for update;
  -- DRAFT and RETURNED vendors edit directly (REG-07); a SUBMITTED registration is read-only
  if v.status <> 'APPROVED' then perform app.fail('errors.noAccess'); end if;
  if p_section not in ('COMPANY_DETAILS', 'OWNERS', 'BANK_ACCOUNTS', 'DOCUMENTS') then perform app.fail('errors.noAccess'); end if;
  if nullif(btrim(p_reason), '') is null then perform app.fail('errors.reasonRequired'); end if;
  if exists (select 1 from public.vendor_change_request c
             where c.vendor_id = v_vendor and c.section = p_section and c.status in ('SUBMITTED', 'RETURNED')) then
    perform app.fail('errors.changeRequestOpen');
  end if;
  v_norm := app.cr_validate(v_vendor, p_section, p_proposed);
  if p_section <> 'DOCUMENTS' and v_norm = app.cr_current(v_vendor, p_section) then perform app.fail('errors.noChange'); end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  insert into public.vendor_change_request (company_id, vendor_id, section, status, reason, current_values, proposed_values, submitted_at)
  values (v.company_id, v_vendor, p_section, 'SUBMITTED', btrim(p_reason), app.cr_current(v_vendor, p_section), v_norm, now())
  returning id into v_id;
  perform app.notify(app.active_user_ids(v.company_id, 'PROCUREMENT_SPECIALIST'), 'changeRequest.submitted',
                     'vendor_change_request', v_id, v.legal_name, jsonb_build_object('section', p_section));
  return v_id;
end $$;

create function public.change_request_resubmit(p_id uuid, p_reason text, p_proposed jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.vendor_change_request; v public.vendor; v_norm jsonb;
begin
  select * into r from public.vendor_change_request where id = p_id and vendor_id = app.current_vendor_id() for update;
  if r.id is null then perform app.fail('errors.noAccess'); end if;
  if r.status <> 'RETURNED' then perform app.fail('errors.statusChanged'); end if;
  select * into v from public.vendor where id = r.vendor_id;
  if v.status <> 'APPROVED' then perform app.fail('errors.noAccess'); end if;
  if nullif(btrim(p_reason), '') is null then perform app.fail('errors.reasonRequired'); end if;
  v_norm := app.cr_validate(r.vendor_id, r.section, p_proposed);
  if r.section <> 'DOCUMENTS' and v_norm = app.cr_current(r.vendor_id, r.section) then perform app.fail('errors.noChange'); end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.vendor_change_request
     set status = 'SUBMITTED', reason = btrim(p_reason), proposed_values = v_norm,
         current_values = app.cr_current(r.vendor_id, r.section), submitted_at = now()
   where id = r.id;
  perform app.notify(app.active_user_ids(r.company_id, 'PROCUREMENT_SPECIALIST'), 'changeRequest.submitted',
                     'vendor_change_request', r.id, v.legal_name, jsonb_build_object('section', r.section));
end $$;

create function public.change_request_withdraw(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.vendor_change_request;
begin
  select * into r from public.vendor_change_request where id = p_id and vendor_id = app.current_vendor_id() for update;
  if r.id is null then perform app.fail('errors.noAccess'); end if;
  if r.status not in ('SUBMITTED', 'RETURNED') then perform app.fail('errors.statusChanged'); end if;
  perform set_config('app.audit_reason', '', true);
  update public.vendor_change_request set status = 'WITHDRAWN' where id = r.id;
end $$;

------------------------------------------------------------------
-- 5. The Procurement Specialist decides (REG-08 AC5-AC10). Approval replaces the data in one transaction and
--    runs the checks again; a failed check refuses the approval with its message. Returns the storage paths of
--    files that were replaced, so the server can delete the objects after the commit.
------------------------------------------------------------------
create function public.change_request_decide(p_id uuid, p_decision text, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.vendor_change_request;
  v public.vendor;
  v_status text := case p_decision when 'APPROVE' then 'APPROVED' when 'RETURN' then 'RETURNED' when 'REJECT' then 'REJECTED' end;
  n jsonb;
  v_removed text[] := '{}';
  v_kinds text[];
  v_code text;
  v_k text;
begin
  if not app.has_role('PROCUREMENT_SPECIALIST') then perform app.fail('errors.noAccess'); end if;
  select * into r from public.vendor_change_request where id = p_id and company_id = app.current_company_id() for update;
  if r.id is null or v_status is null then perform app.fail('errors.noAccess'); end if;
  if r.status <> 'SUBMITTED' then perform app.fail('errors.statusChanged'); end if;
  if v_status <> 'APPROVED' and nullif(btrim(p_comment), '') is null then
    perform app.fail(case v_status when 'RETURNED' then 'errors.commentRequired' else 'errors.reasonRequired' end);
  end if;
  perform set_config('app.audit_reason', coalesce(btrim(p_comment), ''), true);

  if v_status = 'APPROVED' then
    select * into v from public.vendor where id = r.vendor_id for update;
    if v.status <> 'APPROVED' then perform app.fail('errors.statusChanged'); end if;
    n := app.cr_validate(v.id, r.section, r.proposed_values);   -- tax number, owner shares, bank rules, again
    if app.cr_needs_support(v.id, r.section, n) and not app.has_file('vendor_change_request', r.id, 'change_support') then
      perform app.fail('errors.supportRequired');
    end if;
    v_code := r.section;

    if r.section = 'COMPANY_DETAILS' then
      if v.vendor_type = 'LOCAL_COMPANY' then
        update public.vendor set legal_name = n ->> 'legal_name', voen = n ->> 'voen', legal_address = n ->> 'legal_address',
               director_name = n ->> 'director_name', is_vat_payer = (n ->> 'is_vat_payer')::boolean,
               founded_on = (n ->> 'founded_on')::date
         where id = v.id;
      elsif v.vendor_type = 'FOREIGN_COMPANY' then
        update public.vendor set legal_name = n ->> 'legal_name', foreign_tax_number = n ->> 'foreign_tax_number',
               legal_address = n ->> 'legal_address', founded_on = (n ->> 'founded_on')::date
         where id = v.id;
      else
        update public.vendor set legal_name = n ->> 'legal_name', voen = n ->> 'voen', id_card_number = n ->> 'id_card_number',
               legal_address = n ->> 'legal_address'
         where id = v.id;
      end if;
      -- a VAT payer needs its certificate: the one already on file, or the one attached to this request
      if (n ->> 'is_vat_payer')::boolean is true then
        if app.has_file('vendor_change_request', r.id, 'vat_certificate') then
          select coalesce(array_agg(f.storage_path), '{}') into v_removed from public.file f
           where f.owner_type = 'vendor' and f.owner_id = v.id and f.kind = 'vat_certificate';
          delete from public.file where owner_type = 'vendor' and owner_id = v.id and kind = 'vat_certificate';
          update public.file set owner_type = 'vendor', owner_id = v.id
           where owner_type = 'vendor_change_request' and owner_id = r.id and kind = 'vat_certificate';
        elsif not app.has_file('vendor', v.id, 'vat_certificate') then
          perform app.fail('errors.uploadVatCertificate');
        end if;
      end if;

    elsif r.section = 'OWNERS' then
      delete from public.vendor_owner where vendor_id = v.id;
      insert into public.vendor_owner (vendor_id, full_name, id_number, share_percent, role)
      select v.id, o ->> 'full_name', o ->> 'id_number', (nullif(o ->> 'share_percent', 'null'))::numeric, o ->> 'role'
      from jsonb_array_elements(n -> 'owners') o;

    elsif r.section = 'BANK_ACCOUNTS' then
      perform app.replace_bank_accounts(v.id, n -> 'accounts');
      -- the history shows the IBAN hidden except its last 4 characters (REG-08 AC10)
      select v_code || ': ' || string_agg('****' || right(a ->> 'iban', 4) || ' ' || (a ->> 'currency')
                                           || case when (a ->> 'is_main')::boolean then ' main' else '' end, ', ')
        into v_code from jsonb_array_elements(n -> 'accounts') a;

    else -- DOCUMENTS
      select array(select jsonb_array_elements_text(n -> 'documents')) into v_kinds;
      foreach v_k in array v_kinds loop
        if not app.has_file('vendor_change_request', r.id, v_k) then perform app.fail('errors.documentFileRequired'); end if;
      end loop;
      select coalesce(array_agg(f.storage_path), '{}') into v_removed from public.file f
       where f.owner_type = 'vendor' and f.owner_id = v.id and f.kind = any (v_kinds);
      delete from public.file where owner_type = 'vendor' and owner_id = v.id and kind = any (v_kinds);
      update public.file set owner_type = 'vendor', owner_id = v.id
       where owner_type = 'vendor_change_request' and owner_id = r.id and kind = any (v_kinds);
    end if;

    perform app.log_event('vendor', v.id, 'PROFILE_UPDATED', v_code);
  end if;

  update public.vendor_change_request
     set status = v_status, review_comment = nullif(btrim(p_comment), ''), decided_by = auth.uid(), decided_at = now()
   where id = r.id;
  perform app.notify(app.vendor_user_ids(r.vendor_id), 'changeRequest.decided', 'vendor_change_request', r.id, null,
                     jsonb_build_object('section', r.section, 'decision', v_status, 'comment', coalesce(btrim(p_comment), '')));
  return jsonb_build_object('removed', to_jsonb(v_removed));
end $$;

------------------------------------------------------------------
-- 6. Reopen a rejected registration (REG-02 AC5, REG-08 AC14): REJECTED -> RETURNED, comment required
------------------------------------------------------------------
create function public.registration_reopen(p_vendor uuid, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.vendor;
begin
  if not app.has_role('PROCUREMENT_SPECIALIST') then perform app.fail('errors.noAccess'); end if;
  select * into v from public.vendor where id = p_vendor and company_id = app.current_company_id() for update;
  if v.id is null then perform app.fail('errors.noAccess'); end if;
  if v.status <> 'REJECTED' then perform app.fail('errors.statusChanged'); end if;
  if nullif(btrim(p_comment), '') is null then perform app.fail('errors.commentRequired'); end if;
  perform set_config('app.audit_reason', btrim(p_comment), true);
  update public.vendor set status = 'RETURNED', review_comment = btrim(p_comment) where id = v.id;
  perform app.notify(app.vendor_user_ids(v.id), 'registration.reopened', 'vendor', v.id, v.legal_name,
                     jsonb_build_object('comment', btrim(p_comment)));
end $$;

------------------------------------------------------------------
-- 7. Free edits are logged (REG-08 AC11): "Profile updated: <section>" with the user and the time. Only for an
--    APPROVED vendor; while the registration is a draft the whole registration is the record.
------------------------------------------------------------------
create function public.profile_log(p_section text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_vendor uuid := app.current_vendor_id();
begin
  if v_vendor is null then perform app.fail('errors.noAccess'); end if;
  if p_section not in ('ACTIVITY', 'MAIN_GOODS', 'BANK_GUARANTEE', 'BRANDS', 'CERTIFICATES', 'CONTACT_PERSONS') then
    perform app.fail('errors.noAccess');
  end if;
  if exists (select 1 from public.vendor v where v.id = v_vendor and v.status = 'APPROVED') then
    perform app.log_event('vendor', v_vendor, 'PROFILE_UPDATED', p_section);
  end if;
end $$;

------------------------------------------------------------------
-- 8. Bank accounts: direct only while DRAFT or RETURNED; an APPROVED vendor uses a change request (REG-06 AC3)
------------------------------------------------------------------
create or replace function public.bank_accounts_save(p_accounts jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_vendor uuid := app.current_vendor_id(); v_status text;
begin
  if v_vendor is null then perform app.fail('errors.noAccess'); end if;
  select status into v_status from public.vendor where id = v_vendor;
  if v_status = 'APPROVED' then perform app.fail('errors.useChangeRequest'); end if;
  if v_status not in ('DRAFT', 'RETURNED') then perform app.fail('errors.registrationReadOnly'); end if;
  perform app.replace_bank_accounts(v_vendor, p_accounts);
end $$;

------------------------------------------------------------------
-- 9. Grants (new public functions are executable by anon by default: revoke, then grant)
------------------------------------------------------------------
revoke execute on function public.change_request_submit(text, text, jsonb), public.change_request_resubmit(uuid, text, jsonb),
  public.change_request_withdraw(uuid), public.change_request_decide(uuid, text, text),
  public.registration_reopen(uuid, text), public.profile_log(text) from public, anon;
grant execute on function public.change_request_submit(text, text, jsonb), public.change_request_resubmit(uuid, text, jsonb),
  public.change_request_withdraw(uuid), public.change_request_decide(uuid, text, text),
  public.registration_reopen(uuid, text), public.profile_log(text) to authenticated;
revoke execute on function app.cr_document_kinds(uuid), app.cr_current(uuid, text), app.cr_validate(uuid, text, jsonb),
  app.cr_needs_support(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function app.can_read_record(text, uuid), app.can_read_file(text, uuid) to authenticated;
