-- DEMO-01 / D-022: failed demo-code attempts are limited per IP.
-- Deliberate exception to CLAUDE.md rule 7: demo_attempt carries no company_id. It is infrastructure of the demo
-- gate (a hash of an IP address and a counter), not business data, and it belongs to no company.
-- Only the server (service_role) reads or writes it: RLS is on, there are no policies, no grants for the API roles.

create table public.demo_attempt (
  ip_hash       text primary key,            -- sha-256 of the client IP with the session secret; never the IP itself
  failures      integer not null default 0,
  window_start  timestamptz not null default now(),
  locked_until  timestamptz
);
alter table public.demo_attempt enable row level security;   -- no policies: functions only
revoke all on public.demo_attempt from anon, authenticated;

-- Is this IP locked out right now? Returns the seconds left (0 = free).
create function public.demo_attempt_status(p_ip_hash text) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select greatest(0, ceil(extract(epoch from (a.locked_until - now())))::integer)
     from public.demo_attempt a where a.ip_hash = p_ip_hash and a.locked_until is not null),
    0)
$$;

-- Counts one failed attempt: 5 failures inside 15 minutes lock the IP for 15 minutes. Returns the seconds locked.
create function public.demo_attempt_fail(p_ip_hash text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_expired boolean;
  v public.demo_attempt;
begin
  select (a.window_start < now() - interval '15 minutes') or (a.locked_until is not null and a.locked_until < now())
    into v_expired from public.demo_attempt a where a.ip_hash = p_ip_hash for update;

  if v_expired then
    update public.demo_attempt set failures = 1, window_start = now(), locked_until = null
    where ip_hash = p_ip_hash returning * into v;
  elsif found then
    update public.demo_attempt set failures = failures + 1 where ip_hash = p_ip_hash returning * into v;
  else
    insert into public.demo_attempt (ip_hash, failures) values (p_ip_hash, 1)
    on conflict (ip_hash) do update set failures = public.demo_attempt.failures + 1
    returning * into v;
  end if;

  if v.failures >= 5 and v.locked_until is null then
    update public.demo_attempt set locked_until = now() + interval '15 minutes' where ip_hash = p_ip_hash;
  end if;
  return public.demo_attempt_status(p_ip_hash);
end $$;

-- A correct code clears the counter.
create function public.demo_attempt_clear(p_ip_hash text) returns void
language sql security definer set search_path = '' as $$
  delete from public.demo_attempt where ip_hash = p_ip_hash
$$;

revoke execute on function public.demo_attempt_status(text), public.demo_attempt_fail(text),
  public.demo_attempt_clear(text) from public, anon, authenticated;
grant execute on function public.demo_attempt_status(text), public.demo_attempt_fail(text),
  public.demo_attempt_clear(text) to service_role;
