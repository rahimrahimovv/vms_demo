-- PLT-04 follow-up: a realistic cycle time and a company-wide Needs action.
--
-- 1. Business timestamps. The requisition gets approved_at (when it became APPROVED) and the purchase order released_at
--    (when it became FULLY_APPROVED), stamped by triggers on the status change and backfilled once from the audit trail.
--    The dashboard computes the cycle time from them, not from audit rows.
-- 2. Demo loader: app.demo_backdate gets a second offset for the requisition side, so the gap between the approval of a
--    requisition and the release of its order can be realistic. Guarded by demo_flag as before; it moves only business
--    columns (the new ones included), never audit_entry or minutes. The three-argument form stays and calls it with 0.
-- 3. public.dashboard_summary: cycle time from the business timestamps; Needs action as company-wide counts.

alter table public.requisition add column approved_at timestamptz;
alter table public.purchase_order add column released_at timestamptz;

create function app.stamp_requisition_approved() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'APPROVED' and old.status is distinct from 'APPROVED' then new.approved_at := now(); end if;
  return new;
end $$;
create trigger requisition_stamp_approved before update on public.requisition
  for each row execute function app.stamp_requisition_approved();

create function app.stamp_po_released() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'FULLY_APPROVED' and old.status is distinct from 'FULLY_APPROVED' then new.released_at := now(); end if;
  return new;
end $$;
create trigger purchase_order_stamp_released before update on public.purchase_order
  for each row execute function app.stamp_po_released();

update public.requisition r set approved_at = (
  select max(a.created_at) from public.audit_entry a where a.record_type = 'requisition' and a.record_id = r.id and a.to_status = 'APPROVED')
 where r.approved_at is null;
update public.purchase_order po set released_at = (
  select min(a.created_at) from public.audit_entry a where a.record_type = 'purchase_order' and a.record_id = po.id and a.to_status = 'FULLY_APPROVED')
 where po.released_at is null;

revoke execute on function app.stamp_requisition_approved(), app.stamp_po_released() from public, anon, authenticated, service_role;

create function app.demo_backdate(p_root_type text, p_root_id uuid, p_by interval, p_requisition_extra interval)
 RETURNS jsonb
 language plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ids   uuid[] := '{}';
  v_moved jsonb := '{}';
  v_n     integer;
  v_status text;
