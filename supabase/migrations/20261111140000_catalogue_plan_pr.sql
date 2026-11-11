-- Slice 3: MDM-01 (dictionaries incl. Currencies), MDM-02 (category tree, item catalogue),
-- PLN-01 (plan lines), PR-01 (create and submit a PR), PR-02 (approve, return, reject).
-- Tables for these stories exist since Slice 2; this adds the Currencies dictionary and the
-- functions the screens call. Master data, plan lines and PRs are written only through these
-- functions, so every rule and every message key ("This name already exists", ...) is checked
-- in one place; the direct-write policies of Slice 2 are dropped.

------------------------------------------------------------------
-- 1. Currencies (MDM-01 AC4, change of 11 Nov 2026). ISO codes are global, like Incoterms.
------------------------------------------------------------------
create table public.currency (
  code       text primary key check (code ~ '^[A-Z]{3}$'),
  name       text not null check (btrim(name) <> ''),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index currency_name_key on public.currency (lower(name));

-- Reference data: the bank accounts already stored use AZN, USD and EUR, so the rows must exist
-- before the foreign keys below. The seed repeats them (safe to run twice).
insert into public.currency (code, name) values
  ('AZN', 'Azerbaijani manat'), ('USD', 'US dollar'), ('EUR', 'Euro'), ('TRY', 'Turkish lira'),
  ('RUB', 'Russian rouble'), ('GBP', 'Pound sterling'), ('CNY', 'Chinese yuan')
on conflict (code) do nothing;

alter table public.vendor_bank_account
  add constraint vendor_bank_account_currency_fkey foreign key (currency) references public.currency (code);
alter table public.vendor
  add constraint vendor_bank_guarantee_currency_fkey foreign key (bank_guarantee_currency) references public.currency (code);
create index vendor_bank_account_currency_idx on public.vendor_bank_account (currency);
create index vendor_bank_guarantee_currency_idx on public.vendor (bank_guarantee_currency);

alter table public.currency enable row level security;
create policy currency_select on public.currency for select to authenticated using (true);
revoke all on public.currency from anon;
revoke insert, update, delete on public.currency from authenticated;
-- The public registration page reads the active currencies on the server with the secret key.

-- Bank accounts: a currency from the dictionary; a new or changed account needs an active one,
-- an account that already uses a deactivated currency keeps it (MDM-01 AC5).
create or replace function app.replace_bank_accounts(p_vendor uuid, p_accounts jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(coalesce(p_accounts, 'null')) <> 'array' or jsonb_array_length(p_accounts) = 0 then
    perform app.fail('errors.bankAccountRequired');
  end if;
  if exists (select 1 from jsonb_populate_recordset(null::public.vendor_bank_account, p_accounts) a
             where coalesce(btrim(a.bank_name), '') = '' or coalesce(btrim(a.swift), '') = ''
                or coalesce(a.currency, '') !~ '^[A-Za-z]{3}$') then
    perform app.fail('errors.bankAccountIncomplete');
  end if;
  if exists (select 1 from jsonb_populate_recordset(null::public.vendor_bank_account, p_accounts) a
             where not exists (select 1 from public.currency c where c.code = upper(a.currency) and c.is_active)
               and not exists (select 1 from public.vendor_bank_account o
                               where o.vendor_id = p_vendor and o.currency = upper(a.currency))) then
    perform app.fail('errors.currencyInvalid');
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

-- Bank guarantee currency (REG-06 AC3): the vendor writes it on its own row; same rule.
create function app.check_guarantee_currency() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.bank_guarantee_currency is not null
     and new.bank_guarantee_currency is distinct from (case when tg_op = 'UPDATE' then old.bank_guarantee_currency end)
     and not exists (select 1 from public.currency c where c.code = new.bank_guarantee_currency and c.is_active) then
    perform app.fail('errors.currencyInvalid');
  end if;
  return new;
end $$;
create trigger vendor_guarantee_currency before insert or update of bank_guarantee_currency on public.vendor
  for each row execute function app.check_guarantee_currency();

------------------------------------------------------------------
-- 2. Writes only through functions
------------------------------------------------------------------
drop policy incoterm_admin_update on public.incoterm;
drop policy payment_term_admin_write on public.payment_term;
drop policy delivery_place_admin_write on public.delivery_place;
drop policy delivery_mode_admin_write on public.delivery_mode;
drop policy category_admin_write on public.category;
drop policy item_admin_write on public.item;
drop policy plan_line_admin_write on public.plan_line;
revoke insert, update, delete on public.incoterm, public.payment_term, public.delivery_place, public.delivery_mode,
  public.category, public.item, public.plan_line, public.requisition, public.requisition_line from authenticated;

create function app.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_role('ADMIN') then perform app.fail('errors.noAccess'); end if;
  return app.current_company_id();
end $$;

-- Text that must not be blank (the screens check it first and show "This field is required").
create function app.need(p_value text) returns text
language plpgsql set search_path = '' as $$
begin
  if nullif(btrim(p_value), '') is null then perform app.fail('errors.required'); end if;
  return btrim(p_value);
end $$;

------------------------------------------------------------------
-- 3. Dictionaries (MDM-01). Duplicate name -> "This name already exists" (AC6);
--    delete only when nothing uses the entry (AC5), otherwise deactivate.
------------------------------------------------------------------
-- AC4 (currencies): ISO code of 3 capital letters, set once; name and active flag can change.
create function public.currency_save(p_code text, p_name text, p_is_active boolean, p_is_new boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(btrim(coalesce(p_code, '')));
begin
  perform app.require_admin();
  if v_code !~ '^[A-Z]{3}$' then perform app.fail('errors.currencyCodeFormat'); end if;
  begin
    if p_is_new then
      if exists (select 1 from public.currency where code = v_code) then perform app.fail('errors.codeExists'); end if;
      insert into public.currency (code, name, is_active) values (v_code, app.need(p_name), coalesce(p_is_active, true));
    else
      update public.currency set name = app.need(p_name), is_active = coalesce(p_is_active, is_active) where code = v_code;
      if not found then perform app.fail('errors.noAccess'); end if;
    end if;
  exception when unique_violation then perform app.fail('errors.nameExists');
  end;
end $$;

-- AC1: the 11 Incoterms are fixed; the Admin may rename or deactivate, never add, delete or recode.
create function public.incoterm_save(p_code text, p_name text, p_is_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  begin
    update public.incoterm set name = app.need(p_name), is_active = coalesce(p_is_active, is_active) where code = p_code;
    if not found then perform app.fail('errors.noAccess'); end if;
  exception when unique_violation then perform app.fail('errors.nameExists');
  end;
end $$;

-- AC2: advance 0 to 100 %, days after delivery 0 or more.
create function public.payment_term_save(p_id uuid, p_name text, p_advance_percent numeric,
                                         p_days_after_delivery integer, p_is_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid := app.require_admin(); v_id uuid;
begin
  if p_advance_percent is null or p_advance_percent < 0 or p_advance_percent > 100 then
    perform app.fail('errors.advancePercentRange');
  end if;
  if p_days_after_delivery is null or p_days_after_delivery < 0 then perform app.fail('errors.daysNotNegative'); end if;
  begin
    if p_id is null then
      insert into public.payment_term (company_id, name, advance_percent, days_after_delivery, is_active)
      values (v_company, app.need(p_name), p_advance_percent, p_days_after_delivery, coalesce(p_is_active, true))
      returning id into v_id;
    else
      update public.payment_term
         set name = app.need(p_name), advance_percent = p_advance_percent,
             days_after_delivery = p_days_after_delivery, is_active = coalesce(p_is_active, is_active)
       where id = p_id and company_id = v_company returning id into v_id;
      if v_id is null then perform app.fail('errors.noAccess'); end if;
    end if;
  exception when unique_violation then perform app.fail('errors.nameExists');
  end;
  return v_id;
end $$;

-- AC3: name, type (Warehouse, Port, City) and address.
create function public.delivery_place_save(p_id uuid, p_name text, p_type text, p_address text, p_is_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid := app.require_admin(); v_id uuid;
begin
  if p_type is null or p_type not in ('WAREHOUSE', 'PORT', 'CITY') then perform app.fail('errors.required'); end if;
  begin
    if p_id is null then
      insert into public.delivery_place (company_id, name, type, address, is_active)
      values (v_company, app.need(p_name), p_type, app.need(p_address), coalesce(p_is_active, true))
      returning id into v_id;
    else
      update public.delivery_place
         set name = app.need(p_name), type = p_type, address = app.need(p_address),
             is_active = coalesce(p_is_active, is_active)
       where id = p_id and company_id = v_company returning id into v_id;
      if v_id is null then perform app.fail('errors.noAccess'); end if;
    end if;
  exception when unique_violation then perform app.fail('errors.nameExists');
  end;
  return v_id;
end $$;

-- AC4: delivery mode with a name.
create function public.delivery_mode_save(p_id uuid, p_name text, p_is_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid := app.require_admin(); v_id uuid;
begin
  begin
    if p_id is null then
      insert into public.delivery_mode (company_id, name, is_active)
      values (v_company, app.need(p_name), coalesce(p_is_active, true)) returning id into v_id;
    else
      update public.delivery_mode set name = app.need(p_name), is_active = coalesce(p_is_active, is_active)
       where id = p_id and company_id = v_company returning id into v_id;
      if v_id is null then perform app.fail('errors.noAccess'); end if;
    end if;
  exception when unique_violation then perform app.fail('errors.nameExists');
  end;
  return v_id;
end $$;

-- AC5: delete an unused entry. Every reference is a RESTRICT / NO ACTION foreign key, so an
-- entry in use raises foreign_key_violation -> "This entry is in use. Deactivate it instead".
create function public.dictionary_delete(p_kind text, p_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_company uuid := app.require_admin();
begin
  begin
    case p_kind
      when 'currency' then delete from public.currency where code = p_key;
      when 'payment_term' then delete from public.payment_term where id = p_key::uuid and company_id = v_company;
      when 'delivery_place' then delete from public.delivery_place where id = p_key::uuid and company_id = v_company;
      when 'delivery_mode' then delete from public.delivery_mode where id = p_key::uuid and company_id = v_company;
      else perform app.fail('errors.noAccess');  -- Incoterms cannot be deleted (AC1)
    end case;
    if not found then perform app.fail('errors.noAccess'); end if;
  exception when foreign_key_violation then perform app.fail('errors.inUse');
  end;
end $$;

------------------------------------------------------------------
-- 4. Category tree and item catalogue (MDM-02)
------------------------------------------------------------------
-- AC1, AC2: name, optional parent (any depth), licence flag; same name twice under one parent ->
-- "This name already exists". The parent trigger refuses cycles (errors.categoryParentInvalid).
create function public.category_save(p_id uuid, p_parent_id uuid, p_name text, p_licence_required boolean,
                                     p_is_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid := app.require_admin(); v_id uuid;
begin
  begin
    if p_id is null then
      insert into public.category (company_id, parent_id, name, licence_required, is_active)
      values (v_company, p_parent_id, app.need(p_name), coalesce(p_licence_required, false), coalesce(p_is_active, true))
      returning id into v_id;
    else
      update public.category
         set parent_id = p_parent_id, name = app.need(p_name), licence_required = coalesce(p_licence_required, false),
             is_active = coalesce(p_is_active, is_active)
       where id = p_id and company_id = v_company returning id into v_id;
      if v_id is null then perform app.fail('errors.noAccess'); end if;
    end if;
  exception when unique_violation then perform app.fail('errors.nameExists');
  end;
  return v_id;
end $$;

-- AC5, AC6: children first, then only when unused (items, plan lines, applications).
create function public.category_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_company uuid := app.require_admin();
begin
  if exists (select 1 from public.category where parent_id = p_id) then
    perform app.fail('errors.categoryHasChildren');
  end if;
  begin
    delete from public.category where id = p_id and company_id = v_company;
    if not found then perform app.fail('errors.noAccess'); end if;
  exception when foreign_key_violation then perform app.fail('errors.inUse');
  end;
end $$;

-- AC4: unique code (any case), name, unit, category. A new or moved item needs an active category.
create function public.item_save(p_id uuid, p_category_id uuid, p_code text, p_name text, p_unit text,
                                 p_is_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid := app.require_admin(); v_id uuid;
begin
  if not exists (select 1 from public.category c where c.id = p_category_id and c.company_id = v_company
                 and (c.is_active or exists (select 1 from public.item i where i.id = p_id and i.category_id = c.id))) then
    perform app.fail('errors.required');
  end if;
  begin
    if p_id is null then
      insert into public.item (company_id, category_id, code, name, unit, is_active)
      values (v_company, p_category_id, app.need(p_code), app.need(p_name), app.need(p_unit), coalesce(p_is_active, true))
      returning id into v_id;
    else
      update public.item
         set category_id = p_category_id, code = app.need(p_code), name = app.need(p_name), unit = app.need(p_unit),
             is_active = coalesce(p_is_active, is_active)
       where id = p_id and company_id = v_company returning id into v_id;
      if v_id is null then perform app.fail('errors.noAccess'); end if;
    end if;
  exception when unique_violation then perform app.fail('errors.codeExists');
  end;
  return v_id;
end $$;

create function public.item_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_company uuid := app.require_admin();
begin
  begin
    delete from public.item where id = p_id and company_id = v_company;
    if not found then perform app.fail('errors.noAccess'); end if;
  exception when foreign_key_violation then perform app.fail('errors.inUse');
  end;
end $$;

-- AC4: items that can go on a PR line of this plan line: the plan line's category and its children.
create function app.item_fits_plan_line(p_item uuid, p_plan_line uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.item i join public.plan_line p on p.id = p_plan_line
                 where i.id = p_item and p.category_id in (select app.category_ancestors(i.category_id)))
$$;

------------------------------------------------------------------
-- 5. Plan (PLN-01)
------------------------------------------------------------------
-- AC3: committed = estimated values of linked PRs in PENDING_APPROVAL, APPROVED, IN_SOURCING or
-- COMPLETED; remaining = planned - committed. p_except leaves one PR out (the one being checked).
create function app.plan_committed(p_plan_line uuid, p_except uuid default null) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(r.estimated_value), 0) from public.requisition r
  where r.plan_line_id = p_plan_line and r.id is distinct from p_except
    and r.status in ('PENDING_APPROVAL', 'APPROVED', 'IN_SOURCING', 'COMPLETED')
$$;

-- Plan page (AC3, AC5): readers per Role Matrix ("View the plan"); the base table's policy applies.
create view public.plan_line_summary with (security_invoker = true) as
  select p.id, p.company_id, p.year, p.category_id, c.name as category_name, p.description, p.planned_amount,
         p.quarter, p.status, p.created_at,
         app.plan_committed(p.id) as committed_amount,
         p.planned_amount - app.plan_committed(p.id) as remaining_amount
  from public.plan_line p join public.category c on c.id = p.category_id;
revoke all on public.plan_line_summary from anon;

-- AC1: add (ACTIVE) or edit an ACTIVE line: year, category, description, amount > 0, quarter.
create function public.plan_line_save(p_id uuid, p_year integer, p_category_id uuid, p_description text,
                                      p_planned_amount numeric, p_quarter text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid := app.require_admin(); v_id uuid;
begin
  if p_year is null or p_year not between 2000 and 2100 then perform app.fail('errors.yearInvalid'); end if;
  if p_planned_amount is null or p_planned_amount <= 0 or p_planned_amount <> round(p_planned_amount, 2) then
    perform app.fail('errors.amountPositive');
  end if;
  if p_quarter is null or p_quarter not in ('Q1', 'Q2', 'Q3', 'Q4') then perform app.fail('errors.required'); end if;
  if not exists (select 1 from public.category c where c.id = p_category_id and c.company_id = v_company
                 and (c.is_active or exists (select 1 from public.plan_line l where l.id = p_id and l.category_id = c.id))) then
    perform app.fail('errors.required');
  end if;
  if p_id is null then
    insert into public.plan_line (company_id, year, category_id, description, planned_amount, quarter)
    values (v_company, p_year, p_category_id, app.need(p_description), p_planned_amount, p_quarter)
    returning id into v_id;
  else
    if exists (select 1 from public.plan_line where id = p_id and company_id = v_company and status <> 'ACTIVE') then
      perform app.fail('errors.statusChanged');
    end if;
    -- the category of a line with PRs stays, so their items keep fitting it
    if exists (select 1 from public.requisition r join public.plan_line l on l.id = r.plan_line_id
               where l.id = p_id and l.category_id <> p_category_id) then
      perform app.fail('errors.inUse');
    end if;
    update public.plan_line
       set year = p_year, category_id = p_category_id, description = app.need(p_description),
           planned_amount = p_planned_amount, quarter = p_quarter
     where id = p_id and company_id = v_company returning id into v_id;
    if v_id is null then perform app.fail('errors.noAccess'); end if;
  end if;
  return v_id;
end $$;

-- AC2: ACTIVE -> CLOSED; linked PRs keep the link.
create function public.plan_line_close(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_company uuid := app.require_admin();
begin
  update public.plan_line set status = 'CLOSED' where id = p_id and company_id = v_company and status = 'ACTIVE';
  if not found then perform app.fail('errors.statusChanged'); end if;
end $$;

------------------------------------------------------------------
-- 6. Purchase requisition (PR-01, PR-02)
------------------------------------------------------------------
-- PLN-01 AC4 / PR-02 AC5: by how much the PR's value exceeds what is left on its plan line
-- (the PR itself left out of "committed"); 0 when it fits. Readable by whoever can read the PR.
create function public.requisition_plan_excess(p_id uuid) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare r public.requisition; p public.plan_line;
begin
  select * into r from public.requisition where id = p_id and company_id = app.current_company_id()
    and (requester_id = auth.uid() or (app.is_internal() and status <> 'DRAFT'));
  if r.id is null then return null; end if;
  select * into p from public.plan_line where id = r.plan_line_id;
  return greatest(r.estimated_value - (p.planned_amount - app.plan_committed(p.id, r.id)), 0);
end $$;

-- PR-01 AC1-AC7: create or update a DRAFT or RETURNED PR, replacing its lines; p_submit sends it
-- to approval. Returns the PR id. Lines are JSON: item_id, quantity, estimated_unit_price,
-- delivery_date, delivery_place_id, specification. The screen checks each line first and shows
-- the message under it; the same rules are checked here.
create function public.requisition_save(p_id uuid, p_plan_line_id uuid, p_lines jsonb, p_submit boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := app.current_company_id();
  r public.requisition;
  l record;
begin
  if not app.has_role('REQUESTER') then perform app.fail('errors.noAccess'); end if;

  if p_id is not null then
    select * into r from public.requisition where id = p_id and company_id = v_company for update;
    if r.id is null or r.requester_id <> auth.uid() then perform app.fail('errors.noAccess'); end if;
    if r.status not in ('DRAFT', 'RETURNED') then perform app.fail('errors.statusChanged'); end if;
  end if;

  if p_plan_line_id is null then perform app.fail('errors.required'); end if;
  -- PLN-01 AC2: a CLOSED line cannot be picked; a PR already on it (e.g. RETURNED) keeps it
  if p_plan_line_id is distinct from r.plan_line_id
     and not exists (select 1 from public.plan_line where id = p_plan_line_id and company_id = v_company and status = 'ACTIVE') then
    perform app.fail('errors.planLineClosed');
  end if;

  -- AC5: a draft may have no lines yet; AC6: Submit needs at least one. Every line that exists
  -- must pass the line rules, on Save as on Submit.
  if jsonb_typeof(coalesce(p_lines, '[]')) <> 'array' then perform app.fail('errors.lineRequired'); end if;
  p_lines := coalesce(p_lines, '[]');
  if p_submit and jsonb_array_length(p_lines) = 0 then perform app.fail('errors.lineRequired'); end if;
  for l in select * from jsonb_to_recordset(p_lines) as x(item_id uuid, quantity numeric, estimated_unit_price numeric,
                                                       delivery_date date, delivery_place_id uuid, specification text) loop
    -- AC1 / MDM-02 AC4-AC5: an active item of the plan line's category (or a child); an inactive
    -- item or place already on this PR may stay
    if l.item_id is null or not app.item_fits_plan_line(l.item_id, p_plan_line_id)
       or not exists (select 1 from public.item i where i.id = l.item_id
                      and (i.is_active or exists (select 1 from public.requisition_line o
                                                  where o.requisition_id = r.id and o.item_id = i.id))) then
      perform app.fail('errors.itemNotInPlanCategory');
    end if;
    if l.quantity is null or l.quantity <= 0 then perform app.fail('errors.quantityPositive'); end if;  -- AC2
    if l.estimated_unit_price is null or l.estimated_unit_price <= 0
       or l.estimated_unit_price <> round(l.estimated_unit_price, 2) then
      perform app.fail('errors.pricePositive');
    end if;
    if l.delivery_date is null or l.delivery_date < app.today() + 1 then
      perform app.fail('errors.deliveryDateFuture');                                -- AC3
    end if;
    if l.delivery_place_id is null or not exists (
         select 1 from public.delivery_place d where d.id = l.delivery_place_id and d.company_id = v_company
           and (d.is_active or exists (select 1 from public.requisition_line o
                                       where o.requisition_id = r.id and o.delivery_place_id = d.id))) then
      perform app.fail('errors.required');
    end if;
    if char_length(coalesce(l.specification, '')) > 2000 then perform app.fail('errors.specificationTooLong'); end if;
  end loop;

  if r.id is null then                                                              -- AC5: DRAFT with PR-YYYY-NNNN
    insert into public.requisition (company_id, number, plan_line_id, requester_id)
    values (v_company, app.next_number(v_company, 'PR'), p_plan_line_id, auth.uid())
    returning * into r;
  else
    update public.requisition set plan_line_id = p_plan_line_id where id = r.id;
  end if;

  delete from public.requisition_line where requisition_id = r.id;
  insert into public.requisition_line (requisition_id, item_id, quantity, estimated_unit_price, delivery_date,
                                       delivery_place_id, specification)
  select r.id, x.item_id, x.quantity, x.estimated_unit_price, x.delivery_date, x.delivery_place_id,
         nullif(btrim(x.specification), '')
  from jsonb_to_recordset(p_lines) as x(item_id uuid, quantity numeric, estimated_unit_price numeric,
                                        delivery_date date, delivery_place_id uuid, specification text);

  if p_submit then                                                                  -- AC5, AC7
    update public.requisition set status = 'PENDING_APPROVAL', submitted_at = now() where id = r.id;
    perform app.notify(array(select unnest(app.active_user_ids(v_company, 'APPROVER')) except select auth.uid()),
                       'pr.submitted', 'requisition', r.id, r.number);
  end if;
  return r.id;
end $$;

-- PR-02 AC1-AC4: one-step decision by an Approver who is not the Requester (#83).
create function public.requisition_decide(p_id uuid, p_decision text, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r        public.requisition;
  v_status text := case p_decision when 'APPROVE' then 'APPROVED' when 'RETURN' then 'RETURNED'
                                   when 'REJECT' then 'REJECTED' end;
begin
  if not app.has_role('APPROVER') then perform app.fail('errors.noAccess'); end if;
  select * into r from public.requisition where id = p_id and company_id = app.current_company_id() for update;
  if r.id is null or v_status is null then perform app.fail('errors.noAccess'); end if;
  if r.requester_id = auth.uid() then perform app.fail('errors.ownRequest'); end if;          -- AC4
  if r.status <> 'PENDING_APPROVAL' then perform app.fail('errors.statusChanged'); end if;
  if v_status <> 'APPROVED' and nullif(btrim(p_comment), '') is null then                    -- AC2, AC3
    perform app.fail(case v_status when 'RETURNED' then 'errors.commentRequired' else 'errors.reasonRequired' end);
  end if;

  perform set_config('app.audit_reason', coalesce(btrim(p_comment), ''), true);  -- comment stays in History (PR-01 AC7)
  update public.requisition set status = v_status, decision_comment = nullif(btrim(p_comment), '') where id = r.id;
  perform app.notify(array[r.requester_id], 'pr.' || lower(v_status), 'requisition', r.id, r.number,
                     jsonb_build_object('comment', btrim(p_comment)));
  if v_status = 'APPROVED' then                                                               -- AC1
    perform app.notify(app.active_user_ids(r.company_id, 'PROCUREMENT_SPECIALIST'), 'pr.readyForSourcing',
                       'requisition', r.id, r.number);
  end if;
end $$;

------------------------------------------------------------------
-- 7. Grants. New public functions are executable by anon by default: revoke, then grant.
------------------------------------------------------------------
revoke execute on function app.require_admin(), app.need(text), app.item_fits_plan_line(uuid, uuid),
  app.plan_committed(uuid, uuid), app.check_guarantee_currency() from public, anon, authenticated, service_role;
-- the plan view runs as the reader and calls app.plan_committed
grant execute on function app.plan_committed(uuid, uuid) to authenticated;

revoke execute on function public.currency_save(text, text, boolean, boolean), public.incoterm_save(text, text, boolean),
  public.payment_term_save(uuid, text, numeric, integer, boolean), public.delivery_place_save(uuid, text, text, text, boolean),
  public.delivery_mode_save(uuid, text, boolean), public.dictionary_delete(text, text),
  public.category_save(uuid, uuid, text, boolean, boolean), public.category_delete(uuid),
  public.item_save(uuid, uuid, text, text, text, boolean), public.item_delete(uuid),
  public.plan_line_save(uuid, integer, uuid, text, numeric, text), public.plan_line_close(uuid),
  public.requisition_plan_excess(uuid), public.requisition_save(uuid, uuid, jsonb, boolean),
  public.requisition_decide(uuid, text, text)
  from public, anon;
grant execute on function public.currency_save(text, text, boolean, boolean), public.incoterm_save(text, text, boolean),
  public.payment_term_save(uuid, text, numeric, integer, boolean), public.delivery_place_save(uuid, text, text, text, boolean),
  public.delivery_mode_save(uuid, text, boolean), public.dictionary_delete(text, text),
  public.category_save(uuid, uuid, text, boolean, boolean), public.category_delete(uuid),
  public.item_save(uuid, uuid, text, text, text, boolean), public.item_delete(uuid),
  public.plan_line_save(uuid, integer, uuid, text, numeric, text), public.plan_line_close(uuid),
  public.requisition_plan_excess(uuid), public.requisition_save(uuid, uuid, jsonb, boolean),
  public.requisition_decide(uuid, text, text)
  to authenticated;
