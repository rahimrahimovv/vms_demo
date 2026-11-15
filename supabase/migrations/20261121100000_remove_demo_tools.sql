-- D-024: the in-app demo tools are withdrawn (demo access page, demo bar, Switch user, Lock, End deadline now). The unlock and its
-- failed-attempt limit went with them: the table and its three functions are dropped. Kept: demo_flag, app.demo_reset, app.demo_seed,
-- app.seed_base, app.demo_backdate (the developer commands npm run demo:reset and demo:load).

drop function if exists public.demo_attempt_status(text);
drop function if exists public.demo_attempt_fail(text);
drop function if exists public.demo_attempt_clear(text);
drop table if exists public.demo_attempt;

-- app.demo_reset empties every public table except the flag (demo_attempt no longer exists). Same body as before otherwise.
create or replace function app.demo_reset(p_users jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company constant uuid := '00000000-0000-4000-8000-000000000001';
  v_tables text;
begin
  if not app.demo_enabled() then
    raise exception 'Demo reset refused: demo_flag is not enabled in this database' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('demo_reset'));

  select string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename) into v_tables
    from pg_tables
   where schemaname = 'public' and tablename <> 'demo_flag';
  execute 'truncate table ' || v_tables || ' restart identity cascade';

  perform app.demo_seed(p_users);

  delete from auth.sessions;   -- refresh tokens go with them: every user is signed out

  -- the seed fired the status audit triggers; the log starts again with one line
  truncate table public.audit_entry;
  insert into public.audit_entry (company_id, record_type, record_id, from_status, to_status, user_id, reason)
  values (v_company, 'demo', v_company, null, 'RESET', null, 'Reset to scenario start');

  return jsonb_build_object(
    'users', (select count(*) from public.app_user),
    'vendors', (select count(*) from public.vendor),
    'bankAccounts', (select count(*) from public.vendor_bank_account),
    'categories', (select count(*) from public.category),
    'items', (select count(*) from public.item),
    'planLines', (select count(*) from public.plan_line),
    'committeeMembers', (select count(*) from public.committee_member),
    'requisitions', (select count(*) from public.requisition),
    'sourcings', (select count(*) from public.sourcing),
    'minutes', (select count(*) from public.minutes),
    'auditEntries', (select count(*) from public.audit_entry));
end $$;

revoke execute on function app.demo_reset(jsonb) from public, anon, authenticated, service_role;
