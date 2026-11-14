-- PLT-03: users change their own password; an Admin resets internal users and a Procurement Specialist resets
-- vendors with a temporary password (the release sends no e-mail, D-021).
-- No password is ever stored here: the temporary password is set in Supabase Auth by the server and shown once.
-- This migration only keeps the "must change password" mark, ends sessions and writes the audit events.

------------------------------------------------------------------
-- 1. The mark. Users cannot write it themselves (app_user update is limited to full_name, is_active).
------------------------------------------------------------------
alter table public.app_user add column must_change_password boolean not null default false;

------------------------------------------------------------------
-- 2. Audit events that are not status changes (PASSWORD_CHANGED, PASSWORD_RESET, PROFILE_UPDATED).
--    audit_entry.to_status holds the event name; the reason never holds a secret.
------------------------------------------------------------------
create function app.log_event(p_record_type text, p_record_id uuid, p_event text, p_reason text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_entry (company_id, record_type, record_id, from_status, to_status, user_id, reason)
  values (app.current_company_id(), p_record_type, p_record_id, null, p_event, auth.uid(), nullif(btrim(p_reason), ''))
$$;

-- History of a user (password events): the user itself, the Admin and the Procurement Specialist.
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
    when p_record_type = 'user' then
      p_record_id = auth.uid() or app.has_any_role(array['ADMIN', 'PROCUREMENT_SPECIALIST']::public.app_role[])
    else app.is_internal()
  end
$$;

------------------------------------------------------------------
-- 3. Own password: the server has verified the current password and set the new one; this clears the mark
--    and records PASSWORD_CHANGED (who and when, never the password).
------------------------------------------------------------------
create function public.password_change_done() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then perform app.fail('errors.noAccess'); end if;
  update public.app_user set must_change_password = false where id = auth.uid() and is_active;
  if not found then perform app.fail('errors.noAccess'); end if;
  perform app.log_event('user', auth.uid(), 'PASSWORD_CHANGED');
end $$;

------------------------------------------------------------------
-- 4. Reset: an Admin resets internal users (not themselves), a Procurement Specialist resets vendor
--    accounts; nobody else. The Admin cannot reset a vendor account.
------------------------------------------------------------------
create function app.reset_target(p_target uuid, p_vendor uuid default null) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_target uuid := p_target;
  v_is_vendor boolean;
  v_ok boolean := false;
begin
  if p_vendor is not null then
    select u.id into v_target from public.app_user u
    where u.vendor_id = p_vendor and u.company_id = app.current_company_id()
    order by u.created_at limit 1;
  end if;
  if v_target is null or auth.uid() is null then perform app.fail('errors.noAccess'); end if;
  perform 1 from public.app_user u
   where u.id = v_target and u.is_active and u.company_id = app.current_company_id();
  if not found then perform app.fail('errors.noAccess'); end if;

  select exists (select 1 from public.user_role r where r.user_id = v_target and r.role = 'VENDOR') into v_is_vendor;
  if v_is_vendor then
    v_ok := app.has_role('PROCUREMENT_SPECIALIST');
  else
    v_ok := app.has_role('ADMIN') and v_target <> auth.uid();
  end if;
  if not v_ok then perform app.fail('errors.noAccess'); end if;
  return v_target;
end $$;

-- Step 1 (server): who is allowed and which account it is.
create function public.password_reset_authorize(p_target uuid default null, p_vendor uuid default null) returns uuid
language sql stable security definer set search_path = '' as $$
  select app.reset_target(p_target, p_vendor)
$$;

-- Step 2 (server, after it set the temporary password in Auth): mark, end the sessions, audit.
-- Deleting the session rows also removes the refresh tokens, so no session can be renewed. An access
-- token that was already issued works until it expires (about an hour), but every page of the app stops
-- at the change-password form because of the mark.
create function public.password_reset_apply(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_target uuid := app.reset_target(p_target);
begin
  update public.app_user set must_change_password = true where id = v_target;
  delete from auth.sessions where user_id = v_target;
  perform app.log_event('user', v_target, 'PASSWORD_RESET');
end $$;

------------------------------------------------------------------
-- 5. Grants (new public functions are executable by anon by default: revoke, then grant)
------------------------------------------------------------------
revoke execute on function public.password_change_done(), public.password_reset_authorize(uuid, uuid),
  public.password_reset_apply(uuid) from public, anon;
grant execute on function public.password_change_done(), public.password_reset_authorize(uuid, uuid),
  public.password_reset_apply(uuid) to authenticated;
revoke execute on function app.log_event(text, uuid, text, text), app.reset_target(uuid, uuid)
  from public, anon, authenticated;
grant execute on function app.can_read_record(text, uuid) to authenticated;
