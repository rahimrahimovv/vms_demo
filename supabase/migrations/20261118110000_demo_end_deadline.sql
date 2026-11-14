-- DEMO-01 AC4: "End deadline now" on an OPEN sourcing and on a running final-offer round.
-- The deadline becomes the current time and the deadline job runs at once, so the effect is immediate
-- (the job itself would also pick it up within a minute). Server only: service_role, never the API roles.
-- The demo gate (DEMO_MODE and an unlocked session) is checked by the server before it calls these.

-- Which deadline could be ended on this sourcing: 'OPEN', 'FINAL_OFFER_ROUND' or null.
create function public.demo_deadline_info(p_sourcing uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.status from public.sourcing s
   where s.id = p_sourcing and s.status in ('OPEN', 'FINAL_OFFER_ROUND')
$$;

create function public.demo_end_deadline(p_sourcing uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s public.sourcing;
begin
  select * into s from public.sourcing where id = p_sourcing for update;
  if s.id is null then return null; end if;
  if s.status = 'OPEN' then
    update public.sourcing set deadline = now() where id = s.id;
  elsif s.status = 'FINAL_OFFER_ROUND' then
    update public.sourcing set final_offer_deadline = now() where id = s.id;
  else
    return null;
  end if;
  perform app.close_due_sourcings();   -- same function as the every-minute cron job (RFQ-04, RFQ-08)
  return s.status;
end $$;

revoke execute on function public.demo_deadline_info(uuid), public.demo_end_deadline(uuid)
  from public, anon, authenticated;
grant execute on function public.demo_deadline_info(uuid), public.demo_end_deadline(uuid) to service_role;
