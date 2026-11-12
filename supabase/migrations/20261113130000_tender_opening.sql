-- Slice 5, CMT-04: a Tender closes into AWAITING_OPENING and an OPENING decision opens; APPROVED moves it to
-- TECHNICAL_EVALUATION with names and technical documents visible and prices still sealed. REJECTED and
-- NO_DECISION leave it at AWAITING_OPENING (the owner reopens the vote or cancels). Cancelling a sourcing closes
-- its open OPENING vote (RFQ-04 AC6, open issue 8 of Slice 4).

-- AC1, RFQ-04 AC2: Tender -> AWAITING_OPENING + OPENING decision; RFQ and SSP -> COMPARISON, prices open (AC5).
create or replace function app.advance_closed(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.sourcing;
begin
  select * into s from public.sourcing where id = p_id;
  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);
  if s.type = 'TENDER' then
    update public.sourcing set status = 'AWAITING_OPENING' where id = s.id;
    perform app.open_decision(s.id, 'OPENING');
  else
    update public.sourcing set status = 'COMPARISON', bids_opened_at = now(), prices_opened_at = now()
     where id = s.id;
  end if;
end $$;

-- AC2: approved opening = bids opened (names, technical documents), prices not (prices_opened_at stays empty
-- until the technical evaluation ends, Slice 6). AC4: nothing changes when it is rejected or has no decision.
create or replace function app.apply_decision_outcome(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.decision;
begin
  select * into d from public.decision where id = p_id;
  if d.type = 'OPENING' and d.status = 'APPROVED' then
    perform set_config('app.audit_reason', 'Opening approved', true);
    update public.sourcing set status = 'TECHNICAL_EVALUATION', bids_opened_at = now()
     where id = d.sourcing_id and status = 'AWAITING_OPENING';
  end if;
  -- WINNER and PO outcomes come with Slices 6 and 7.
end $$;

-- RFQ-04 AC6: Cancel closes an open OPENING decision as NO_DECISION ("Sourcing cancelled", reason kept, minutes
-- record it). Audit reason of the decision: "Sourcing cancelled"; of the sourcing: the owner's reason.
create or replace function public.sourcing_cancel(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.sourcing := app.owned_sourcing(p_id, array['DRAFT', 'OPEN', 'CLOSED', 'AWAITING_OPENING',
                                                       'TECHNICAL_EVALUATION', 'COMPARISON', 'FINAL_OFFER_ROUND']);
  r record;
begin
  perform app.need(p_reason);
  for r in select id from public.decision where sourcing_id = s.id and type = 'OPENING' and status = 'VOTING' loop
    perform app.close_decision(r.id, btrim(p_reason));
  end loop;
  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.sourcing set status = 'CANCELLED', cancel_reason = btrim(p_reason) where id = s.id;
  update public.requisition set status = 'APPROVED' where id = app.sourcing_requisition(s.id);
  perform app.notify(app.invited_user_ids(s.id), 'sourcing.cancelled', 'sourcing', s.id, s.number,
                     jsonb_build_object('reason', btrim(p_reason)));
end $$;

-- Existing Tenders already waiting at AWAITING_OPENING (from Slice 4) get their OPENING decision, but only
-- where a committee has been set up.
do $$
declare r record;
begin
  for r in select s.id from public.sourcing s
            where s.status = 'AWAITING_OPENING'
              and not exists (select 1 from public.decision d where d.sourcing_id = s.id)
              and exists (select 1 from public.committee c join public.committee_member m on m.committee_id = c.id
                           where c.company_id = s.company_id) loop
    perform app.open_decision(r.id, 'OPENING');
  end loop;
end $$;
