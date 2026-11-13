-- Slice 6, RFQ-05 (technical pass/fail, comparison, proposed winner, Send to committee), RFQ-06 AC6-AC7 (SSP in the
-- comparison and its label in the winner decision), CMT-04 AC3 (second envelope), CMT-02 AC2 and AC9 (the WINNER
-- package and its outcome). Calculation Rules: unit price excluding VAT, evaluated unit price = that + extra costs
-- per unit (RFQ-07), default winner = lowest evaluated price among eligible offers, on a tie the earlier submitted
-- proposal (RFQ-05 AC4, revised 13 Nov 2026).
--
-- Eligible offer on a line: a proposal that is SUBMITTED (RFQ, SSP) or PASSED (Tender), priced the line, and whose
-- vendor was not the rejected winner of that line (award_line REJECTED, RFQ-05 AC7). The latest round counts once a
-- final-offer round has closed (RFQ-08); while it runs, round 1.
--
-- award_line: an ACTIVE row in COMPARISON is the owner's own choice (with a justification when it is not the lowest
-- price); lines without a row follow the default winner. Send to committee writes the rows of the default winners
-- too, freezes the package in decision.package and opens the WINNER decision. The quantity is stored per award line
-- so a line can be split later; the MVP awards the full quantity.

------------------------------------------------------------------
-- 1. Sealed prices (NFR-002): never for a DISQUALIFIED or WITHDRAWN proposal, also when it was disqualified after
--    its prices had opened (assumption 1, confirmed 13 Nov 2026).
------------------------------------------------------------------
create or replace function app.prices_visible(p_proposal uuid, p_round integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.proposal p join public.sourcing s on s.id = p.sourcing_id
                 where p.id = p_proposal and s.prices_opened_at is not null
                   and p.status in ('SUBMITTED', 'PASSED', 'AWARDED', 'NOT_AWARDED')
                   and (s.type <> 'TENDER' or p.passed_at is not null)
                   and (p_round = 1 or s.status <> 'FINAL_OFFER_ROUND'))
$$;

------------------------------------------------------------------
-- 2. The committee package is frozen at Send to committee (CMT-02 AC2, ERD decision.package). It holds prices, so
--    only the package function hands it out, to those who may read bids; the Approver reads the other columns.
------------------------------------------------------------------
alter table public.decision add column package jsonb;
revoke select on public.decision from authenticated;
grant select (id, company_id, type, sourcing_id, purchase_order_id, status, result_rule, opened_at, deadline,
              closed_at, reopened_from_id, reopen_reason, close_reason) on public.decision to authenticated;

------------------------------------------------------------------
-- 3. Offers, eligibility and the default winner
------------------------------------------------------------------
create function app.offer_rows(p_sourcing uuid)
returns table (sourcing_line_id uuid, proposal_id uuid, vendor_id uuid, proposal_line_id uuid, round integer,
               entered numeric, unit_excl numeric, first_excl numeric, extra numeric, evaluated numeric,
               submitted_at timestamptz, excluded boolean)
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.sourcing where id = p_sourcing),
  latest as (
    select distinct on (l.proposal_id, l.sourcing_line_id) l.*
      from s
      join public.proposal p on p.sourcing_id = s.id
      join public.proposal_line l on l.proposal_id = p.id
     where l.round = 1 or s.status <> 'FINAL_OFFER_ROUND'
     order by l.proposal_id, l.sourcing_line_id, l.round desc),
  o as (
    select l.sourcing_line_id, p.id as proposal_id, p.vendor_id, l.id as proposal_line_id, l.round,
           l.unit_price as entered,
           app.price_excl_vat(l.unit_price, p.prices_include_vat, p.vat_rate) as unit_excl,
           (select app.price_excl_vat(f.unit_price, p.prices_include_vat, p.vat_rate) from public.proposal_line f
             where f.proposal_id = p.id and f.sourcing_line_id = l.sourcing_line_id and f.round = 1) as first_excl,
           coalesce((select sum(c.amount_per_unit) from public.comparison_cost c
                      where c.proposal_id = p.id and c.sourcing_line_id = l.sourcing_line_id), 0) as extra,
           p.submitted_at,
           exists (select 1 from public.award_line a join public.proposal_line x on x.id = a.proposal_line_id
                    where a.sourcing_line_id = l.sourcing_line_id and a.status = 'REJECTED'
                      and x.proposal_id = p.id) as excluded
      from latest l
      join public.proposal p on p.id = l.proposal_id
      join public.sourcing_line sl on sl.id = l.sourcing_line_id and sl.status = 'ACTIVE'
      cross join s
     where (s.type = 'TENDER' and p.status = 'PASSED') or (s.type <> 'TENDER' and p.status = 'SUBMITTED'))
  select sourcing_line_id, proposal_id, vendor_id, proposal_line_id, round, entered, unit_excl, first_excl, extra,
         unit_excl + extra, submitted_at, excluded
    from o
