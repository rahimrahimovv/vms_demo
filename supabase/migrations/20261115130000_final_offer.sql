-- Slice 6, RFQ-08: one final (discounted) offer round. The owner picks eligible vendors (default all), a deadline
-- (default 2 days, Admin setting) and a message; the sourcing becomes FINAL_OFFER_ROUND and only the chosen vendors
-- are notified. A chosen vendor enters a new unit price per line (round 2, never above its round-1 price) or keeps
-- its prices. New prices stay hidden until the round closes (app.prices_visible); the deadline job then returns the
-- sourcing to COMPARISON. Vendors that did not respond keep their previous prices (no round-2 rows).

-- AC1, AC6
create function public.final_offer_request(p_id uuid, p_vendors uuid[], p_deadline timestamptz, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s     public.sourcing := app.owned_sourcing(p_id, array['COMPARISON']);
  v_max integer := coalesce((app.setting(s.company_id, 'final_offer_rounds') #>> '{}')::integer, 1);
  v_users uuid[];
begin
  if s.final_offer_rounds_used >= v_max then perform app.fail('errors.finalOfferUsed'); end if;
  if p_deadline is null or p_deadline <= now() then perform app.fail('errors.deadlinePast'); end if;
  if coalesce(cardinality(p_vendors), 0) = 0 then perform app.fail('errors.pickVendors'); end if;
  if exists (select 1 from unnest(p_vendors) v(id)
              where not exists (select 1 from app.offer_rows(s.id) o where o.vendor_id = v.id)) then
    perform app.fail('errors.vendorNotEligible');
  end if;

  insert into public.final_offer_request (sourcing_id, vendor_id, message)
  select distinct s.id, v.id, nullif(btrim(p_message), '') from unnest(p_vendors) v(id);
  perform set_config('app.audit_reason', '', true);
  update public.sourcing
     set status = 'FINAL_OFFER_ROUND', final_offer_deadline = p_deadline,
         final_offer_rounds_used = final_offer_rounds_used + 1
   where id = s.id;

  select coalesce(array_agg(u), '{}') into v_users
    from (select distinct unnest(app.vendor_user_ids(v.id)) u from unnest(p_vendors) v(id)) x;
  perform app.notify(v_users, 'finalOffer.requested', 'sourcing', s.id, s.number,           -- AC7: chosen only
                     jsonb_build_object('deadline', p_deadline, 'message', coalesce(nullif(btrim(p_message), ''), '')));
end $$;

-- AC2-AC3: p_lines [{sourcing_line_id, unit_price}] for the lines it changes; p_keep confirms the previous prices.
-- The price is compared as entered (the VAT terms stay as submitted). Can be changed until the deadline.
create function public.final_offer_submit(p_sourcing uuid, p_lines jsonb, p_keep boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f public.final_offer_request;
  s public.sourcing;
  p public.proposal;
begin
  select * into f from public.final_offer_request
   where sourcing_id = p_sourcing and vendor_id = app.current_vendor_id() for update;
  if f.id is null then perform app.fail('errors.noAccess'); end if;
  select * into s from public.sourcing where id = p_sourcing;
  if s.status <> 'FINAL_OFFER_ROUND' or s.final_offer_deadline <= now() then perform app.fail('errors.deadlinePassed'); end if;
  select * into p from public.proposal where sourcing_id = p_sourcing and vendor_id = f.vendor_id;

  if not coalesce(p_keep, false) then
    if exists (select 1 from jsonb_to_recordset(coalesce(p_lines, '[]')) as l(sourcing_line_id uuid, unit_price numeric)
                where l.unit_price is not null and (l.unit_price <= 0 or l.unit_price <> round(l.unit_price, 2)
                      or not exists (select 1 from public.proposal_line x where x.proposal_id = p.id
                                     and x.sourcing_line_id = l.sourcing_line_id and x.round = 1))) then
      perform app.fail('errors.priceInvalid');
    end if;
    if exists (select 1 from jsonb_to_recordset(coalesce(p_lines, '[]')) as l(sourcing_line_id uuid, unit_price numeric)
                join public.proposal_line x on x.proposal_id = p.id and x.sourcing_line_id = l.sourcing_line_id and x.round = 1
                where l.unit_price > x.unit_price) then
      perform app.fail('errors.finalOfferHigher');                                         -- AC3
    end if;
  end if;

  delete from public.proposal_line where proposal_id = p.id and round = 2;
  if not coalesce(p_keep, false) then
    insert into public.proposal_line (proposal_id, sourcing_line_id, round, unit_price)
    select p.id, l.sourcing_line_id, 2, l.unit_price
      from jsonb_to_recordset(coalesce(p_lines, '[]')) as l(sourcing_line_id uuid, unit_price numeric)
     where l.unit_price is not null;
  end if;
  update public.final_offer_request set responded_at = now() where id = f.id;
end $$;

-- The deadline job, now also closing final-offer rounds (AC5). The rest is unchanged from Slice 4.
create or replace function app.close_due_sourcings() returns void
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  r record;
  v_count integer;
begin
  for s in select * from public.sourcing where status = 'OPEN' and deadline <= now()
           order by deadline for update skip locked loop
    perform set_config('app.audit_reason', 'Deadline passed', true);
    update public.sourcing set status = 'CLOSED' where id = s.id;
    v_count := app.submitted_count(s.id);
    if v_count >= s.min_proposals then perform app.advance_closed(s.id, 'Deadline passed'); end if;
    perform app.notify(array[s.owner_id], 'sourcing.closed', 'sourcing', s.id, s.number,
                       jsonb_build_object('received', v_count, 'minimum', s.min_proposals));
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

-- The vendor's view gains the final-offer request of this vendor (deadline, message, response time).
create or replace function public.vendor_invitation_view(p_sourcing uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'number', s.number, 'type', s.type, 'status', s.status, 'deadline', s.deadline,
    'techDocRequired', s.tech_doc_required, 'invitationStatus', i.status,
    'requiredIncoterm', s.required_incoterm, 'namedPlaceId', s.named_place_id,
    'deliveryModeId', s.delivery_mode_id, 'paymentTermId', s.payment_term_id,
    'finalOffer', (select jsonb_build_object('deadline', s.final_offer_deadline, 'message', f.message,
                                             'respondedAt', f.responded_at)
                     from public.final_offer_request f where f.sourcing_id = s.id and f.vendor_id = i.vendor_id),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', sl.id, 'item', it.name, 'code', it.code, 'unit', it.unit, 'quantity', rl.quantity,
                'deliveryDate', rl.delivery_date, 'deliveryPlace', dp.name, 'specification', rl.specification)
              order by it.name), '[]'::jsonb)
                from public.sourcing_line sl
                join public.requisition_line rl on rl.id = sl.requisition_line_id
                join public.item it on it.id = rl.item_id
                join public.delivery_place dp on dp.id = rl.delivery_place_id
               where sl.sourcing_id = s.id and sl.status = 'ACTIVE'))
    from public.invitation i join public.sourcing s on s.id = i.sourcing_id
   where i.sourcing_id = p_sourcing and i.vendor_id = app.current_vendor_id()
$$;

revoke execute on function public.final_offer_request(uuid, uuid[], timestamptz, text),
  public.final_offer_submit(uuid, jsonb, boolean), public.vendor_invitation_view(uuid) from public, anon;
grant execute on function public.final_offer_request(uuid, uuid[], timestamptz, text),
  public.final_offer_submit(uuid, jsonb, boolean), public.vendor_invitation_view(uuid) to authenticated;
