-- Slice 4: RFQ-01 (start sourcing, invitations, publish), RFQ-02 (vendor answers, sealed proposal),
-- RFQ-04 (deadline job; extend / continue / cancel), RFQ-06 (single source purchase).
-- Tables exist since the procurement-model migration. This adds the functions that change status,
-- the vendors' reduced view of a sourcing (issue 3 in PROGRESS.md), the file-attach check and the
-- deadline job. No new tables or columns. Sourcing, invitations and proposals are written only
-- through these functions (no write policies exist).
-- Message keys used here (errors.*, notification events) are added to messages/en.json with the screens.

-- RFQ-01 AC4 (revised 12 Nov 2026): the prefilled deadline is recalculated at Publish from the publish time
-- unless the specialist changed it; this flag says "still the prefilled one".
alter table public.sourcing add column deadline_prefilled boolean not null default false;

------------------------------------------------------------------
-- 1. Helpers
------------------------------------------------------------------
-- RFQ-01 AC3: Tender 3, SSP 1, RFQ from the Admin value bands (first band whose upper limit holds the value).
create function app.min_proposals(p_company uuid, p_type text, p_value numeric) returns integer
language sql stable security definer set search_path = '' as $$
  select case p_type when 'TENDER' then 3 when 'SSP' then 1 else coalesce(
    (select (b ->> 'min_proposals')::integer
       from jsonb_array_elements(app.setting(p_company, 'rfq_bands')) with ordinality as t(b, n)
      where b ->> 'up_to' is null or p_value <= (b ->> 'up_to')::numeric
      order by n limit 1), 3) end
$$;

