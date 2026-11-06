-- Slice 1 · PLT-01, PLT-02
-- company, app_user, user_role, setting, audit_entry, notification. RLS next to each table.

------------------------------------------------------------------
-- 0. Private schema for helpers (not exposed through the REST API)
------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

create type public.app_role as enum (
  'REQUESTER', 'APPROVER', 'PROCUREMENT_SPECIALIST',
  'COMMITTEE_MEMBER', 'ADMIN', 'VENDOR'
);

------------------------------------------------------------------
-- 1. Tables
------------------------------------------------------------------
create table public.company (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);

create table public.app_user (
  id         uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.company (id),
  full_name  text not null check (btrim(full_name) <> ''),
  email      text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index app_user_email_key on public.app_user (lower(email));
create index app_user_company_idx on public.app_user (company_id);
-- app_user.vendor_id (ERD) is added in the REG-01 migration with the vendor table.

create table public.user_role (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_user (id) on delete cascade,
  role    public.app_role not null,
  unique (user_id, role)
);

create table public.setting (
  company_id uuid not null references public.company (id),
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (company_id, key)
);

create table public.audit_entry (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.company (id),
  record_type text not null,
  record_id   uuid not null,
  from_status text,
  to_status   text not null,
  user_id     uuid references public.app_user (id),  -- null = System (jobs)
  reason      text,
  created_at  timestamptz not null default now()     -- displayed in Asia/Baku
);
create index audit_entry_record_idx on public.audit_entry (record_type, record_id, created_at desc);

create table public.notification (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.company (id),
  user_id       uuid not null references public.app_user (id) on delete cascade,
  event         text not null,               -- message key in messages/en.json, e.g. 'pr.submitted'
  record_type   text not null,
  record_id     uuid not null,
  record_number text,                        -- e.g. PR-2026-0001, shown in the bell
  params        jsonb not null default '{}', -- values for the message text
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index notification_user_idx on public.notification (user_id, is_read, created_at desc);

------------------------------------------------------------------
-- 2. Helpers for policies (SECURITY DEFINER avoids RLS recursion).
--    A deactivated user gets null/false everywhere, so they read nothing.
------------------------------------------------------------------
create function app.current_company_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.company_id from public.app_user u
  where u.id = (select auth.uid()) and u.is_active
$$;

create function app.has_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_role r join public.app_user u on u.id = r.user_id
    where r.user_id = (select auth.uid()) and u.is_active and r.role = p_role)
$$;

create function app.is_internal() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_role r join public.app_user u on u.id = r.user_id
    where r.user_id = (select auth.uid()) and u.is_active and r.role <> 'VENDOR')
$$;

-- Who may read a record's History. Replaced (create or replace) in later slices
-- as record types appear; vendors get their own records from Slice 2.
create function app.can_read_record(p_record_type text, p_record_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    -- NFR-002: invitation/proposal history names the vendor; hidden from internal
    -- users until Slice 4 adds the "deadline passed" check.
    when p_record_type in ('invitation', 'proposal') then false
    else (select app.is_internal())
  end
$$;

------------------------------------------------------------------
-- 3. RLS: company (written only by migrations / seed)
------------------------------------------------------------------
alter table public.company enable row level security;
create policy company_select on public.company for select to authenticated
  using (id = (select app.current_company_id()));

------------------------------------------------------------------
-- 4. RLS: app_user
--    Vendors see only themselves; internal users see their company's users.
--    Admin creates and edits users (auth user itself is created server-side).
------------------------------------------------------------------
alter table public.app_user enable row level security;
create policy app_user_select on public.app_user for select to authenticated
  using (id = (select auth.uid())
         or ((select app.is_internal()) and company_id = (select app.current_company_id())));
create policy app_user_admin_insert on public.app_user for insert to authenticated
  with check ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()));
create policy app_user_admin_update on public.app_user for update to authenticated
  using      ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()))
  with check ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()));
revoke update on public.app_user from authenticated;
grant update (full_name, is_active) on public.app_user to authenticated;  -- e-mail stays in sync with Auth

------------------------------------------------------------------
-- 5. RLS: user_role
--    Admin assigns internal roles only (vendors self-register in REG-01).
------------------------------------------------------------------
alter table public.user_role enable row level security;
create policy user_role_select on public.user_role for select to authenticated
  using (user_id = (select auth.uid())
         or ((select app.has_role('ADMIN')) and exists (
              select 1 from public.app_user u
              where u.id = user_role.user_id and u.company_id = (select app.current_company_id()))));
create policy user_role_admin_insert on public.user_role for insert to authenticated
  with check ((select app.has_role('ADMIN')) and role <> 'VENDOR'
              and exists (select 1 from public.app_user u
                          where u.id = user_role.user_id and u.company_id = (select app.current_company_id())));
