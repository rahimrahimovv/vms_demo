-- Backlog sync (16 Nov 2026).
-- RFQ-10 AC1: per line with a proposed winner the comparison shows the estimated unit price (from the PR line), the winner's
--   unit price (excluding VAT, the vendor's own latest price) and the difference in percent with one decimal. The footer
--   (estimated value, awarded value, saving amount and percent) is unchanged. The percent follows the saving: positive when the
--   winner is below the estimate, negative (shown with a plus sign and "Over estimate") when above; the absolute value is
--   rounded half-up, then the sign is applied.
-- RFQ-12: the receipt stays available after the deadline for a submitted proposal (SUBMITTED, PASSED, DISQUALIFIED, AWARDED,
--   NOT_AWARDED) of a sourcing that is not CANCELLED; DRAFT and WITHDRAWN proposals, other vendors and internal users get
--   nothing. The vendor's purchase order view carries the id of the proposal it came from, so the order can link to the receipt.

create or replace function app.saving_build(p_lines jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  with l as (select e ->> 'lineId' as line_id, (e ->> 'estimated')::numeric as est, (e ->> 'awarded')::numeric as aw,
                    (e ->> 'estimateUnit')::numeric as est_unit, (e ->> 'winnerUnit')::numeric as win_unit
               from jsonb_array_elements(p_lines) e),
  t as (select coalesce(sum(est), 0) as est, coalesce(sum(aw), 0) as aw from l)
  select jsonb_build_object(
    'lines', coalesce((select jsonb_agg(jsonb_build_object('lineId', line_id, 'estimated', est, 'awarded', aw, 'saving', est - aw,
                         'estimateUnit', est_unit, 'winnerUnit', win_unit,
                         'percent', case when est_unit > 0 then app.round_half_up((est_unit - win_unit) * 100 / est_unit, 1) end)) from l), '[]'::jsonb),
    'estimated', t.est, 'awarded', t.aw, 'saving', t.est - t.aw,
    'percent', case when t.est > 0 then app.round_half_up((t.est - t.aw) * 100 / t.est, 1) else 0 end,
    'over', t.aw > t.est)
    from t
$$;

create or replace function app.sourcing_saving(p_sourcing uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.saving_build(coalesce(jsonb_agg(jsonb_build_object('lineId', x.line_id, 'estimated', x.est, 'awarded', x.aw,
                                                                  'estimateUnit', x.est_unit, 'winnerUnit', x.win_unit)), '[]'::jsonb))
    from (
      select sl.id as line_id,
             rl.estimated_unit_price as est_unit,
             coalesce(o.unit_excl, ch.price_excl) as win_unit,
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

-- RFQ-12: a submitted proposal keeps its receipt after the deadline, unless the sourcing is cancelled.
create or replace function public.proposal_receipt(p_proposal uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (
    select x.* from public.proposal x
      join public.sourcing sg on sg.id = x.sourcing_id
     where x.id = p_proposal and x.status in ('SUBMITTED', 'PASSED', 'DISQUALIFIED', 'AWARDED', 'NOT_AWARDED')
       and sg.status <> 'CANCELLED' and x.vendor_id = app.current_vendor_id()),
  fo as (
    select f.responded_at from public.final_offer_request f join p on f.sourcing_id = p.sourcing_id and f.vendor_id = p.vendor_id
     where f.responded_at is not null),
  latest as (
    select distinct on (l.sourcing_line_id) l.* from public.proposal_line l join p on l.proposal_id = p.id
     order by l.sourcing_line_id, l.round desc)
  select jsonb_build_object(
    'proposalId', p.id,
    'sourcingNumber', s.number,
    'category', (select c.name from public.category c where c.id = app.sourcing_category(s.id)),
    'vendor', jsonb_build_object('legalName', v.legal_name, 'taxNumber', coalesce(v.voen, v.foreign_tax_number)),
    'submittedAt', coalesce((select max(responded_at) from fo), p.submitted_at),
    'round', case when exists (select 1 from fo) then 2 else 1 end,
    'vatIncluded', p.prices_include_vat,
    'vatRate', p.vat_rate,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'item', it.name, 'unit', it.unit, 'quantity', rl.quantity, 'unitPrice', l.unit_price,
                'lineTotal', round(l.unit_price * rl.quantity, 2)) order by it.name, sl.id), '[]'::jsonb)
                from latest l
                join public.sourcing_line sl on sl.id = l.sourcing_line_id
                join public.requisition_line rl on rl.id = sl.requisition_line_id
                join public.item it on it.id = rl.item_id),
    'terms', jsonb_build_object(
      'incoterm', p.incoterm,
      'namedPlace', (select name from public.delivery_place where id = p.named_place_id),
      'deliveryMode', (select name from public.delivery_mode where id = p.delivery_mode_id),
      'paymentTerm', (select name from public.payment_term where id = p.payment_term_id),
      'deliveryDays', p.delivery_days,
      'validityDays', p.validity_days),
    'files', (select coalesce(jsonb_agg(f.file_name order by f.file_name), '[]'::jsonb)
                from public.file f where f.owner_type = 'proposal' and f.owner_id = p.id))
    from p
    join public.sourcing s on s.id = p.sourcing_id
    join public.vendor v on v.id = p.vendor_id
$$;

-- The vendor's purchase order view carries the proposal it came from (the vendor's own proposal), for the receipt link.
create or replace function public.po_view(p_id uuid) returns jsonb
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
    -- the key is absent, not null, for a vendor
    || case when app.current_vendor_id() is null then jsonb_build_object('saving', app.po_saving(po.id)) else '{}'::jsonb end
    -- RFQ-12: only a vendor gets the proposal id, for the link to its own receipt
    || case when app.current_vendor_id() is not null then jsonb_build_object('proposalId', po.proposal_id) else '{}'::jsonb end
    from public.purchase_order po
    join public.sourcing s on s.id = po.sourcing_id
    join public.vendor v on v.id = po.vendor_id
   where po.id = p_id and app.po_visible(po.id)
$$;