$$;

-- RFQ-05 AC4: lowest evaluated unit price, then the earlier submitted proposal.
create function app.default_winners(p_sourcing uuid)
returns table (sourcing_line_id uuid, proposal_id uuid, proposal_line_id uuid, evaluated numeric)
language sql stable security definer set search_path = '' as $$
  select distinct on (o.sourcing_line_id) o.sourcing_line_id, o.proposal_id, o.proposal_line_id, o.evaluated
    from app.offer_rows(p_sourcing) o
   where not o.excluded
   order by o.sourcing_line_id, o.evaluated, o.submitted_at, o.proposal_id
$$;

------------------------------------------------------------------
-- 4. The comparison (RFQ-05 AC3, RFQ-07 AC2, RFQ-08 AC5): one JSON document for the screen and the package
------------------------------------------------------------------
create function app.comparison_json(p_sourcing uuid) returns jsonb
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
           dw.proposal_id as default_id, ch.proposal_id as chosen_id, ch.justification
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
      from ln where ln.status = 'ACTIVE' and coalesce(ln.chosen_id, ln.default_id) is not null),
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
        'needsLowCompetitionReason', exists (select 1 from ln where ln.status = 'ACTIVE' and ln.eligible < s.min_proposals),
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
        'justification', ln.justification,
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

