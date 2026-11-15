-- RFQ-09 (D-025): the owner of an OPEN sourcing closes it early. This replaces the "End deadline now" demo tool.
--
-- The closing logic of the deadline job is split out unchanged (app.close_open_sourcing): OPEN -> CLOSED, then the minimum check
-- decides between CLOSED (below the minimum) and AWAITING_OPENING (Tender) or COMPARISON (RFQ, SSP), and the owner is notified.
-- app.close_due_sourcings calls it with the reason "Deadline passed"; public.close_now calls it with the owner's reason.

create or replace function app.close_open_sourcing(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  v_count integer;
begin
  select * into s from public.sourcing where id = p_id and status = 'OPEN';
  if s.id is null then return; end if;
  perform set_config('app.audit_reason', p_reason, true);
  update public.sourcing set status = 'CLOSED' where id = s.id;
  v_count := app.submitted_count(s.id);
  if v_count >= s.min_proposals then perform app.advance_closed(s.id, p_reason); end if;
  perform app.notify(array[s.owner_id], 'sourcing.closed', 'sourcing', s.id, s.number,
                     jsonb_build_object('received', v_count, 'minimum', s.min_proposals));
end $$;

create or replace function app.close_due_sourcings() returns void
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  r record;
begin
  for s in select * from public.sourcing where status = 'OPEN' and deadline <= now()
           order by deadline for update skip locked loop
    perform app.close_open_sourcing(s.id, 'Deadline passed');
  end loop;

  for s in select * from public.sourcing where status = 'FINAL_OFFER_ROUND' and final_offer_deadline <= now()
           order by final_offer_deadline for update skip locked loop
    perform set_config('app.audit_reason', 'Final-offer deadline passed', true);
    update public.sourcing set status = 'COMPARISON' where id = s.id;
    -- the owner's own choices follow the vendor's latest price
    update public.award_line a set proposal_line_id = x2.id
      from public.proposal_line x1, public.proposal_line x2, public.sourcing_line sl
     where a.proposal_line_id = x1.id and x1.round = 1 and x2.proposal_id = x1.proposal_id
       and x2.sourcing_line_id = x1.sourcing_line_id and x2.round = 2
       and sl.id = a.sourcing_line_id and sl.sourcing_id = s.id and a.status = 'ACTIVE';
    perform app.notify(array[s.owner_id], 'finalOffer.closed', 'sourcing', s.id, s.number,
                       (select jsonb_build_object('responded', count(*) filter (where responded_at is not null),
                                                  'chosen', count(*))
                          from public.final_offer_request where sourcing_id = s.id));
  end loop;

  for r in select i.id, i.vendor_id, s2.id as sid, s2.number, s2.deadline
             from public.invitation i join public.sourcing s2 on s2.id = i.sourcing_id
            where s2.status = 'OPEN' and s2.deadline > now() and s2.deadline <= now() + interval '24 hours'
              and i.status in ('INVITED', 'ACCEPTED') and i.reminder_sent_at is null
              and not exists (select 1 from public.proposal p where p.sourcing_id = s2.id
                              and p.vendor_id = i.vendor_id and p.status = 'SUBMITTED') loop
    update public.invitation set reminder_sent_at = now() where id = r.id;
    perform app.notify(app.vendor_user_ids(r.vendor_id), 'sourcing.deadlineSoon', 'sourcing', r.sid, r.number,
                       jsonb_build_object('deadline', r.deadline));
  end loop;
end $$;

-- Invited vendors that have not answered: neither a SUBMITTED proposal nor a declined invitation.
create function app.unanswered_vendors(p_sourcing uuid) returns table (vendor_id uuid, legal_name text)
language sql stable security definer set search_path = '' as $$
  select v.id, v.legal_name
    from public.invitation i join public.vendor v on v.id = i.vendor_id
   where i.sourcing_id = p_sourcing and i.status <> 'DECLINED'
     and not exists (select 1 from public.proposal p
                      where p.sourcing_id = i.sourcing_id and p.vendor_id = i.vendor_id and p.status = 'SUBMITTED')
   order by v.legal_name
$$;

-- RFQ-09: close an OPEN sourcing now. Only the owner; a reason is required; every invitation must be answered.
create function public.close_now(p_sourcing uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s          public.sourcing := app.owned_sourcing(p_sourcing, array['OPEN']);
  v_reason   text := app.need(p_reason);
  v_open     integer;
  v_audit    text;
begin
  select count(*) into v_open from app.unanswered_vendors(s.id);
  if v_open > 0 then
    -- the message is a key; the count travels in the error detail ("N invited vendors have not answered yet")
    raise exception 'errors.vendorsNotAnswered' using errcode = 'P0001', detail = v_open::text;
  end if;

  v_audit := 'Closed early: ' || v_reason || ' (original deadline ' ||
             to_char(s.deadline at time zone 'Asia/Baku', 'DD Mon YYYY HH24:MI') || ')';
  update public.sourcing set deadline = now() where id = s.id;
  perform app.close_open_sourcing(s.id, v_audit);

  -- vendors with a submitted proposal are told; the reason stays internal
  perform app.notify(
    (select coalesce(array_agg(u), '{}') from public.proposal p, unnest(app.vendor_user_ids(p.vendor_id)) u
      where p.sourcing_id = s.id and p.status = 'SUBMITTED'),
    'sourcing.closedEarly', 'sourcing', s.id, s.number, '{}');
end $$;

-- What the record page needs to show the button: the names of the vendors that have not answered (owner of an OPEN sourcing only).
create function public.close_now_state(p_sourcing uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.sourcing;
begin
  select * into s from public.sourcing
   where id = p_sourcing and company_id = app.current_company_id() and owner_id = auth.uid() and status = 'OPEN'
     and app.has_role('PROCUREMENT_SPECIALIST');
  if s.id is null then return null; end if;
  return jsonb_build_object('deadline', s.deadline,
    'unanswered', (select coalesce(jsonb_agg(legal_name order by legal_name), '[]'::jsonb) from app.unanswered_vendors(s.id)));
end $$;

revoke execute on function app.close_open_sourcing(uuid, text), app.unanswered_vendors(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.close_now(uuid, text), public.close_now_state(uuid) from public, anon;
grant execute on function public.close_now(uuid, text), public.close_now_state(uuid) to authenticated;

-- The demo tool is gone: no function for it any more.
drop function if exists public.demo_end_deadline(uuid);
drop function if exists public.demo_deadline_info(uuid);
