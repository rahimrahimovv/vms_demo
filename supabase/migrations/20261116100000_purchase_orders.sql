-- Slice 7: purchase orders (PO-01, PO-02, PO-03) and the outcome hooks of the committee engine (CMT-02 AC3, AC9, AC10).
--
-- PO-01: an APPROVED winner decision creates one PO per winning vendor from the ACTIVE award lines that are not on a PO
--        yet. A PO line holds the award line's quantity and the vendor's own latest unit price excluding VAT (never the
--        extra costs of RFQ-07); VAT is the vendor's rate. The PO is created PENDING_APPROVAL and has no edit action:
--        the only writers are the functions below.
-- PO-02: the Approver approves (a PO decision opens, its package frozen in decision.package) or rejects (reason). Not
--        for the PR's Requester and, new on 13 Nov 2026, not for the owner of the sourcing (#83).
-- PO-03: the vendor accepts or declines a FULLY_APPROVED PO. When every line is on an ACCEPTED PO or cancelled, the
--        sourcing and the PR become COMPLETED and the vendors get their result notice (#41).
--
-- Decisions of 13 Nov 2026 (BA): an ACCEPTED PO keeps its lines when another PO is rejected or declined, and the other
-- POs keep their own workflow; the sourcing completes only with at least one ACCEPTED PO; a sourcing that has a PO other
-- than REJECTED or DECLINED_BY_VENDOR cannot be cancelled (its open lines are cancelled instead).

------------------------------------------------------------------
-- 1. Columns the PO needs (ERD additions): the proposal it comes from, the vendor's VAT rate, the winner decision
------------------------------------------------------------------
alter table public.purchase_order
  add column proposal_id        uuid references public.proposal (id),
  add column vat_rate           numeric(5,2) not null default 0 check (vat_rate between 0 and 100),
  add column winner_decision_id uuid references public.decision (id);

------------------------------------------------------------------
-- 2. Helpers: a "live" PO is one that is not REJECTED or DECLINED_BY_VENDOR
------------------------------------------------------------------
create function app.award_on_po(p_award uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.purchase_order_line pl join public.purchase_order po on po.id = pl.purchase_order_id
                  where pl.award_line_id = p_award and po.status not in ('REJECTED', 'DECLINED_BY_VENDOR'))
$$;

create function app.line_on_live_po(p_line uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.purchase_order_line pl
                   join public.award_line a on a.id = pl.award_line_id
                   join public.purchase_order po on po.id = pl.purchase_order_id
                  where a.sourcing_line_id = p_line and po.status not in ('REJECTED', 'DECLINED_BY_VENDOR'))
$$;

create function app.line_po_number(p_line uuid) returns text
language sql stable security definer set search_path = '' as $$
  select po.number from public.purchase_order_line pl
    join public.award_line a on a.id = pl.award_line_id
    join public.purchase_order po on po.id = pl.purchase_order_id
   where a.sourcing_line_id = p_line and po.status not in ('REJECTED', 'DECLINED_BY_VENDOR')
   order by po.created_at desc limit 1
$$;

-- The Requester of the PR behind a sourcing.
create function app.sourcing_requester(p_sourcing uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select rq.requester_id from public.requisition rq where rq.id = app.sourcing_requisition(p_sourcing)
$$;

------------------------------------------------------------------
-- 3. PO-01: create the POs of an APPROVED winner decision
------------------------------------------------------------------
create function app.create_purchase_orders(p_decision uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d           public.decision;
  s           public.sourcing;
  r           record;
  v_po        uuid;
  v_number    text;
  v_vat       numeric;
  v_approvers uuid[];
begin
  select * into d from public.decision where id = p_decision;
  select * into s from public.sourcing where id = d.sourcing_id;
  -- AC3, backlog 13 Nov 2026: every Approver except the PR's Requester and the sourcing owner
  v_approvers := array(select unnest(app.active_user_ids(s.company_id, 'APPROVER'))
                       except select x from unnest(array[app.sourcing_requester(s.id), s.owner_id]) x);
  perform set_config('app.audit_reason', '', true);

  for r in
    select p.id as proposal_id, p.vendor_id, p.incoterm, p.named_place_id, p.delivery_mode_id, p.payment_term_id,
           p.vat_rate, v.legal_name,
           sum(round(app.price_excl_vat(pl.unit_price, p.prices_include_vat, p.vat_rate) * a.quantity, 2)) as total
      from public.award_line a
      join public.sourcing_line sl on sl.id = a.sourcing_line_id and sl.sourcing_id = s.id and sl.status = 'ACTIVE'
      join public.proposal_line pl on pl.id = a.proposal_line_id
      join public.proposal p on p.id = pl.proposal_id
      join public.vendor v on v.id = p.vendor_id
     where a.status = 'ACTIVE' and not app.award_on_po(a.id)
     group by p.id, p.vendor_id, p.incoterm, p.named_place_id, p.delivery_mode_id, p.payment_term_id, p.vat_rate, v.legal_name
     order by v.legal_name loop
    v_vat := round(r.total * r.vat_rate / 100, 2);
    v_number := app.next_number(s.company_id, 'PO');
    insert into public.purchase_order (company_id, number, sourcing_id, vendor_id, proposal_id, winner_decision_id,
                                       incoterm, named_place_id, delivery_mode_id, payment_term_id,
                                       total, vat_rate, vat_amount, total_incl_vat)
    values (s.company_id, v_number, s.id, r.vendor_id, r.proposal_id, d.id,
            r.incoterm, r.named_place_id, r.delivery_mode_id, r.payment_term_id,
            r.total, r.vat_rate, v_vat, r.total + v_vat)
    returning id into v_po;

    insert into public.purchase_order_line (purchase_order_id, award_line_id, quantity, unit_price, line_total)
    select v_po, a.id, a.quantity, app.price_excl_vat(pl.unit_price, p.prices_include_vat, p.vat_rate),
           round(app.price_excl_vat(pl.unit_price, p.prices_include_vat, p.vat_rate) * a.quantity, 2)
      from public.award_line a
      join public.sourcing_line sl on sl.id = a.sourcing_line_id and sl.sourcing_id = s.id and sl.status = 'ACTIVE'
      join public.proposal_line pl on pl.id = a.proposal_line_id
      join public.proposal p on p.id = pl.proposal_id
     where a.status = 'ACTIVE' and p.id = r.proposal_id and not app.award_on_po(a.id);

    perform app.notify(v_approvers, 'po.created', 'purchase_order', v_po, v_number,
                       jsonb_build_object('vendor', r.legal_name, 'total', r.total));
  end loop;
end $$;

-- Lines of a rejected or declined PO go back to COMPARISON with that vendor excluded for them (RFQ-05 AC7);
-- only that PO's lines, and the sourcing moves back only from WINNER_APPROVED (Status Transition Model).
create function app.return_po_lines(p_po uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare po public.purchase_order;
begin
  select * into po from public.purchase_order where id = p_po;
  update public.award_line set status = 'REJECTED'
   where status = 'ACTIVE' and id in (select award_line_id from public.purchase_order_line where purchase_order_id = p_po);
  perform set_config('app.audit_reason', p_reason, true);
  update public.sourcing set status = 'COMPARISON' where id = po.sourcing_id and status = 'WINNER_APPROVED';
end $$;

------------------------------------------------------------------
-- 4. PO-03 AC4: completion. Every active line is on an ACCEPTED PO (or cancelled) and at least one PO is ACCEPTED.
--    From WINNER_APPROVED, and from COMPARISON when the owner cancels the last open line while other POs are accepted.
------------------------------------------------------------------
create function app.complete_if_done(p_sourcing uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s       public.sourcing;
  r       record;
  v_won   text;
  v_users uuid[];
begin
  select * into s from public.sourcing where id = p_sourcing for update;
  if s.id is null or s.status not in ('WINNER_APPROVED', 'COMPARISON') then return; end if;
  if not exists (select 1 from public.purchase_order where sourcing_id = s.id and status = 'ACCEPTED') then return; end if;
  if exists (select 1 from public.sourcing_line sl
              where sl.sourcing_id = s.id and sl.status = 'ACTIVE'
                and not exists (select 1 from public.award_line a
                                  join public.purchase_order_line pl on pl.award_line_id = a.id
                                  join public.purchase_order po on po.id = pl.purchase_order_id
                                 where a.sourcing_line_id = sl.id and a.status = 'ACTIVE' and po.status = 'ACCEPTED')) then
    return;
  end if;

  perform set_config('app.audit_reason', '', true);
  -- #41: every vendor with a submitted proposal gets the lines it won, or "Not awarded"
  for r in select p.id, p.vendor_id from public.proposal p
            where p.sourcing_id = s.id and p.status in ('SUBMITTED', 'PASSED') loop
    select string_agg(it.name || ' (' || trim_scale(pl.quantity)::text || ' ' || it.unit || ', ' || po.number || ')',
                      '; ' order by it.name)
      into v_won
      from public.purchase_order po
      join public.purchase_order_line pl on pl.purchase_order_id = po.id
      join public.award_line a on a.id = pl.award_line_id and a.status = 'ACTIVE'
      join public.sourcing_line sl on sl.id = a.sourcing_line_id
      join public.requisition_line rl on rl.id = sl.requisition_line_id
      join public.item it on it.id = rl.item_id
     where po.sourcing_id = s.id and po.status = 'ACCEPTED' and po.proposal_id = r.id;
    v_users := app.vendor_user_ids(r.vendor_id);
    if v_won is null then
      update public.proposal set status = 'NOT_AWARDED' where id = r.id;
      perform app.notify(v_users, 'sourcing.notAwarded', 'sourcing', s.id, s.number);
    else
      update public.proposal set status = 'AWARDED' where id = r.id;
      perform app.notify(v_users, 'sourcing.completed', 'sourcing', s.id, s.number, jsonb_build_object('lines', v_won));
    end if;
  end loop;

  perform set_config('app.audit_reason', 'Every line is on an accepted PO or cancelled', true);
  update public.sourcing set status = 'COMPLETED' where id = s.id;
  update public.requisition set status = 'COMPLETED'
   where id = app.sourcing_requisition(s.id) and status = 'IN_SOURCING';
end $$;

------------------------------------------------------------------
-- 5. CMT-02 AC3: the PO package = the PO and every difference from the approved winner decision
------------------------------------------------------------------
create function app.po_package(p_po uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  po      public.purchase_order;
  w       jsonb;
  wl      jsonb;
  wc      jsonb;
  wv      jsonb;
  r       record;
  v_lines jsonb;
  v_diff  jsonb := '[]'::jsonb;
  v_vendor text;
  v_place  text;
  v_mode   text;
  v_term   text;
begin
  select * into po from public.purchase_order where id = p_po;
  select package into w from public.decision where id = po.winner_decision_id;
  select legal_name into v_vendor from public.vendor where id = po.vendor_id;
  select name into v_place from public.delivery_place where id = po.named_place_id;
  select name into v_mode from public.delivery_mode where id = po.delivery_mode_id;
  select name into v_term from public.payment_term where id = po.payment_term_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'item', it.name, 'unit', it.unit, 'quantity', pl.quantity, 'unitPrice', pl.unit_price,
           'lineTotal', pl.line_total, 'deliveryDate', rl.delivery_date, 'place', dp.name) order by it.name, sl.id), '[]')
    into v_lines
    from public.purchase_order_line pl
    join public.award_line a on a.id = pl.award_line_id
    join public.sourcing_line sl on sl.id = a.sourcing_line_id
    join public.requisition_line rl on rl.id = sl.requisition_line_id
    join public.item it on it.id = rl.item_id
    left join public.delivery_place dp on dp.id = rl.delivery_place_id
   where pl.purchase_order_id = po.id;

  if w is not null then
    select x into wv from jsonb_array_elements(w -> 'vendors') x where x ->> 'proposalId' = po.proposal_id::text;
    for r in select sl.id as line_id, it.name as item, pl.quantity, pl.unit_price, pl.line_total
               from public.purchase_order_line pl
               join public.award_line a on a.id = pl.award_line_id
               join public.sourcing_line sl on sl.id = a.sourcing_line_id
               join public.requisition_line rl on rl.id = sl.requisition_line_id
               join public.item it on it.id = rl.item_id
              where pl.purchase_order_id = po.id order by it.name, sl.id loop
      wl := null; wc := null;
      select x into wl from jsonb_array_elements(w -> 'lines') x where x ->> 'id' = r.line_id::text;
      if wl is null or wl ->> 'chosenProposalId' is distinct from po.proposal_id::text then
        v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', 'vendor', 'item', r.item,
          'winner', (select x ->> 'name' from jsonb_array_elements(w -> 'vendors') x
                      where x ->> 'proposalId' = wl ->> 'chosenProposalId'),
          'po', v_vendor));
      else
        select x into wc from jsonb_array_elements(wl -> 'cells') x where x ->> 'proposalId' = po.proposal_id::text;
        if (wl ->> 'quantity')::numeric is distinct from r.quantity then
          v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', 'quantity', 'item', r.item,
            'winner', (wl ->> 'quantity')::numeric, 'po', r.quantity));
        end if;
        if wc is null or (wc ->> 'unitExclVat')::numeric is distinct from r.unit_price then
          v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', 'unitPrice', 'item', r.item,
            'winner', (wc ->> 'unitExclVat')::numeric, 'po', r.unit_price));
        end if;
        if wc is null or (wc ->> 'lineTotal')::numeric is distinct from r.line_total then
          v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', 'total', 'item', r.item,
            'winner', (wc ->> 'lineTotal')::numeric, 'po', r.line_total));
        end if;
      end if;
    end loop;
    if wv ->> 'incoterm' is distinct from po.incoterm then
      v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', 'incoterm', 'winner', wv ->> 'incoterm', 'po', po.incoterm));
    end if;
    if wv ->> 'namedPlace' is distinct from v_place then
      v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', 'namedPlace', 'winner', wv ->> 'namedPlace', 'po', v_place));
    end if;
    if wv ->> 'deliveryMode' is distinct from v_mode then
      v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', 'deliveryMode', 'winner', wv ->> 'deliveryMode', 'po', v_mode));
    end if;
    if wv ->> 'paymentTerm' is distinct from v_term then
      v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', 'paymentTerm', 'winner', wv ->> 'paymentTerm', 'po', v_term));
    end if;
  end if;

  return jsonb_build_object(
    'po', jsonb_build_object('number', po.number, 'vendor', v_vendor, 'lines', v_lines, 'total', po.total,
                             'vatRate', po.vat_rate, 'vatAmount', po.vat_amount, 'totalInclVat', po.total_incl_vat,
                             'incoterm', po.incoterm, 'namedPlace', v_place, 'deliveryMode', v_mode, 'paymentTerm', v_term),
    'differences', v_diff,
    'same', jsonb_array_length(v_diff) = 0);