-- Category of the sourcing = the plan line's category of its PR.
create function app.sourcing_category(p_sourcing uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select pl.category_id
    from public.sourcing_line sl
    join public.requisition_line rl on rl.id = sl.requisition_line_id
    join public.requisition r on r.id = rl.requisition_id
    join public.plan_line pl on pl.id = r.plan_line_id
   where sl.sourcing_id = p_sourcing limit 1
$$;

create function app.sourcing_requisition(p_sourcing uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select rl.requisition_id from public.sourcing_line sl
    join public.requisition_line rl on rl.id = sl.requisition_line_id
   where sl.sourcing_id = p_sourcing limit 1
$$;

-- RFQ-01 AC5: standing ACTIVE, valid grade A-C, QUALIFIED unexpired application in the category or a parent.
-- SSP: only the vendor chosen in DRAFT (RFQ-06 AC1). Vendors removed by the owner are left out.
create function app.invitee_ids(p_sourcing uuid, p_with_excluded boolean default false) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select v.id
    from public.sourcing s
    join public.vendor v on v.company_id = s.company_id
   where s.id = p_sourcing
     and app.is_in_avl(v.id, app.sourcing_category(s.id))
     and (case when s.type = 'SSP' then v.id = s.ssp_vendor_id
               else p_with_excluded or v.id <> all (s.excluded_vendor_ids) end)
$$;

-- Locks the sourcing row; only its owner (a Procurement Specialist) acts on it.
create function app.owned_sourcing(p_id uuid, p_statuses text[]) returns public.sourcing
language plpgsql security definer set search_path = '' as $$
declare s public.sourcing;
begin
  if not app.has_role('PROCUREMENT_SPECIALIST') then perform app.fail('errors.noAccess'); end if;
  select * into s from public.sourcing
   where id = p_id and company_id = app.current_company_id() and owner_id = auth.uid() for update;
  if s.id is null then perform app.fail('errors.noAccess'); end if;
  if not (s.status = any (p_statuses)) then perform app.fail('errors.statusChanged'); end if;
  return s;
end $$;

create function app.submitted_count(p_sourcing uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.proposal where sourcing_id = p_sourcing and status = 'SUBMITTED'
$$;

-- Vendors that were invited and have not declined (notified of extension, cancellation, ...).
create function app.invited_user_ids(p_sourcing uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(u), '{}')
    from public.invitation i, unnest(app.vendor_user_ids(i.vendor_id)) u
   where i.sourcing_id = p_sourcing and i.status <> 'DECLINED'
$$;

------------------------------------------------------------------
-- 2. RFQ-01 / RFQ-06: start sourcing from an APPROVED PR
------------------------------------------------------------------
create function public.sourcing_start(p_requisition uuid, p_method text, p_ssp_vendor uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r        public.requisition;
  v_type   text;
  v_days   integer;
  v_id     uuid;
  v_place  uuid;
  v_cat    uuid;
begin
  if not app.has_role('PROCUREMENT_SPECIALIST') then perform app.fail('errors.noAccess'); end if;
  select * into r from public.requisition
   where id = p_requisition and company_id = app.current_company_id() for update;
  if r.id is null then perform app.fail('errors.noAccess'); end if;
  if r.status <> 'APPROVED' then perform app.fail('errors.statusChanged'); end if;     -- AC1
  if p_method not in ('COMPETITIVE', 'SINGLE_SOURCE') then perform app.fail('errors.noAccess'); end if;

  select pl.category_id into v_cat from public.plan_line pl where pl.id = r.plan_line_id;
  if p_method = 'SINGLE_SOURCE' then                                                    -- RFQ-06 AC1
    if p_ssp_vendor is null then perform app.fail('errors.sspVendorRequired'); end if;
    if not exists (select 1 from public.vendor v where v.id = p_ssp_vendor and v.company_id = r.company_id)
       or not app.is_in_avl(p_ssp_vendor, v_cat) then
      perform app.fail('errors.vendorNotInAvl');
    end if;
    v_type := 'SSP';
  else                                                                                  -- RFQ-01 AC2
    v_type := case when r.estimated_value >= (app.setting(r.company_id, 'tender_threshold') #>> '{}')::numeric
                   then 'TENDER' else 'RFQ' end;
  end if;
  v_days := (app.setting(r.company_id, case v_type when 'TENDER' then 'tender_days' else 'rfq_days' end) #>> '{}')::integer;

  -- the PR's delivery place when all its lines agree
  select case when count(distinct delivery_place_id) = 1 then min(delivery_place_id::text)::uuid end
    into v_place from public.requisition_line where requisition_id = r.id;

  insert into public.sourcing (company_id, number, owner_id, method, type, value, min_proposals, deadline,
                               deadline_prefilled, required_incoterm, named_place_id, tech_doc_required, ssp_vendor_id)
  values (r.company_id, app.next_number(r.company_id, 'SRC'), auth.uid(), p_method, v_type, r.estimated_value,
          app.min_proposals(r.company_id, v_type, r.estimated_value),
          now() + make_interval(days => v_days), true,                                  -- AC4 prefill
          (select code from public.incoterm where code = 'DDP' and is_active), v_place,
          v_type = 'TENDER', case when v_type = 'SSP' then p_ssp_vendor end)
  returning id into v_id;
  insert into public.sourcing_line (sourcing_id, requisition_line_id)
  select v_id, id from public.requisition_line where requisition_id = r.id;

  perform set_config('app.audit_reason', '', true);
  update public.requisition set status = 'IN_SOURCING' where id = r.id;                 -- AC1
  return v_id;
end $$;

-- RFQ-01 AC4: edit a DRAFT. Deadline later than now; the rest is checked at Publish.
create function public.sourcing_save(p_id uuid, p_deadline timestamptz, p_incoterm text, p_named_place uuid,
                                     p_delivery_mode uuid, p_payment_term uuid, p_tech_doc boolean,
                                     p_justification text, p_excluded uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare s public.sourcing := app.owned_sourcing(p_id, array['DRAFT']);
begin
  -- untouched prefilled deadline stays "prefilled" (may be stale, recalculated at Publish);
  -- a deadline set by hand must be later than now
  if s.deadline_prefilled and p_deadline is not distinct from s.deadline then
    null;
  else
    if p_deadline is not null and p_deadline <= now() then perform app.fail('errors.deadlinePast'); end if;
  end if;
  update public.sourcing
     set deadline_prefilled = (s.deadline_prefilled and p_deadline is not distinct from s.deadline),
         deadline = p_deadline, required_incoterm = nullif(p_incoterm, ''), named_place_id = p_named_place,
         delivery_mode_id = p_delivery_mode, payment_term_id = p_payment_term,
         tech_doc_required = (s.type = 'TENDER' and coalesce(p_tech_doc, false)),
         ssp_justification = nullif(btrim(p_justification), ''),
         excluded_vendor_ids = case when s.type = 'SSP' then '{}' else coalesce(p_excluded, '{}') end
   where id = s.id;
end $$;

-- RFQ-01 AC5: the list the owner sees in DRAFT (removed vendors included, flagged).
create function public.sourcing_invitees(p_id uuid)
returns table (vendor_id uuid, legal_name text, grade text, excluded boolean)
language sql stable security definer set search_path = '' as $$
  select v.id, v.legal_name, app.vendor_grade(v.id), v.id = any (s.excluded_vendor_ids)
    from public.sourcing s, app.invitee_ids(s.id, true) as i(id)
    join public.vendor v on v.id = i.id
   where s.id = p_id and s.company_id = app.current_company_id()
     and app.has_any_role(array['PROCUREMENT_SPECIALIST', 'ADMIN']::public.app_role[])
   order by v.legal_name
$$;

create function public.sourcing_publish(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s       public.sourcing := app.owned_sourcing(p_id, array['DRAFT']);
  v_limit numeric := (app.setting(s.company_id, 'single_source_limit') #>> '{}')::numeric;
begin
  if s.type = 'SSP' and not app.is_in_avl(s.ssp_vendor_id, app.sourcing_category(s.id)) then
    perform app.fail('errors.vendorNotInAvl');
  end if;
  if s.type <> 'SSP' and not exists (select 1 from app.invitee_ids(s.id, true)) then     -- AC6
    perform app.fail('errors.noQualifiedVendors');
  end if;
  if s.deadline_prefilled then                                                           -- AC4: from the publish time
    s.deadline := now() + make_interval(days => (app.setting(s.company_id,
                    case s.type when 'TENDER' then 'tender_days' else 'rfq_days' end) #>> '{}')::integer);
  elsif s.deadline is null or s.deadline <= now() then
    perform app.fail('errors.deadlinePast');
  end if;
  if s.required_incoterm is null or s.named_place_id is null or s.delivery_mode_id is null
     or s.payment_term_id is null then
    perform app.fail('errors.required');
  end if;
  if not exists (select 1 from app.invitee_ids(s.id)) then perform app.fail('errors.noInvitees'); end if;
  if s.type = 'SSP' and s.value > v_limit                                                -- RFQ-06 AC2
     and (nullif(btrim(s.ssp_justification), '') is null
          or not exists (select 1 from public.file f where f.owner_type = 'sourcing' and f.owner_id = s.id
                         and f.kind = 'justification')) then
    perform app.fail('errors.sspJustification');
  end if;

  perform set_config('app.audit_reason', '', true);
  update public.sourcing set status = 'OPEN', deadline = s.deadline, deadline_prefilled = false
   where id = s.id;                                                                      -- AC7
  insert into public.invitation (company_id, sourcing_id, vendor_id)
  select s.company_id, s.id, i from app.invitee_ids(s.id) i;
  perform app.notify(app.invited_user_ids(s.id), 'sourcing.published', 'sourcing', s.id, s.number,
                     jsonb_build_object('type', s.type, 'deadline', s.deadline));
end $$;

------------------------------------------------------------------
-- 3. RFQ-04: deadline passes, then extend / continue / cancel
------------------------------------------------------------------
-- After CLOSED: minimum reached (or Continue) -> Tender AWAITING_OPENING, RFQ and SSP COMPARISON
-- with names, technical documents and prices opened (AC2). A Tender's prices stay sealed.
create function app.advance_closed(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.sourcing;
begin
  select * into s from public.sourcing where id = p_id;
  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);
  if s.type = 'TENDER' then
    update public.sourcing set status = 'AWAITING_OPENING' where id = s.id;             -- opening vote: Slice 5
  else
    update public.sourcing set status = 'COMPARISON', bids_opened_at = now(), prices_opened_at = now()
     where id = s.id;
  end if;
end $$;

-- Called by pg_cron every minute (RFQ-04 AC1, NFR-010); DEMO-01 "End deadline now" calls it directly in Slice 8.
create function app.close_due_sourcings() returns void
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  r record;
  v_count integer;
begin
  for s in select * from public.sourcing where status = 'OPEN' and deadline <= now()
           order by deadline for update skip locked loop
    perform set_config('app.audit_reason', 'Deadline passed', true);
    update public.sourcing set status = 'CLOSED' where id = s.id;                       -- AC1
    v_count := app.submitted_count(s.id);
    if v_count >= s.min_proposals then perform app.advance_closed(s.id, 'Deadline passed'); end if;   -- AC2
    perform app.notify(array[s.owner_id], 'sourcing.closed', 'sourcing', s.id, s.number,
                       jsonb_build_object('received', v_count, 'minimum', s.min_proposals));
  end loop;

  -- 24-hour reminder to invited vendors that neither declined nor submitted (Flow & Notifications)
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

select cron.schedule('vms-sourcing', '* * * * *', 'select app.close_due_sourcings()');   -- every minute (NFR-010)

-- AC3: the owner sees "Below minimum: N of M" with the submitted count only (sealed, NFR-002).
create function public.sourcing_proposal_count(p_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select app.submitted_count(s.id) from public.sourcing s
   where s.id = p_id and s.company_id = app.current_company_id() and app.is_internal()
$$;

create function public.sourcing_extend(p_id uuid, p_deadline timestamptz, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.sourcing := app.owned_sourcing(p_id, array['CLOSED']);
  v_max integer := (app.setting(s.company_id, 'max_extensions') #>> '{}')::integer;
begin
  if s.extension_count >= v_max then perform app.fail('errors.maxExtensions'); end if;  -- AC4
  if p_deadline is null or p_deadline <= now() then perform app.fail('errors.deadlinePast'); end if;
  perform app.need(p_reason);
  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.sourcing set status = 'OPEN', deadline = p_deadline, extension_count = extension_count + 1
   where id = s.id;
  update public.invitation set reminder_sent_at = null where sourcing_id = s.id;        -- reminder again
  perform app.notify(app.invited_user_ids(s.id), 'sourcing.extended', 'sourcing', s.id, s.number,
                     jsonb_build_object('deadline', p_deadline));
end $$;

-- AC5: Continue below the minimum; the reason is kept for the committee package (RFQ-05 AC5 reads it).
create function public.sourcing_continue(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.sourcing := app.owned_sourcing(p_id, array['CLOSED']);
begin
  if app.submitted_count(s.id) = 0 then perform app.fail('errors.statusChanged'); end if;
  perform app.need(p_reason);
  update public.sourcing set low_competition_reason = btrim(p_reason) where id = s.id;
  perform app.advance_closed(s.id, btrim(p_reason));
end $$;

-- AC6: cancel from any open stage; the PR goes back to APPROVED (Status Transition Model).
create function public.sourcing_cancel(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.sourcing := app.owned_sourcing(p_id, array['DRAFT', 'OPEN', 'CLOSED', 'AWAITING_OPENING',
                                                             'TECHNICAL_EVALUATION', 'COMPARISON', 'FINAL_OFFER_ROUND']);
begin
  perform app.need(p_reason);
  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.sourcing set status = 'CANCELLED', cancel_reason = btrim(p_reason) where id = s.id;
  update public.requisition set status = 'APPROVED' where id = app.sourcing_requisition(s.id);
  perform app.notify(app.invited_user_ids(s.id), 'sourcing.cancelled', 'sourcing', s.id, s.number,
                     jsonb_build_object('reason', btrim(p_reason)));
end $$;

------------------------------------------------------------------
-- 4. RFQ-02: the vendor's side. Vendors never read sourcing or requisition tables;
--    these functions return only their own invitation and the lines without PR prices.
------------------------------------------------------------------
create function public.vendor_invitation_list()
returns table (sourcing_id uuid, number text, type text, sourcing_status text, deadline timestamptz,
               invitation_status text, proposal_status text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.number, s.type, s.status, s.deadline, i.status, p.status
    from public.invitation i
    join public.sourcing s on s.id = i.sourcing_id
    left join public.proposal p on p.sourcing_id = s.id and p.vendor_id = i.vendor_id
   where i.vendor_id = app.current_vendor_id()
   order by s.deadline desc
$$;

-- AC1: header, required terms and lines (item, quantity, unit, delivery date, place, specification).
create function public.vendor_invitation_view(p_sourcing uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'number', s.number, 'type', s.type, 'status', s.status, 'deadline', s.deadline,
    'techDocRequired', s.tech_doc_required, 'invitationStatus', i.status,
    'requiredIncoterm', s.required_incoterm, 'namedPlaceId', s.named_place_id,
    'deliveryModeId', s.delivery_mode_id, 'paymentTermId', s.payment_term_id,
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

-- Own invitation, locked, sourcing OPEN and before the deadline (AC7).
create function app.open_invitation(p_sourcing uuid, p_statuses text[]) returns public.invitation
language plpgsql security definer set search_path = '' as $$
declare i public.invitation; s public.sourcing;
begin
  select * into i from public.invitation
   where sourcing_id = p_sourcing and vendor_id = app.current_vendor_id() for update;
  if i.id is null then perform app.fail('errors.noAccess'); end if;
  select * into s from public.sourcing where id = p_sourcing;
  if s.status <> 'OPEN' or s.deadline <= now() then perform app.fail('errors.deadlinePassed'); end if;
  if not (i.status = any (p_statuses)) then perform app.fail('errors.statusChanged'); end if;
  return i;
end $$;

-- AC3: Accept creates the DRAFT proposal with every term preset to the required value.
create function public.invitation_accept(p_sourcing uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invitation := app.open_invitation(p_sourcing, array['INVITED']); s public.sourcing;
begin
  select * into s from public.sourcing where id = p_sourcing;
  perform set_config('app.audit_reason', '', true);
  update public.invitation set status = 'ACCEPTED' where id = i.id;
  insert into public.proposal (company_id, sourcing_id, vendor_id, incoterm, named_place_id, delivery_mode_id,
                               payment_term_id, prices_include_vat)
  values (s.company_id, s.id, i.vendor_id, s.required_incoterm, s.named_place_id, s.delivery_mode_id,
          s.payment_term_id, false);
end $$;

-- AC2: reason required; the owner reads it on the sourcing.
create function public.invitation_decline(p_sourcing uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invitation := app.open_invitation(p_sourcing, array['INVITED']);
begin
  perform app.need(p_reason);
  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.invitation set status = 'DECLINED', decline_reason = btrim(p_reason) where id = i.id;
end $$;

-- AC3-AC6: save a draft or submit. p_terms: incoterm, named_place_id, delivery_mode_id, payment_term_id,
-- prices_include_vat, vat_rate, delivery_days, validity_days, comment. p_lines: [{sourcing_line_id, unit_price}].
-- A SUBMITTED proposal is edited only by resubmitting (AC6).
create function public.proposal_save(p_sourcing uuid, p_terms jsonb, p_lines jsonb, p_submit boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  i      public.invitation := app.open_invitation(p_sourcing, array['ACCEPTED']);
  s      public.sourcing;
  p      public.proposal;
  t      record;
  v_incl boolean;
begin
  select * into s from public.sourcing where id = p_sourcing;
  select * into p from public.proposal where sourcing_id = p_sourcing and vendor_id = i.vendor_id for update;
  if p.status = 'SUBMITTED' and not p_submit then perform app.fail('errors.statusChanged'); end if;

  select * into t from jsonb_to_record(p_terms) as x(incoterm text, named_place_id uuid, delivery_mode_id uuid,
         payment_term_id uuid, prices_include_vat boolean, vat_rate numeric, delivery_days integer,
         validity_days integer, comment text);
  v_incl := coalesce(t.prices_include_vat, false);
  if t.incoterm is null or t.named_place_id is null or t.delivery_mode_id is null or t.payment_term_id is null then
    perform app.fail('errors.required');
  end if;
  if v_incl and coalesce(t.vat_rate, 0) <= 0 then perform app.fail('errors.vatRateRequired'); end if;  -- AC3
  if exists (select 1 from jsonb_to_recordset(p_lines) as l(sourcing_line_id uuid, unit_price numeric)
              where l.unit_price is not null
                and (l.unit_price <= 0 or l.unit_price <> round(l.unit_price, 2)
                     or not exists (select 1 from public.sourcing_line sl where sl.id = l.sourcing_line_id
                                    and sl.sourcing_id = p_sourcing and sl.status = 'ACTIVE'))) then
    perform app.fail('errors.priceInvalid');                                             -- AC3: > 0, 2 decimals
  end if;

  if p_submit then
    if not exists (select 1 from jsonb_to_recordset(p_lines) as l(unit_price numeric) where l.unit_price is not null) then
      perform app.fail('errors.priceRequired');                                          -- AC5
    end if;
    if s.type = 'TENDER' and s.tech_doc_required and not exists (
         select 1 from public.file f where f.owner_type = 'proposal' and f.owner_id = p.id
            and f.kind = 'technical_document') then
      perform app.fail('errors.techDocRequired');                                        -- AC4
    end if;
  end if;

  update public.proposal
     set incoterm = t.incoterm, named_place_id = t.named_place_id, delivery_mode_id = t.delivery_mode_id,
         payment_term_id = t.payment_term_id, prices_include_vat = v_incl,
         vat_rate = case when v_incl then t.vat_rate else 0 end,
         delivery_days = t.delivery_days, validity_days = t.validity_days, comment = nullif(btrim(t.comment), '')
   where id = p.id;
  delete from public.proposal_line where proposal_id = p.id and round = 1;
  insert into public.proposal_line (proposal_id, sourcing_line_id, round, unit_price)
  select p.id, l.sourcing_line_id, 1, l.unit_price
    from jsonb_to_recordset(p_lines) as l(sourcing_line_id uuid, unit_price numeric) where l.unit_price is not null;

  if p_submit then
    perform set_config('app.audit_reason', '', true);
    update public.proposal set status = 'SUBMITTED', submitted_at = now() where id = p.id;
  end if;
end $$;

-- AC6: withdraw before the deadline; can be submitted again.
create function public.proposal_withdraw(p_sourcing uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invitation := app.open_invitation(p_sourcing, array['ACCEPTED']);
begin
  perform set_config('app.audit_reason', '', true);
  update public.proposal set status = 'WITHDRAWN'
   where sourcing_id = p_sourcing and vendor_id = i.vendor_id and status = 'SUBMITTED';
  if not found then perform app.fail('errors.statusChanged'); end if;
end $$;

------------------------------------------------------------------
-- 5. Files: who may attach or remove a file (the server checks this, then writes with the secret key)
------------------------------------------------------------------
-- 'sourcing' justification files: the owner while DRAFT (RFQ-06 AC2).
-- 'proposal' technical documents: the vendor, until the deadline (RFQ-02 AC4, AC7).
create function public.file_attach_allowed(p_owner_type text, p_owner_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_owner_type
    when 'sourcing' then exists (select 1 from public.sourcing s where s.id = p_owner_id
                                 and s.owner_id = auth.uid() and s.status = 'DRAFT')
    when 'proposal' then exists (select 1 from public.proposal p join public.sourcing s on s.id = p.sourcing_id
                                 where p.id = p_owner_id and p.vendor_id = app.current_vendor_id()
                                   and p.status in ('DRAFT', 'SUBMITTED', 'WITHDRAWN')
                                   and s.status = 'OPEN' and s.deadline > now())
    else false end
$$;

------------------------------------------------------------------
-- 6. Grants. New public functions are executable by anon by default: revoke, then grant.
------------------------------------------------------------------
revoke execute on function app.min_proposals(uuid, text, numeric), app.sourcing_category(uuid),
  app.sourcing_requisition(uuid), app.invitee_ids(uuid, boolean), app.owned_sourcing(uuid, text[]),
  app.submitted_count(uuid), app.invited_user_ids(uuid), app.advance_closed(uuid, text),
  app.close_due_sourcings(), app.open_invitation(uuid, text[])
  from public, anon, authenticated, service_role;

revoke execute on function public.sourcing_start(uuid, text, uuid),
  public.sourcing_save(uuid, timestamptz, text, uuid, uuid, uuid, boolean, text, uuid[]),
  public.sourcing_invitees(uuid), public.sourcing_publish(uuid), public.sourcing_proposal_count(uuid),
  public.sourcing_extend(uuid, timestamptz, text), public.sourcing_continue(uuid, text),
  public.sourcing_cancel(uuid, text), public.vendor_invitation_list(), public.vendor_invitation_view(uuid),
  public.invitation_accept(uuid), public.invitation_decline(uuid, text),
  public.proposal_save(uuid, jsonb, jsonb, boolean), public.proposal_withdraw(uuid),
  public.file_attach_allowed(text, uuid)
  from public, anon;
grant execute on function public.sourcing_start(uuid, text, uuid),
  public.sourcing_save(uuid, timestamptz, text, uuid, uuid, uuid, boolean, text, uuid[]),
  public.sourcing_invitees(uuid), public.sourcing_publish(uuid), public.sourcing_proposal_count(uuid),
  public.sourcing_extend(uuid, timestamptz, text), public.sourcing_continue(uuid, text),
  public.sourcing_cancel(uuid, text), public.vendor_invitation_list(), public.vendor_invitation_view(uuid),
  public.invitation_accept(uuid), public.invitation_decline(uuid, text),
  public.proposal_save(uuid, jsonb, jsonb, boolean), public.proposal_withdraw(uuid),
  public.file_attach_allowed(text, uuid)
  to authenticated;