begin
  if not app.demo_enabled() then
    raise exception 'Demo backdate refused: demo_flag is not enabled in this database' using errcode = '42501';
  end if;
  if p_by is null or p_by <= interval '0' or p_by > interval '800 days' then
    raise exception 'Demo backdate refused: the shift must be between 0 and 800 days';
  end if;
  if p_requisition_extra is null or p_requisition_extra < interval '0' or p_by + p_requisition_extra > interval '800 days' then
    raise exception 'Demo backdate refused: the requisition offset must be between 0 and 800 days in total';
  end if;

  if p_root_type = 'requisition' then
    update public.requisition
       set created_at = created_at - (p_by + p_requisition_extra), submitted_at = submitted_at - (p_by + p_requisition_extra),
           approved_at = approved_at - (p_by + p_requisition_extra)
     where id = p_root_id;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'Demo backdate: requisition not found'; end if;
    v_moved := v_moved || jsonb_build_object('requisition', v_n);
    v_ids := array[p_root_id];

  elsif p_root_type = 'vendor' then
    update public.vendor set created_at = created_at - p_by, submitted_at = submitted_at - p_by, standing_until = (standing_until - p_by)::date where id = p_root_id;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'Demo backdate: vendor not found'; end if;
    v_moved := v_moved || jsonb_build_object('vendor', v_n);
    v_ids := array[p_root_id];

    update public.vendor_contact set created_at = created_at - p_by where vendor_id = p_root_id;
    update public.vendor_bank_account set created_at = created_at - p_by where vendor_id = p_root_id;
    update public.vendor_certificate set created_at = created_at - p_by where vendor_id = p_root_id;

    with m as (update public.questionnaire_response
                  set created_at = created_at - p_by, submitted_at = submitted_at - p_by, reviewed_at = reviewed_at - p_by,
                      valid_until = (valid_until - p_by)::date
                where vendor_id = p_root_id returning id)
    select v_ids || coalesce(array_agg(id), '{}') into v_ids from m;
    with m as (update public.category_application
                  set created_at = created_at - p_by, decided_at = decided_at - p_by, valid_until = (valid_until - p_by)::date
                where vendor_id = p_root_id returning id)
    select v_ids || coalesce(array_agg(id), '{}') into v_ids from m;
    with m as (update public.vendor_change_request
                  set created_at = created_at - p_by, submitted_at = submitted_at - p_by, decided_at = decided_at - p_by
                where vendor_id = p_root_id returning id)
    select v_ids || coalesce(array_agg(id), '{}') into v_ids from m;

  elsif p_root_type = 'sourcing' then
    select status into v_status from public.sourcing where id = p_root_id;
    if v_status is null then raise exception 'Demo backdate: sourcing not found'; end if;
    if v_status = 'OPEN' then
      return jsonb_build_object('skipped', 'OPEN sourcing keeps its times');
    end if;

    update public.sourcing
       set created_at = created_at - p_by,
           deadline = deadline - p_by,
           bids_opened_at = bids_opened_at - p_by,
           prices_opened_at = prices_opened_at - p_by,
           final_offer_deadline = case when status = 'FINAL_OFFER_ROUND' then final_offer_deadline
                                       else final_offer_deadline - p_by end
     where id = p_root_id;
    v_moved := v_moved || jsonb_build_object('sourcing', 1);
    v_ids := array[p_root_id];

    with m as (update public.invitation set created_at = created_at - p_by, reminder_sent_at = reminder_sent_at - p_by
                where sourcing_id = p_root_id returning id)
    select v_ids || coalesce(array_agg(id), '{}') into v_ids from m;
    with m as (update public.proposal
                  set created_at = created_at - p_by, submitted_at = submitted_at - p_by, passed_at = passed_at - p_by
                where sourcing_id = p_root_id returning id)
    select v_ids || coalesce(array_agg(id), '{}') into v_ids from m;
    with m as (update public.question set asked_at = asked_at - p_by, published_at = published_at - p_by
                where sourcing_id = p_root_id returning id)
    select v_ids || coalesce(array_agg(id), '{}') into v_ids from m;
    if v_status <> 'FINAL_OFFER_ROUND' then
      update public.final_offer_request set responded_at = responded_at - p_by where sourcing_id = p_root_id;
    end if;
    update public.comparison_cost set created_at = created_at - p_by
     where sourcing_line_id in (select id from public.sourcing_line where sourcing_id = p_root_id);
    update public.award_line set created_at = created_at - p_by
     where sourcing_line_id in (select id from public.sourcing_line where sourcing_id = p_root_id);
    with m as (update public.purchase_order set created_at = created_at - p_by, released_at = released_at - p_by
                where sourcing_id = p_root_id returning id)
    select v_ids || coalesce(array_agg(id), '{}') into v_ids from m;

    -- decisions: a VOTING decision and its voters are open and stay as they are
    with m as (update public.decision
                  set opened_at = opened_at - p_by, deadline = deadline - p_by, closed_at = closed_at - p_by
                where sourcing_id = p_root_id and status <> 'VOTING' returning id)
    select v_ids || coalesce(array_agg(id), '{}') into v_ids from m;
    update public.decision_voter set voted_at = voted_at - p_by
     where decision_id in (select id from public.decision where sourcing_id = p_root_id and status <> 'VOTING');

  else
    raise exception 'Demo backdate: unknown root type %', p_root_type;
  end if;

  -- the notices and files that belong to the moved records
  update public.notification set created_at = created_at - p_by where record_id = any (v_ids);
  update public.file set uploaded_at = uploaded_at - p_by where owner_id = any (v_ids);

  return v_moved || jsonb_build_object('records', cardinality(v_ids));
end $function$;

create or replace function app.demo_backdate(p_root_type text, p_root_id uuid, p_by interval) returns jsonb
language sql security definer set search_path = '' as $$
  select app.demo_backdate(p_root_type, p_root_id, p_by, interval '0')
$$;

revoke execute on function app.demo_backdate(text, uuid, interval, interval) from public, anon, authenticated, service_role;
revoke execute on function app.demo_backdate(text, uuid, interval) from public, anon, authenticated, service_role;