end $$;

------------------------------------------------------------------
-- 6. The comparison document: lines already on a live PO are marked (locked) and left out of the winner proposal
------------------------------------------------------------------
create or replace function app.comparison_json(p_sourcing uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.sourcing where id = p_sourcing),
  o as (select * from app.offer_rows(p_sourcing)),
  lo as (select o.sourcing_line_id, min(o.evaluated) as low, count(*) as eligible from o where not o.excluded group by 1),
  dw as (select * from app.default_winners(p_sourcing)),
  ch as (select a.sourcing_line_id, x.proposal_id, a.justification
           from public.award_line a
           join public.proposal_line x on x.id = a.proposal_line_id
           join public.sourcing_line sl on sl.id = a.sourcing_line_id
          where sl.sourcing_id = p_sourcing and a.status = 'ACTIVE'),
  ln as (
    select sl.id, sl.status, sl.cancel_reason, it.name as item, it.unit, rl.quantity, rl.delivery_date,
           dp.name as place, rl.estimated_unit_price as estimate,
           coalesce(lo.eligible, 0) as eligible, lo.low,
           dw.proposal_id as default_id, ch.proposal_id as chosen_id, ch.justification,
           app.line_on_live_po(sl.id) as locked, app.line_po_number(sl.id) as po_number
      from public.sourcing_line sl
      join public.requisition_line rl on rl.id = sl.requisition_line_id
      join public.item it on it.id = rl.item_id
      left join public.delivery_place dp on dp.id = rl.delivery_place_id
      left join lo on lo.sourcing_line_id = sl.id
      left join dw on dw.sourcing_line_id = sl.id
      left join ch on ch.sourcing_line_id = sl.id
     where sl.sourcing_id = p_sourcing),
  bidders as (
    select p.*, v.legal_name, v.standing
      from public.proposal p join public.vendor v on v.id = p.vendor_id
     where p.sourcing_id = p_sourcing and p.status not in ('DRAFT', 'WITHDRAWN')),
  eligible_p as (
    select b.* from bidders b, s
     where (s.type = 'TENDER' and b.status = 'PASSED') or (s.type <> 'TENDER' and b.status = 'SUBMITTED')),
  winners as (
    select ln.id as line_id, coalesce(ln.chosen_id, ln.default_id) as proposal_id, ln.quantity
      from ln where ln.status = 'ACTIVE' and not ln.locked and coalesce(ln.chosen_id, ln.default_id) is not null),
  last_winner as (
    select d.id, d.status from public.decision d
     where d.sourcing_id = p_sourcing and d.type = 'WINNER' order by d.opened_at desc limit 1)
  select jsonb_build_object(
    'sourcing', (select jsonb_build_object(
        'id', s.id, 'number', s.number, 'type', s.type, 'status', s.status, 'minimum', s.min_proposals,
        'lowCompetitionReason', s.low_competition_reason, 'sspJustification', s.ssp_justification,
        'sspFiles', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.file_name) order by f.uploaded_at), '[]')
                       from public.file f where f.owner_type = 'sourcing' and f.owner_id = s.id and f.kind = 'justification'),
        'requiredIncoterm', s.required_incoterm,
        'requiredPlace', (select name from public.delivery_place where id = s.named_place_id),
        'requiredMode', (select name from public.delivery_mode where id = s.delivery_mode_id),
        'requiredPaymentTerm', (select name from public.payment_term where id = s.payment_term_id),
        'finalOfferRoundsUsed', s.final_offer_rounds_used,
        'finalOfferRoundsMax', coalesce((app.setting(s.company_id, 'final_offer_rounds') #>> '{}')::integer, 1),
        'finalOfferDays', coalesce((app.setting(s.company_id, 'final_offer_days') #>> '{}')::integer, 2),
        'finalOfferDeadline', s.final_offer_deadline,
        'needsLowCompetitionReason', exists (select 1 from ln where ln.status = 'ACTIVE' and not ln.locked and ln.eligible < s.min_proposals),
        'lastWinnerDecision', (select jsonb_build_object('id', id, 'status', status) from last_winner))
      from s),
    'vendors', (select coalesce(jsonb_agg(jsonb_build_object(
        'proposalId', b.id, 'vendorId', b.vendor_id, 'name', b.legal_name, 'grade', app.vendor_grade(b.vendor_id),
        'standing', b.standing, 'incoterm', b.incoterm,
        'namedPlace', (select name from public.delivery_place where id = b.named_place_id),
        'deliveryMode', (select name from public.delivery_mode where id = b.delivery_mode_id),
        'paymentTerm', (select name from public.payment_term where id = b.payment_term_id),
        'differentTerms', to_jsonb(array_remove(array[
            case when b.incoterm is distinct from s.required_incoterm then 'incoterm' end,
            case when b.named_place_id is distinct from s.named_place_id then 'namedPlace' end,
            case when b.delivery_mode_id is distinct from s.delivery_mode_id then 'deliveryMode' end,
            case when b.payment_term_id is distinct from s.payment_term_id then 'paymentTerm' end], null)),
        'deliveryDays', b.delivery_days, 'validityDays', b.validity_days,
        'includesVat', b.prices_include_vat, 'vatRate', b.vat_rate, 'submittedAt', b.submitted_at,
        -- REG-06 AC8: only vendors that also bid here
        'sharedOwners', (select coalesce(jsonb_agg(distinct b2.legal_name), '[]')
                           from public.vendor_owner o1
                           join public.vendor_owner o2 on upper(btrim(o2.id_number)) = upper(btrim(o1.id_number))
                                                       and o2.vendor_id <> o1.vendor_id
                           join bidders b2 on b2.vendor_id = o2.vendor_id
                          where o1.vendor_id = b.vendor_id),
        'finalOffer', (select jsonb_build_object('respondedAt', f.responded_at) from public.final_offer_request f
                        where f.sourcing_id = s.id and f.vendor_id = b.vendor_id))
        order by b.submitted_at, b.id), '[]')
      from eligible_p b, s),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', ln.id, 'status', ln.status, 'cancelReason', ln.cancel_reason, 'item', ln.item, 'unit', ln.unit,
        'quantity', ln.quantity, 'deliveryDate', ln.delivery_date, 'place', ln.place, 'estimate', ln.estimate,
        'eligibleCount', ln.eligible, 'lowest', ln.low, 'defaultProposalId', ln.default_id,
        'chosenProposalId', coalesce(ln.chosen_id, ln.default_id), 'manual', ln.chosen_id is not null,
        'justification', ln.justification, 'locked', ln.locked, 'poNumber', ln.po_number,
        'notLowest', ln.chosen_id is not null
                     and (select o.evaluated from o where o.sourcing_line_id = ln.id and o.proposal_id = ln.chosen_id) > ln.low,
        'cells', (select coalesce(jsonb_agg(jsonb_build_object(
            'proposalId', o.proposal_id, 'proposalLineId', o.proposal_line_id, 'round', o.round,
            'entered', o.entered, 'unitExclVat', o.unit_excl,
            'firstExclVat', case when o.round = 2 then o.first_excl end,
            'extra', o.extra, 'evaluated', o.evaluated, 'lineTotal', round(o.unit_excl * ln.quantity, 2),
            'excluded', o.excluded,
            'costs', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type,
                                         'amount', c.amount_per_unit, 'note', c.note) order by c.created_at), '[]')
                        from public.comparison_cost c
                       where c.proposal_id = o.proposal_id and c.sourcing_line_id = o.sourcing_line_id))), '[]')
                    from o where o.sourcing_line_id = ln.id))
        order by ln.item, ln.id), '[]')
      from ln),
    'disqualified', (select coalesce(jsonb_agg(jsonb_build_object(
        'proposalId', b.id, 'name', b.legal_name, 'grade', app.vendor_grade(b.vendor_id), 'reason', b.disqualify_reason)
        order by b.legal_name), '[]')
      from bidders b where b.status = 'DISQUALIFIED'),
    'purchaseOrders', (select coalesce(jsonb_agg(po order by po ->> 'name'), '[]') from (
        select jsonb_build_object('proposalId', b.id, 'name', b.legal_name, 'lines', count(*),
                 'total', sum(round(o.unit_excl * w.quantity, 2)), 'incoterm', b.incoterm,
                 'namedPlace', (select name from public.delivery_place where id = b.named_place_id)) as po
          from winners w
          join o on o.sourcing_line_id = w.line_id and o.proposal_id = w.proposal_id
          join bidders b on b.id = w.proposal_id
         group by b.id, b.legal_name, b.incoterm, b.named_place_id) x),
    -- RFQ-05 AC7, CMT-02 AC9: the members' comments of a rejected winner decision
    'committeeComments', (select coalesce(jsonb_agg(jsonb_build_object('name', u.full_name, 'vote', v.vote,
                                                    'comment', v.comment) order by u.full_name), '[]')
                            from last_winner lw
                            join public.decision_voter v on v.decision_id = lw.id
                            join public.app_user u on u.id = v.user_id
                           where lw.status = 'REJECTED' and v.comment is not null))
