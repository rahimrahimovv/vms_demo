-- PLT-04: the dashboard for internal roles. One function returns every figure as jsonb for a period (30d, 90d, year, all).
-- Only Approver, Procurement Specialist, Committee Member and Admin (a Requester, every vendor and anon are refused).
-- Sourcing figures use the sourcing's creation date, committee figures the date a decision closed; vendor figures and
-- "Needs action" are always current. The saving and the estimate never reach a vendor (D-026): the function is not
-- callable for a vendor user and no vendor page calls it.

------------------------------------------------------------------
-- 1. RFQ-10 fix: once a sourcing is COMPLETED its proposals are AWARDED / NOT_AWARDED, so app.offer_rows (which lists
--    SUBMITTED / PASSED proposals) no longer lists the winner. The winning price now falls back to the award line's own
--    proposal line (excluding VAT), exactly as the PO was created; the comparison still uses the latest price.
------------------------------------------------------------------
create or replace function app.sourcing_saving(p_sourcing uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.saving_build(coalesce(jsonb_agg(jsonb_build_object('lineId', x.line_id, 'estimated', x.est, 'awarded', x.aw)), '[]'::jsonb))
    from (
      select sl.id as line_id,
             app.round_half_up(rl.estimated_unit_price * q.qty, 2) as est,
             app.round_half_up(coalesce(o.unit_excl, ch.price_excl) * q.qty, 2) as aw
        from public.sourcing_line sl
        join public.requisition_line rl on rl.id = sl.requisition_line_id
        left join lateral (select px.proposal_id, a.quantity,
                                  app.price_excl_vat(px.unit_price, pr.prices_include_vat, pr.vat_rate) as price_excl
                             from public.award_line a
                             join public.proposal_line px on px.id = a.proposal_line_id
                             join public.proposal pr on pr.id = px.proposal_id
                            where a.sourcing_line_id = sl.id and a.status = 'ACTIVE' limit 1) ch on true
        left join app.default_winners(p_sourcing) dw on dw.sourcing_line_id = sl.id
        cross join lateral (select coalesce(ch.quantity, rl.quantity) as qty) q
        left join app.offer_rows(p_sourcing) o on o.sourcing_line_id = sl.id and o.proposal_id = coalesce(ch.proposal_id, dw.proposal_id)
       where sl.sourcing_id = p_sourcing and sl.status = 'ACTIVE'
         and coalesce(o.unit_excl, ch.price_excl) is not null) x
$$;

------------------------------------------------------------------
-- 2. The dashboard
------------------------------------------------------------------
create function public.dashboard_summary(p_period text) returns jsonb
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
    cyc as (
      select extract(epoch from (po_ok.at - pr_ok.at)) / 86400 as days
        from public.purchase_order po
        join src s on s.id = po.sourcing_id
        cross join lateral (select min(a.created_at) as at from public.audit_entry a
                             where a.record_type = 'purchase_order' and a.record_id = po.id and a.to_status = 'FULLY_APPROVED') po_ok
        cross join lateral (select max(a.created_at) as at from public.audit_entry a
                             where a.record_type = 'requisition' and a.record_id = app.sourcing_requisition(s.id)
                               and a.to_status = 'APPROVED') pr_ok
       where po_ok.at is not null and pr_ok.at is not null),
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
      -- the same cards and counts as "My tasks" (src/lib/home/tasks.ts), for the signed-in user
      'needsAction', (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'count', t.n) order by t.ord), '[]'::jsonb) from (
          select 1 as ord, 'votesWaiting' as key,
                 (select count(*) from public.decision_voter dv join public.decision d on d.id = dv.decision_id
                   where dv.user_id = v_me and dv.vote = 'NONE' and d.status = 'VOTING' and d.company_id = v_company) as n
           where app.has_role('COMMITTEE_MEMBER')
          union all
          select 2, 'posToApprove',
                 (select count(*) from public.purchase_order po join public.sourcing s on s.id = po.sourcing_id
                   where po.company_id = v_company and po.status = 'PENDING_APPROVAL'
                     and app.sourcing_requester(s.id) is distinct from v_me and s.owner_id is distinct from v_me)
           where app.has_role('APPROVER')
          union all
          select 3, 'prsToApprove',
                 (select count(*) from public.requisition r where r.company_id = v_company and r.status = 'PENDING_APPROVAL' and r.requester_id <> v_me)
           where app.has_role('APPROVER')
          union all
          select 4, 'prsReturned',
                 (select count(*) from public.requisition r where r.company_id = v_company and r.status = 'RETURNED' and r.requester_id = v_me)
           where app.has_role('REQUESTER')
          union all
          select 5, 'registrations', (select count(*) from public.vendor v where v.company_id = v_company and v.status = 'SUBMITTED')
           where app.has_role('PROCUREMENT_SPECIALIST')
          union all
          select 6, 'changeRequests', (select count(*) from public.vendor_change_request c where c.company_id = v_company and c.status = 'SUBMITTED')
           where app.has_role('PROCUREMENT_SPECIALIST')
          union all
          select 7, 'questionnaires', (select count(*) from public.questionnaire_response q where q.company_id = v_company and q.status = 'SUBMITTED')
           where app.has_role('PROCUREMENT_SPECIALIST')
          union all
          select 8, 'applications', (select count(*) from public.category_application c where c.company_id = v_company and c.status = 'PENDING')
           where app.has_role('PROCUREMENT_SPECIALIST')
          union all
          select 9, 'sourcingsBelowMinimum', (select count(*) from public.sourcing s where s.company_id = v_company and s.status = 'CLOSED' and s.owner_id = v_me)
           where app.has_role('PROCUREMENT_SPECIALIST')
          union all
          select 10, 'prsReadyForSourcing', (select count(*) from public.requisition r where r.company_id = v_company and r.status = 'APPROVED')
           where app.has_role('PROCUREMENT_SPECIALIST')) t),
      'committee', jsonb_build_object(
        'approved', (select count(*) from closed_dec where status = 'APPROVED'),
        'rejected', (select count(*) from closed_dec where status = 'REJECTED'),
        'noDecision', (select count(*) from closed_dec where status = 'NO_DECISION'),
        'eligible', (select count(*) from public.decision_voter v join closed_dec d on d.id = v.decision_id where v.vote <> 'CONFLICT'),
        'cast', (select count(*) from public.decision_voter v join closed_dec d on d.id = v.decision_id where v.vote in ('FOR', 'AGAINST')))));
end $$;

revoke execute on function public.dashboard_summary(text) from public, anon;
grant execute on function public.dashboard_summary(text) to authenticated;