-- The screen's reader: Procurement Specialist, Committee Member, Admin (Role Matrix), once prices are open.
create function public.sourcing_comparison(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.comparison_json(s.id) from public.sourcing s
   where s.id = p_id and s.company_id = app.current_company_id() and app.can_view_bids()
     and s.prices_opened_at is not null
$$;

------------------------------------------------------------------
-- 5. RFQ-05 AC1-AC2: PASSED / DISQUALIFIED. Allowed moves (Status Transition Model): SUBMITTED -> PASSED (Tender),
--    SUBMITTED or PASSED -> DISQUALIFIED (reason). When the last Tender proposal is marked, the sourcing moves to
--    COMPARISON and the prices of PASSED proposals open (CMT-04 AC3).
------------------------------------------------------------------
create function public.proposal_evaluate(p_proposal uuid, p_result text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposal;
  s public.sourcing;
begin
  select * into p from public.proposal where id = p_proposal;
  if p.id is null or p_result not in ('PASSED', 'DISQUALIFIED') then perform app.fail('errors.noAccess'); end if;
  s := app.owned_sourcing(p.sourcing_id, array['TECHNICAL_EVALUATION', 'COMPARISON']);
  select * into p from public.proposal where id = p_proposal for update;

  if s.status = 'COMPARISON' and (s.type = 'SSP' or p_result <> 'DISQUALIFIED') then        -- AC2: RFQ or Tender
    perform app.fail('errors.statusChanged');
  end if;
  if (p_result = 'PASSED' and p.status <> 'SUBMITTED')
     or (p_result = 'DISQUALIFIED' and p.status not in ('SUBMITTED', 'PASSED')) then
    perform app.fail('errors.statusChanged');
  end if;

  if p_result = 'DISQUALIFIED' then
    perform set_config('app.audit_reason', app.need(p_reason), true);
    update public.proposal set status = 'DISQUALIFIED', disqualify_reason = btrim(p_reason) where id = p.id;
    delete from public.award_line a using public.proposal_line x
     where x.id = a.proposal_line_id and x.proposal_id = p.id and a.status = 'ACTIVE';    -- leaves the comparison
  else
    perform set_config('app.audit_reason', '', true);
    update public.proposal set status = 'PASSED', passed_at = now() where id = p.id;
  end if;

  if s.status = 'TECHNICAL_EVALUATION'
     and not exists (select 1 from public.proposal where sourcing_id = s.id and status = 'SUBMITTED') then
    perform set_config('app.audit_reason', 'Technical evaluation completed', true);
    update public.sourcing set status = 'COMPARISON', prices_opened_at = now() where id = s.id;
  end if;
end $$;

------------------------------------------------------------------
-- 6. RFQ-05 AC4, AC7: the owner's choice per line, and cancelling a line
------------------------------------------------------------------
-- p_proposal null = back to the default winner. A vendor that is not the lowest evaluated price needs a
-- justification; another vendor tied at the lowest price does not.
create function public.award_choose(p_line uuid, p_proposal uuid, p_justification text) returns void
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

create function public.sourcing_line_cancel(p_line uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sl public.sourcing_line;
  s  public.sourcing;
begin
  select * into sl from public.sourcing_line where id = p_line;
  if sl.id is null then perform app.fail('errors.noAccess'); end if;
  s := app.owned_sourcing(sl.sourcing_id, array['COMPARISON']);
  if sl.status <> 'ACTIVE' then perform app.fail('errors.statusChanged'); end if;
  update public.sourcing_line set status = 'CANCELLED', cancel_reason = app.need(p_reason) where id = sl.id;
  delete from public.award_line where sourcing_line_id = sl.id and status = 'ACTIVE';
end $$;

------------------------------------------------------------------
-- 7. RFQ-05 AC5-AC6, RFQ-06 AC6: Send to committee
------------------------------------------------------------------
create function public.sourcing_send_to_committee(p_id uuid, p_reason text) returns uuid
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
  if not exists (select 1 from public.sourcing_line where sourcing_id = s.id and status = 'ACTIVE') then
    perform app.fail('errors.noWinners');                       -- every line cancelled: cancel the sourcing instead
  end if;
  if exists (select 1 from public.sourcing_line sl where sl.sourcing_id = s.id and sl.status = 'ACTIVE'
              and not exists (select 1 from app.offer_rows(s.id) o where o.sourcing_line_id = sl.id and not o.excluded)) then
    perform app.fail('errors.lineNeedsWinner');                 -- AC4: a line with no eligible offer is cancelled
  end if;
  if s.low_competition_reason is null and exists (
       select 1 from public.sourcing_line sl where sl.sourcing_id = s.id and sl.status = 'ACTIVE'
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
            where a.status = 'ACTIVE' loop
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
  perform set_config('app.audit_reason', '', true);
  update public.sourcing set status = 'IN_COMMITTEE' where id = s.id;
  v_dec := app.open_decision(s.id, 'WINNER');
  update public.decision set package = v_pkg where id = v_dec;
  return v_dec;
end $$;

------------------------------------------------------------------
-- 8. CMT-02 AC9: APPROVED -> WINNER_APPROVED (POs: Slice 7); REJECTED -> COMPARISON, winners excluded per line
------------------------------------------------------------------
create or replace function app.apply_decision_outcome(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.decision;
begin
  select * into d from public.decision where id = p_id;
  if d.type = 'OPENING' and d.status = 'APPROVED' then
    perform set_config('app.audit_reason', 'Opening approved', true);
    update public.sourcing set status = 'TECHNICAL_EVALUATION', bids_opened_at = now()
     where id = d.sourcing_id and status = 'AWAITING_OPENING';
  elsif d.type = 'WINNER' and d.status = 'APPROVED' then
    perform set_config('app.audit_reason', 'Winner approved', true);
    update public.sourcing set status = 'WINNER_APPROVED' where id = d.sourcing_id and status = 'IN_COMMITTEE';
  elsif d.type = 'WINNER' and d.status = 'REJECTED' then
    update public.award_line a set status = 'REJECTED'
      from public.sourcing_line sl
     where sl.id = a.sourcing_line_id and sl.sourcing_id = d.sourcing_id and a.status = 'ACTIVE';
    perform set_config('app.audit_reason', 'Winner rejected', true);
    update public.sourcing set status = 'COMPARISON' where id = d.sourcing_id and status = 'IN_COMMITTEE';
  end if;
  -- PO outcomes come with Slice 7.
end $$;

-- Reopen vote keeps the frozen package (CMT-02 AC8: "the same package").
create or replace function public.decision_reopen(p_decision uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  d     public.decision;
  s     public.sourcing;
  v_new uuid;
begin
  if not app.has_role('PROCUREMENT_SPECIALIST') then perform app.fail('errors.noAccess'); end if;
  select * into d from public.decision where id = p_decision and company_id = app.current_company_id() for update;
  if d.id is null then perform app.fail('errors.noAccess'); end if;
  select * into s from public.sourcing where id = d.sourcing_id and owner_id = auth.uid() for update;
  if s.id is null then perform app.fail('errors.noAccess'); end if;

  if not ((d.status = 'NO_DECISION' and d.result_rule <> 'SOURCING_CANCELLED')
          or (d.status = 'REJECTED' and d.type = 'OPENING')) then
    perform app.fail('errors.statusChanged');
  end if;
  if exists (select 1 from public.decision x
              where x.sourcing_id = d.sourcing_id and x.type = d.type
                and x.purchase_order_id is not distinct from d.purchase_order_id and x.opened_at > d.opened_at) then
    perform app.fail('errors.statusChanged');
  end if;
  if (d.type = 'OPENING' and s.status <> 'AWAITING_OPENING') or (d.type = 'WINNER' and s.status <> 'IN_COMMITTEE')
     or (d.type = 'PO' and not exists (select 1 from public.purchase_order po
                                       where po.id = d.purchase_order_id and po.status = 'PENDING_COMMITTEE')) then
    perform app.fail('errors.statusChanged');
  end if;
  if d.status = 'REJECTED' and nullif(btrim(p_reason), '') is null then perform app.fail('errors.reasonRequired'); end if;

  v_new := app.open_decision(d.sourcing_id, d.type, d.purchase_order_id, d.id, p_reason);
  update public.decision set package = d.package where id = v_new;
  return v_new;
end $$;

-- CMT-02 AC2: a WINNER decision shows its frozen package, to those who may read bids. OPENING as before.
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
    'comparison', case when app.can_view_bids() and d.type = 'WINNER' then d.package end)
    from public.decision d join public.sourcing s on s.id = d.sourcing_id
   where d.id = p_decision and d.company_id = app.current_company_id() and app.can_view_minutes()
$$;

------------------------------------------------------------------
-- 9. Grants
------------------------------------------------------------------
revoke execute on function app.offer_rows(uuid), app.default_winners(uuid), app.comparison_json(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.sourcing_comparison(uuid), public.proposal_evaluate(uuid, text, text),
  public.award_choose(uuid, uuid, text), public.sourcing_line_cancel(uuid, text),
  public.sourcing_send_to_committee(uuid, text), public.decision_reopen(uuid, text), public.decision_package(uuid)
  from public, anon;
grant execute on function public.sourcing_comparison(uuid), public.proposal_evaluate(uuid, text, text),
  public.award_choose(uuid, uuid, text), public.sourcing_line_cancel(uuid, text),
  public.sourcing_send_to_committee(uuid, text), public.decision_reopen(uuid, text), public.decision_package(uuid)
  to authenticated;