$$;

------------------------------------------------------------------
-- 7. Lines on a live PO are locked in COMPARISON: no new winner, no cancel, no extra costs (the other lines work as before)
------------------------------------------------------------------
create or replace function public.award_choose(p_line uuid, p_proposal uuid, p_justification text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sl    public.sourcing_line;
  s     public.sourcing;
  o     record;
  v_low numeric;
begin
  select * into sl from public.sourcing_line where id = p_line;
  if sl.id is null then perform app.fail('errors.noAccess'); end if;
  s := app.owned_sourcing(sl.sourcing_id, array['COMPARISON']);
  if sl.status <> 'ACTIVE' then perform app.fail('errors.statusChanged'); end if;
  if app.line_on_live_po(sl.id) then perform app.fail('errors.lineOnPurchaseOrder'); end if;
  if p_proposal is not null then
    select * into o from app.offer_rows(s.id) r where r.sourcing_line_id = sl.id and r.proposal_id = p_proposal and not r.excluded;
    if o.proposal_id is null then perform app.fail('errors.vendorNotEligible'); end if;
    select min(r.evaluated) into v_low from app.offer_rows(s.id) r where r.sourcing_line_id = sl.id and not r.excluded;
    if o.evaluated > v_low and nullif(btrim(p_justification), '') is null then
      perform app.fail('errors.justificationRequired');
    end if;
  end if;
  delete from public.award_line where sourcing_line_id = sl.id and status = 'ACTIVE';
  if p_proposal is not null then
    insert into public.award_line (sourcing_line_id, proposal_line_id, quantity, justification)
    select sl.id, o.proposal_line_id, rl.quantity, nullif(btrim(p_justification), '')
      from public.requisition_line rl where rl.id = sl.requisition_line_id;
  end if;
end $$;

create or replace function public.sourcing_line_cancel(p_line uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sl public.sourcing_line;
  s  public.sourcing;
begin
  select * into sl from public.sourcing_line where id = p_line;
  if sl.id is null then perform app.fail('errors.noAccess'); end if;
  s := app.owned_sourcing(sl.sourcing_id, array['COMPARISON']);
  if sl.status <> 'ACTIVE' then perform app.fail('errors.statusChanged'); end if;
  if app.line_on_live_po(sl.id) then perform app.fail('errors.lineOnPurchaseOrder'); end if;
  update public.sourcing_line set status = 'CANCELLED', cancel_reason = app.need(p_reason) where id = sl.id;
  delete from public.award_line where sourcing_line_id = sl.id and status = 'ACTIVE';
  perform app.complete_if_done(s.id);
end $$;

create or replace function app.cost_sourcing(p_line uuid) returns public.sourcing
language plpgsql security definer set search_path = '' as $$
declare s public.sourcing;
begin
  select sr.* into s from public.sourcing_line sl join public.sourcing sr on sr.id = sl.sourcing_id where sl.id = p_line;
  if s.id is null then perform app.fail('errors.noAccess'); end if;
  s := app.owned_sourcing(s.id, array['DRAFT', 'OPEN', 'CLOSED', 'AWAITING_OPENING', 'TECHNICAL_EVALUATION', 'COMPARISON',
                                      'FINAL_OFFER_ROUND', 'IN_COMMITTEE', 'WINNER_APPROVED', 'COMPLETED', 'CANCELLED']);
  if s.status <> 'COMPARISON' then perform app.fail('errors.costsLocked'); end if;          -- RFQ-07 AC4
  if app.line_on_live_po(p_line) then perform app.fail('errors.lineOnPurchaseOrder'); end if;
  return s;
end $$;

------------------------------------------------------------------
-- 8. RFQ-05 AC6: Send to committee for the lines that are not on a PO; the frozen package holds only those lines
------------------------------------------------------------------
------------------------------------------------------------------
-- 7. RFQ-05 AC5-AC6, RFQ-06 AC6: Send to committee
------------------------------------------------------------------
create or replace function public.sourcing_send_to_committee(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s     public.sourcing := app.owned_sourcing(p_id, array['COMPARISON']);
  r     record;
  v_dec uuid;
  v_pkg jsonb;
begin
  if nullif(btrim(p_reason), '') is not null then
    s.low_competition_reason := btrim(p_reason);
    update public.sourcing set low_competition_reason = s.low_competition_reason where id = s.id;
  end if;
  if not exists (select 1 from public.sourcing_line sl where sl.sourcing_id = s.id and sl.status = 'ACTIVE' and not app.line_on_live_po(sl.id)) then
    perform app.fail('errors.noWinners');                       -- every line cancelled: cancel the sourcing instead
  end if;
  if exists (select 1 from public.sourcing_line sl where sl.sourcing_id = s.id and sl.status = 'ACTIVE' and not app.line_on_live_po(sl.id)
              and not exists (select 1 from app.offer_rows(s.id) o where o.sourcing_line_id = sl.id and not o.excluded)) then
    perform app.fail('errors.lineNeedsWinner');                 -- AC4: a line with no eligible offer is cancelled
  end if;
  if s.low_competition_reason is null and exists (
       select 1 from public.sourcing_line sl where sl.sourcing_id = s.id and sl.status = 'ACTIVE' and not app.line_on_live_po(sl.id)
          and (select count(*) from app.offer_rows(s.id) o where o.sourcing_line_id = sl.id and not o.excluded)
              < s.min_proposals) then
    perform app.fail('errors.lowCompetitionReason');            -- AC5
  end if;

  -- the owner's choices: still eligible, justified when not the lowest, pointing at the latest price
  for r in select a.id, a.sourcing_line_id, a.justification, o.proposal_line_id, o.evaluated,
                  (select min(o2.evaluated) from app.offer_rows(s.id) o2
                    where o2.sourcing_line_id = a.sourcing_line_id and not o2.excluded) as low
             from public.award_line a
             join public.sourcing_line sl on sl.id = a.sourcing_line_id and sl.sourcing_id = s.id
             join public.proposal_line x on x.id = a.proposal_line_id
             left join app.offer_rows(s.id) o on o.sourcing_line_id = a.sourcing_line_id
                                             and o.proposal_id = x.proposal_id and not o.excluded
            where a.status = 'ACTIVE' and not app.award_on_po(a.id) loop
    if r.proposal_line_id is null then perform app.fail('errors.vendorNotEligible'); end if;
    if r.evaluated > r.low and r.justification is null then perform app.fail('errors.justificationRequired'); end if;
    update public.award_line set proposal_line_id = r.proposal_line_id where id = r.id;
  end loop;

  -- default winners for the other lines, full quantity
  insert into public.award_line (sourcing_line_id, proposal_line_id, quantity)
  select d.sourcing_line_id, d.proposal_line_id, rl.quantity
    from app.default_winners(s.id) d
    join public.sourcing_line sl on sl.id = d.sourcing_line_id
    join public.requisition_line rl on rl.id = sl.requisition_line_id
   where not exists (select 1 from public.award_line a where a.sourcing_line_id = d.sourcing_line_id and a.status = 'ACTIVE');

  v_pkg := app.comparison_json(s.id) || jsonb_build_object('frozenAt', now());
  v_pkg := jsonb_set(v_pkg, '{lines}', (select coalesce(jsonb_agg(l), '[]'::jsonb) from jsonb_array_elements(v_pkg -> 'lines') l
                                       where not (l ->> 'locked')::boolean));
  perform set_config('app.audit_reason', '', true);
  update public.sourcing set status = 'IN_COMMITTEE' where id = s.id;
  v_dec := app.open_decision(s.id, 'WINNER');
  update public.decision set package = v_pkg where id = v_dec;
  return v_dec;
end $$;

------------------------------------------------------------------
-- 9. RFQ-04 AC6 (revised 13 Nov 2026): a sourcing that has a live PO cannot be cancelled
------------------------------------------------------------------
create or replace function public.sourcing_cancel(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.sourcing := app.owned_sourcing(p_id, array['DRAFT', 'OPEN', 'CLOSED', 'AWAITING_OPENING',
                                                       'TECHNICAL_EVALUATION', 'COMPARISON', 'FINAL_OFFER_ROUND']);
  r record;
begin
  perform app.need(p_reason);
  if exists (select 1 from public.purchase_order po where po.sourcing_id = s.id
              and po.status not in ('REJECTED', 'DECLINED_BY_VENDOR')) then
    perform app.fail('errors.sourcingHasPurchaseOrders');
  end if;
  for r in select id from public.decision where sourcing_id = s.id and type = 'OPENING' and status = 'VOTING' loop
    perform app.close_decision(r.id, btrim(p_reason));
  end loop;
  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.sourcing set status = 'CANCELLED', cancel_reason = btrim(p_reason) where id = s.id;
  update public.requisition set status = 'APPROVED' where id = app.sourcing_requisition(s.id);
  perform app.notify(app.invited_user_ids(s.id), 'sourcing.cancelled', 'sourcing', s.id, s.number,
                     jsonb_build_object('reason', btrim(p_reason)));
end $$;

------------------------------------------------------------------
-- 10. CMT-02 AC9, AC10: what a closed WINNER or PO decision does
------------------------------------------------------------------
create or replace function app.apply_decision_outcome(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d    public.decision;
  s    public.sourcing;
  po   public.purchase_order;
  v_to text;
begin
  select * into d from public.decision where id = p_id;
  select * into s from public.sourcing where id = d.sourcing_id;
  if d.type = 'OPENING' and d.status = 'APPROVED' then
    perform set_config('app.audit_reason', 'Opening approved', true);
    update public.sourcing set status = 'TECHNICAL_EVALUATION', bids_opened_at = now()
     where id = d.sourcing_id and status = 'AWAITING_OPENING';

  elsif d.type = 'WINNER' and d.status = 'APPROVED' then
    perform app.create_purchase_orders(d.id);                                           -- PO-01
    -- open lines without a winner (a PO was rejected while this decision was voting) go straight back to COMPARISON
    v_to := case when exists (select 1 from public.sourcing_line sl where sl.sourcing_id = s.id and sl.status = 'ACTIVE'
                               and not exists (select 1 from public.award_line a where a.sourcing_line_id = sl.id and a.status = 'ACTIVE'))
                 then 'COMPARISON' else 'WINNER_APPROVED' end;
    perform set_config('app.audit_reason', 'Winner approved', true);
    update public.sourcing set status = v_to where id = d.sourcing_id and status = 'IN_COMMITTEE';

  elsif d.type = 'WINNER' and d.status = 'REJECTED' then
    -- only the lines that are not on a PO from an earlier winner decision
    update public.award_line a set status = 'REJECTED'
      from public.sourcing_line sl
     where sl.id = a.sourcing_line_id and sl.sourcing_id = d.sourcing_id and a.status = 'ACTIVE'
       and not app.award_on_po(a.id);
    perform set_config('app.audit_reason', 'Winner rejected', true);
    update public.sourcing set status = 'COMPARISON' where id = d.sourcing_id and status = 'IN_COMMITTEE';

  elsif d.type = 'PO' and d.status = 'APPROVED' then                                   -- CMT-02 AC10, PO-02 AC4
    perform set_config('app.audit_reason', 'PO approved by the committee', true);
    update public.purchase_order set status = 'FULLY_APPROVED'
     where id = d.purchase_order_id and status = 'PENDING_COMMITTEE' returning * into po;
    if po.id is not null then
      perform app.notify(app.vendor_user_ids(po.vendor_id) || s.owner_id || coalesce(app.sourcing_requester(s.id), s.owner_id),
                         'po.fullyApproved', 'purchase_order', po.id, po.number, jsonb_build_object('total', po.total));
    end if;

  elsif d.type = 'PO' and d.status = 'REJECTED' then
    perform set_config('app.audit_reason', 'PO rejected by the committee', true);
    update public.purchase_order set status = 'REJECTED'
     where id = d.purchase_order_id and status = 'PENDING_COMMITTEE' returning * into po;
    if po.id is not null then
      perform app.return_po_lines(po.id, 'PO ' || po.number || ' rejected by the committee');
    end if;
  end if;
end $$;

-- A PO decision shows its frozen package (the PO and every difference from the approved winner decision).
-- The winner package keeps the comparison only for those who may read bids, as before.
create or replace function public.decision_package(p_decision uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'type', d.type, 'sourcingId', s.id, 'sourcingNumber', s.number, 'sourcingType', s.type,
    'sourcingStatus', s.status, 'minimum', s.min_proposals, 'lowCompetitionReason', s.low_competition_reason,
    'proposalCount', (select count(*) from public.proposal p where p.sourcing_id = s.id
                       and p.status in ('SUBMITTED', 'PASSED', 'DISQUALIFIED', 'AWARDED', 'NOT_AWARDED')),
    'bidders', case when app.can_view_bids() and d.type = 'OPENING' then
      (select coalesce(jsonb_agg(v.legal_name order by v.legal_name), '[]'::jsonb)
         from public.proposal p join public.vendor v on v.id = p.vendor_id
        where p.sourcing_id = s.id and p.status = 'SUBMITTED') end,
    'comparison', case when app.can_view_bids() and d.type = 'WINNER' then d.package end,
    'po', case when d.type = 'PO' then coalesce(d.package, app.po_package(d.purchase_order_id)) end)
    from public.decision d join public.sourcing s on s.id = d.sourcing_id
   where d.id = p_decision and d.company_id = app.current_company_id() and app.can_view_minutes()
$$;

------------------------------------------------------------------
-- 11. PO-02: the Approver approves (a PO decision opens) or rejects (reason)
------------------------------------------------------------------
create function public.po_decide(p_po uuid, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  po    public.purchase_order;
  s     public.sourcing;
  v_dec uuid;
begin
  if not app.has_role('APPROVER') or p_decision not in ('APPROVE', 'REJECT') then perform app.fail('errors.noAccess'); end if;
  select * into po from public.purchase_order where id = p_po and company_id = app.current_company_id() for update;
  if po.id is null then perform app.fail('errors.noAccess'); end if;
  select * into s from public.sourcing where id = po.sourcing_id;
  -- AC3 (#83): not for the PR's Requester and not for the owner of the sourcing
  if auth.uid() = app.sourcing_requester(s.id) or auth.uid() = s.owner_id then perform app.fail('errors.ownPurchaseOrder'); end if;
  if po.status <> 'PENDING_APPROVAL' then perform app.fail('errors.statusChanged'); end if;

  if p_decision = 'REJECT' then                                                         -- AC2
    if nullif(btrim(p_reason), '') is null then perform app.fail('errors.reasonRequired'); end if;
    perform set_config('app.audit_reason', btrim(p_reason), true);
    update public.purchase_order set status = 'REJECTED', reason = btrim(p_reason) where id = po.id;
    perform app.return_po_lines(po.id, 'PO ' || po.number || ' rejected: ' || btrim(p_reason));
    perform app.notify(array[s.owner_id], 'po.rejected', 'purchase_order', po.id, po.number,
                       jsonb_build_object('reason', btrim(p_reason)));
  else                                                                                  -- AC1
    perform set_config('app.audit_reason', '', true);
    update public.purchase_order set status = 'PENDING_COMMITTEE' where id = po.id;
    v_dec := app.open_decision(po.sourcing_id, 'PO', po.id);
    update public.decision set package = app.po_package(po.id) where id = v_dec;
  end if;
end $$;

------------------------------------------------------------------
-- 12. PO-03: the vendor accepts or declines a FULLY_APPROVED PO
------------------------------------------------------------------
create function public.po_respond(p_po uuid, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  po       public.purchase_order;
  s        public.sourcing;
  v_vendor uuid := app.current_vendor_id();
begin
  if v_vendor is null or p_decision not in ('ACCEPT', 'DECLINE') then perform app.fail('errors.noAccess'); end if;
  select * into po from public.purchase_order where id = p_po and vendor_id = v_vendor for update;   -- own POs only (AC5)
  if po.id is null then perform app.fail('errors.noAccess'); end if;
  if po.status <> 'FULLY_APPROVED' then perform app.fail('errors.statusChanged'); end if;
  select * into s from public.sourcing where id = po.sourcing_id for update;

  if p_decision = 'DECLINE' then                                                        -- AC3
    if nullif(btrim(p_reason), '') is null then perform app.fail('errors.reasonRequired'); end if;
    perform set_config('app.audit_reason', btrim(p_reason), true);
    update public.purchase_order set status = 'DECLINED_BY_VENDOR', reason = btrim(p_reason) where id = po.id;
    perform app.return_po_lines(po.id, 'PO ' || po.number || ' declined by the vendor');
    perform app.notify(array[s.owner_id], 'po.declined', 'purchase_order', po.id, po.number,
                       jsonb_build_object('reason', btrim(p_reason)));
  else                                                                                  -- AC2, AC4
    perform set_config('app.audit_reason', '', true);
    update public.purchase_order set status = 'ACCEPTED' where id = po.id;
    perform app.notify(array[s.owner_id, coalesce(app.sourcing_requester(s.id), s.owner_id)],
                       'po.accepted', 'purchase_order', po.id, po.number);
    perform app.complete_if_done(s.id);
  end if;
end $$;

------------------------------------------------------------------
-- 13. What the screens read. Internal readers: Approver, Procurement Specialist, Committee Member, Admin ("View minutes"
--     group) and the Requester of the PR; a vendor reads only its own FULLY_APPROVED, ACCEPTED or DECLINED POs.
------------------------------------------------------------------
create function app.po_visible(p_po uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.purchase_order po
                  where po.id = p_po and po.company_id = app.current_company_id()
                    and (app.can_view_minutes()
                         or (app.has_role('REQUESTER') and app.sourcing_requester(po.sourcing_id) = auth.uid())
                         or (po.vendor_id = app.current_vendor_id()
                             and po.status in ('FULLY_APPROVED', 'ACCEPTED', 'DECLINED_BY_VENDOR'))))
$$;

create function public.po_list()
returns table (id uuid, number text, status text, vendor_name text, sourcing_id uuid, sourcing_number text,
               total numeric, total_incl_vat numeric, created_at timestamptz, requester_id uuid, owner_id uuid)
language sql stable security definer set search_path = '' as $$
  select po.id, po.number, po.status, v.legal_name,
         case when app.current_vendor_id() is null then s.id end, s.number, po.total, po.total_incl_vat, po.created_at,
         case when app.current_vendor_id() is null then app.sourcing_requester(s.id) end,
         case when app.current_vendor_id() is null then s.owner_id end
    from public.purchase_order po
    join public.sourcing s on s.id = po.sourcing_id
    join public.vendor v on v.id = po.vendor_id
   where app.po_visible(po.id)
   order by po.created_at desc, po.number desc
$$;

create function public.po_view(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', po.id, 'number', po.number, 'status', po.status, 'createdAt', po.created_at, 'reason', po.reason,
    'vendor', jsonb_build_object('id', v.id, 'name', v.legal_name),
    'sourcing', jsonb_build_object('id', case when app.current_vendor_id() is null then s.id end, 'number', s.number),
    'ownerId', case when app.current_vendor_id() is null then s.owner_id end,
    'requesterId', case when app.current_vendor_id() is null then app.sourcing_requester(s.id) end,
    'incoterm', po.incoterm,
    'namedPlace', (select name from public.delivery_place where id = po.named_place_id),
    'deliveryMode', (select name from public.delivery_mode where id = po.delivery_mode_id),
    'paymentTerm', (select name from public.payment_term where id = po.payment_term_id),
    'vatRate', po.vat_rate, 'total', po.total, 'vatAmount', po.vat_amount, 'totalInclVat', po.total_incl_vat,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'item', it.name, 'code', it.code, 'unit', it.unit, 'quantity', pl.quantity, 'unitPrice', pl.unit_price,
                'lineTotal', pl.line_total, 'deliveryDate', rl.delivery_date, 'place', dp.name) order by it.name, sl.id), '[]')
                from public.purchase_order_line pl
                join public.award_line a on a.id = pl.award_line_id
                join public.sourcing_line sl on sl.id = a.sourcing_line_id
                join public.requisition_line rl on rl.id = sl.requisition_line_id
                join public.item it on it.id = rl.item_id
                left join public.delivery_place dp on dp.id = rl.delivery_place_id
               where pl.purchase_order_id = po.id),
    'winnerMinutes', case when app.can_view_minutes() then
      (select jsonb_build_object('id', m.id, 'number', m.number) from public.minutes m where m.decision_id = po.winner_decision_id) end,
    'decision', case when app.can_view_minutes() then
      (select jsonb_build_object('id', d.id, 'status', d.status) from public.decision d
        where d.purchase_order_id = po.id order by d.opened_at desc limit 1) end)
    from public.purchase_order po
    join public.sourcing s on s.id = po.sourcing_id
    join public.vendor v on v.id = po.vendor_id
   where po.id = p_id and app.po_visible(po.id)
$$;

------------------------------------------------------------------
-- 14. Grants: app.* only inside SECURITY DEFINER functions; the public functions for signed-in users
------------------------------------------------------------------
revoke execute on function app.award_on_po(uuid), app.line_on_live_po(uuid), app.line_po_number(uuid),
  app.sourcing_requester(uuid), app.create_purchase_orders(uuid), app.return_po_lines(uuid, text),
  app.complete_if_done(uuid), app.po_package(uuid), app.po_visible(uuid), app.comparison_json(uuid),
  app.cost_sourcing(uuid), app.apply_decision_outcome(uuid)
  from public, anon, authenticated, service_role;

revoke execute on function public.po_decide(uuid, text, text), public.po_respond(uuid, text, text),
  public.po_list(), public.po_view(uuid), public.award_choose(uuid, uuid, text), public.sourcing_line_cancel(uuid, text),
  public.sourcing_send_to_committee(uuid, text), public.sourcing_cancel(uuid, text), public.decision_package(uuid)
  from public, anon;
grant execute on function public.po_decide(uuid, text, text), public.po_respond(uuid, text, text),
  public.po_list(), public.po_view(uuid), public.award_choose(uuid, uuid, text), public.sourcing_line_cancel(uuid, text),
  public.sourcing_send_to_committee(uuid, text), public.sourcing_cancel(uuid, text), public.decision_package(uuid)
  to authenticated;