create policy user_role_admin_delete on public.user_role for delete to authenticated
  using ((select app.has_role('ADMIN')) and role <> 'VENDOR'
         and not (user_id = (select auth.uid()) and role = 'ADMIN')  -- no self-lockout
         and exists (select 1 from public.app_user u
                     where u.id = user_role.user_id and u.company_id = (select app.current_company_id())));
-- No update policy: change a role by delete + insert.

-- A vendor account holds VENDOR only; an internal account never holds VENDOR.
create function app.check_vendor_role_exclusive() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.user_role r
             where r.user_id = new.user_id and r.id <> new.id
               and ((new.role = 'VENDOR') <> (r.role = 'VENDOR'))) then
    raise exception 'A vendor account cannot hold internal roles' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger user_role_vendor_exclusive before insert or update on public.user_role
  for each row execute function app.check_vendor_role_exclusive();

------------------------------------------------------------------
-- 6. RLS: setting (keys created by seed; Admin edits values)
------------------------------------------------------------------
alter table public.setting enable row level security;
create policy setting_select on public.setting for select to authenticated
  using ((select app.is_internal()) and company_id = (select app.current_company_id()));
create policy setting_admin_update on public.setting for update to authenticated
  using      ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()))
  with check ((select app.has_role('ADMIN')) and company_id = (select app.current_company_id()));

------------------------------------------------------------------
-- 7. RLS: audit_entry. Read per record access; written only by trigger;
--    never changed or deleted, not even by Admin or the secret key (PLT-02 AC6).
------------------------------------------------------------------
alter table public.audit_entry enable row level security;
create policy audit_entry_select on public.audit_entry for select to authenticated
  using (company_id = (select app.current_company_id())
         and app.can_read_record(record_type, record_id));
revoke insert, update, delete, truncate on public.audit_entry from anon, authenticated, service_role;
-- TRUNCATE stays with the table owner only, for Reset demo (DEMO-02).

create function app.refuse_audit_change() returns trigger
language plpgsql as $$
begin
  raise exception 'Audit entries cannot be changed or deleted' using errcode = '42501';
end $$;
create trigger audit_entry_immutable before update or delete on public.audit_entry
  for each row execute function app.refuse_audit_change();

-- Generic status audit (NFR-011). Later migrations attach it to every status table:
--   create trigger pr_audit after insert or update of status on public.requisition
--     for each row execute function app.audit_status_change('requisition');
-- Business functions pass the comment/reason with:
--   perform set_config('app.audit_reason', p_reason, true);
create function app.audit_status_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_new  jsonb := to_jsonb(new);
  v_from text  := case when tg_op = 'UPDATE' then to_jsonb(old) ->> 'status' end;
begin
  if tg_op = 'UPDATE' and v_from is not distinct from v_new ->> 'status' then
    return null;
  end if;
  insert into public.audit_entry (company_id, record_type, record_id, from_status, to_status, user_id, reason)
  values (coalesce((v_new ->> 'company_id')::uuid, app.current_company_id()),
          tg_argv[0], (v_new ->> 'id')::uuid, v_from, v_new ->> 'status',
          auth.uid(), nullif(current_setting('app.audit_reason', true), ''));
  return null;
end $$;

------------------------------------------------------------------
-- 8. RLS: notification. Own rows only; user may flip is_read, nothing else.
------------------------------------------------------------------
alter table public.notification enable row level security;
create policy notification_select_own on public.notification for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_update_own on public.notification for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.notification from anon, authenticated;
grant update (is_read) on public.notification to authenticated;

alter publication supabase_realtime add table public.notification;  -- live bell

-- Caller picks recipients per the Notification table (and only users with access, PLT-02 AC3).
create function app.notify(p_user_ids uuid[], p_event text, p_record_type text, p_record_id uuid,
                           p_record_number text, p_params jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.notification (company_id, user_id, event, record_type, record_id, record_number, params)
  select u.company_id, u.id, p_event, p_record_type, p_record_id, p_record_number, coalesce(p_params, '{}')
  from public.app_user u
  where u.id = any (p_user_ids) and u.is_active
$$;

------------------------------------------------------------------
-- 9. Grants
------------------------------------------------------------------
revoke all on public.company, public.app_user, public.user_role,
              public.setting, public.audit_entry, public.notification from anon;
revoke execute on all functions in schema app from public, anon, authenticated, service_role;
grant execute on function app.current_company_id(), app.has_role(public.app_role),
                          app.is_internal(), app.can_read_record(text, uuid) to authenticated;
-- app.notify and app.audit_status_change are called only from triggers and SECURITY DEFINER functions.