create or replace function public.dashboard_summary(p_period text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me      uuid := (select auth.uid());
  v_company uuid := app.current_company_id();
  v_from    timestamptz;
  v_today   date := app.today();
begin
  if v_me is null or v_company is null or app.current_vendor_id() is not null
     or not app.has_any_role(array['APPROVER', 'PROCUREMENT_SPECIALIST', 'COMMITTEE_MEMBER', 'ADMIN']::public.app_role[]) then
    perform app.fail('errors.noAccess');
  end if;
  v_from := case p_period
              when '30d' then now() - interval '30 days'
              when '90d' then now() - interval '90 days'
              when 'year' then date_trunc('year', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku'
              when 'all' then '-infinity'::timestamptz
            end;
  if v_from is null then perform app.fail('errors.invalidPeriod'); end if;

  return (
    with src as (
      select s.* from public.sourcing s where s.company_id = v_company and s.created_at >= v_from),
    won as (select s.id from src s where s.status in ('WINNER_APPROVED', 'COMPLETED')),
    -- awarded value: the vendors' own winning prices (award lines, excluding VAT), as on the purchase order
    award as (
      select sl.sourcing_id, p.vendor_id,
             round(app.price_excl_vat(pl.unit_price, p.prices_include_vat, p.vat_rate) * a.quantity, 2) as amount
        from won w
        join public.sourcing_line sl on sl.sourcing_id = w.id and sl.status = 'ACTIVE'
        join public.award_line a on a.sourcing_line_id = sl.id and a.status = 'ACTIVE'
        join public.proposal_line pl on pl.id = a.proposal_line_id
        join public.proposal p on p.id = pl.proposal_id),
    sav as (
      select coalesce(sum((j ->> 'estimated')::numeric), 0) as est, coalesce(sum((j ->> 'awarded')::numeric), 0) as aw
        from won w cross join lateral (select app.sourcing_saving(w.id) as j) x),
    -- cycle time: the business timestamps, the approval of the requisition and the release (FULLY_APPROVED) of its purchase order
    cyc as (
      select extract(epoch from (po.released_at - rq.approved_at)) / 86400 as days
        from public.purchase_order po
        join src s on s.id = po.sourcing_id
        join public.requisition rq on rq.id = app.sourcing_requisition(s.id)
       where po.released_at is not null and rq.approved_at is not null),
    bids as (
      select count(*) as proposals
        from public.proposal p join src s on s.id = p.sourcing_id
       where s.status <> 'DRAFT' and p.status not in ('DRAFT', 'WITHDRAWN')),
    cat as (
      select c.name,
             coalesce(sum(aw.amount), 0) as awarded,
             coalesce(sum(s.value) filter (where s.status in ('OPEN', 'CLOSED', 'AWAITING_OPENING', 'TECHNICAL_EVALUATION',
                                                              'COMPARISON', 'FINAL_OFFER_ROUND', 'IN_COMMITTEE')), 0) as in_progress
        from src s
        join public.category c on c.id = app.sourcing_category(s.id)
        left join (select sourcing_id, sum(amount) as amount from award group by sourcing_id) aw on aw.sourcing_id = s.id
       where s.status not in ('DRAFT', 'CANCELLED')
       group by c.id, c.name),
    grades as (
      select app.vendor_grade(v.id) as grade from public.vendor v where v.company_id = v_company),
    topv as (
      select v.legal_name, count(distinct a.sourcing_id) as awards, sum(a.amount) as amount
        from award a join public.vendor v on v.id = a.vendor_id
       group by v.id, v.legal_name order by sum(a.amount) desc, v.legal_name limit 5),
    closed_dec as (
      select d.id, d.status from public.decision d
       where d.company_id = v_company and d.status in ('APPROVED', 'REJECTED', 'NO_DECISION') and d.closed_at >= v_from)
    select jsonb_build_object(
      'period', p_period,
      'awarded', jsonb_build_object(
        'value', (select coalesce(sum(amount), 0) from award),
        'sourcings', (select count(*) from won)),
      'saving', (select jsonb_build_object('estimated', est, 'awarded', aw, 'saving', est - aw,
                         'percent', case when est > 0 then app.round_half_up((est - aw) * 100 / est, 1) else 0 end,
                         'over', aw > est) from sav),
      'cycle', jsonb_build_object('days', (select app.round_half_up(avg(days), 1) from cyc), 'orders', (select count(*) from cyc)),
      'bids', jsonb_build_object(
        'proposals', (select proposals from bids),
        'sourcings', (select count(*) from src where status <> 'DRAFT'),
        'average', (select case when count(*) > 0 then app.round_half_up((select proposals from bids)::numeric / count(*), 1) end
                      from src where status <> 'DRAFT')),
      'stages', jsonb_build_object(
        'total', (select count(*) from src),
        'rows', (select jsonb_agg(jsonb_build_object('key', k.key, 'count', (select count(*) from src s where s.status = any (k.statuses))) order by k.ord)
                   from (values (1, 'draft', array['DRAFT']),
                                (2, 'open', array['OPEN']),
                                (3, 'evaluation', array['CLOSED', 'AWAITING_OPENING', 'TECHNICAL_EVALUATION', 'COMPARISON', 'FINAL_OFFER_ROUND']),
                                (4, 'committee', array['IN_COMMITTEE']),
                                (5, 'awarded', array['WINNER_APPROVED']),
                                (6, 'completed', array['COMPLETED']),
                                (7, 'cancelled', array['CANCELLED'])) as k (ord, key, statuses))),
      'categories', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'awarded', awarded, 'inProgress', in_progress)
                                               order by awarded + in_progress desc, name), '[]'::jsonb)
                       from (select * from cat where awarded + in_progress > 0 order by awarded + in_progress desc, name limit 5) c5),
      'grades', jsonb_build_object(
        'a', (select count(*) from grades where grade = 'A'), 'b', (select count(*) from grades where grade = 'B'),
        'c', (select count(*) from grades where grade = 'C'), 'd', (select count(*) from grades where grade = 'D'),
        'notGraded', (select count(*) from grades where grade is null), 'total', (select count(*) from grades),
        'expiringCertificates', (select count(*) from public.vendor_certificate c join public.vendor v on v.id = c.vendor_id
                                  where v.company_id = v_company and c.expires_on between v_today and v_today + 30)),
      'topVendors', (select coalesce(jsonb_agg(jsonb_build_object('name', legal_name, 'awards', awards, 'awarded', amount)
                                               order by amount desc, legal_name), '[]'::jsonb) from topv),
      -- PLT-04 AC6: company-wide counts, the same for all four roles (the screen links only to lists the role may open)
      'needsAction', jsonb_build_array(
        jsonb_build_object('key', 'registrations', 'count', (select count(*) from public.vendor v where v.company_id = v_company and v.status = 'SUBMITTED')),
        jsonb_build_object('key', 'requisitionsToApprove', 'count', (select count(*) from public.requisition r where r.company_id = v_company and r.status = 'PENDING_APPROVAL')),
        jsonb_build_object('key', 'posToApprove', 'count', (select count(*) from public.purchase_order po where po.company_id = v_company and po.status = 'PENDING_APPROVAL')),
        jsonb_build_object('key', 'sourcingsBelowMinimum', 'count', (select count(*) from public.sourcing s where s.company_id = v_company and s.status = 'CLOSED')),
        jsonb_build_object('key', 'votesOpen', 'count', (select count(*) from public.decision d where d.company_id = v_company and d.status = 'VOTING'))),
      'committee', jsonb_build_object(
        'approved', (select count(*) from closed_dec where status = 'APPROVED'),
        'rejected', (select count(*) from closed_dec where status = 'REJECTED'),
        'noDecision', (select count(*) from closed_dec where status = 'NO_DECISION'),
        'eligible', (select count(*) from public.decision_voter v join closed_dec d on d.id = v.decision_id where v.vote <> 'CONFLICT'),
        'cast', (select count(*) from public.decision_voter v join closed_dec d on d.id = v.decision_id where v.vote in ('FOR', 'AGAINST')))));
end $$;

revoke execute on function public.dashboard_summary(text) from public, anon;
grant execute on function public.dashboard_summary(text) to authenticated;
