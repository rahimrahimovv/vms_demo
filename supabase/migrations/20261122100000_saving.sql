-- RFQ-10: saving against the estimate. Computed here, on the server, from the PR line estimate (quantity x estimated
-- unit price) and the winning price of each award line (the vendor's own latest unit price excluding VAT), only over
-- active lines that have a winner. Percent with one decimal, amounts with two, half-up rounding (D-026).
-- The estimate and the saving reach internal users only: the comparison (once prices are open), the frozen WINNER
-- package, the PO view for internal readers and the sourcing list. No vendor function returns them.

create function app.round_half_up(p numeric, p_digits integer) returns numeric
language sql immutable set search_path = '' as $$
  select floor(p * power(10::numeric, p_digits) + 0.5) / power(10::numeric, p_digits)
$$;

-- Totals from {lineId, estimated, awarded} rows (both already rounded to 2 decimals).
create function app.saving_build(p_lines jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  with l as (select e ->> 'lineId' as line_id, (e ->> 'estimated')::numeric as est, (e ->> 'awarded')::numeric as aw
               from jsonb_array_elements(p_lines) e),
  t as (select coalesce(sum(est), 0) as est, coalesce(sum(aw), 0) as aw from l)
  select jsonb_build_object(
    'lines', coalesce((select jsonb_agg(jsonb_build_object('lineId', line_id, 'estimated', est, 'awarded', aw, 'saving', est - aw)) from l), '[]'::jsonb),
    'estimated', t.est, 'awarded', t.aw, 'saving', t.est - t.aw,
    'percent', case when t.est > 0 then app.round_half_up((t.est - t.aw) * 100 / t.est, 1) else 0 end,
    'over', t.aw > t.est)
    from t
$$;

-- The saving of a sourcing: winner = the owner's active award, else the default winner (lowest evaluated price).
create function app.sourcing_saving(p_sourcing uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.saving_build(coalesce(jsonb_agg(jsonb_build_object('lineId', x.line_id, 'estimated', x.est, 'awarded', x.aw)), '[]'::jsonb))
    from (
      select sl.id as line_id,
             app.round_half_up(rl.estimated_unit_price * q.qty, 2) as est,
             app.round_half_up(o.unit_excl * q.qty, 2) as aw
        from public.sourcing_line sl
        join public.requisition_line rl on rl.id = sl.requisition_line_id
        left join lateral (select px.proposal_id, a.quantity
                             from public.award_line a join public.proposal_line px on px.id = a.proposal_line_id
                            where a.sourcing_line_id = sl.id and a.status = 'ACTIVE' limit 1) ch on true
        left join app.default_winners(p_sourcing) dw on dw.sourcing_line_id = sl.id
        cross join lateral (select coalesce(ch.quantity, rl.quantity) as qty) q
        join app.offer_rows(p_sourcing) o on o.sourcing_line_id = sl.id and o.proposal_id = coalesce(ch.proposal_id, dw.proposal_id)
       where sl.sourcing_id = p_sourcing and sl.status = 'ACTIVE') x
$$;

-- The saving of one PO: its lines against the estimate of the PR lines behind them.
create function app.po_saving(p_po uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.saving_build(coalesce(jsonb_agg(jsonb_build_object('lineId', sl.id,
           'estimated', app.round_half_up(rl.estimated_unit_price * pl.quantity, 2), 'awarded', pl.line_total)), '[]'::jsonb))
    from public.purchase_order_line pl
    join public.award_line a on a.id = pl.award_line_id
    join public.sourcing_line sl on sl.id = a.sourcing_line_id
    join public.requisition_line rl on rl.id = sl.requisition_line_id
   where pl.purchase_order_id = p_po
$$;

-- The comparison document (screen and frozen WINNER package) carries the saving.
alter function app.comparison_json(uuid) rename to comparison_base_json;
create function app.comparison_json(p_sourcing uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.comparison_base_json(p_sourcing) || jsonb_build_object('saving', app.sourcing_saving(p_sourcing))
$$;

-- The PO view: the saving only for internal readers (a vendor reads this same function).
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
    from public.purchase_order po
    join public.sourcing s on s.id = po.sourcing_id
    join public.vendor v on v.id = po.vendor_id
   where po.id = p_id and app.po_visible(po.id)
$$;

-- The Saving column of the sourcing list: WINNER_APPROVED and COMPLETED sourcings, to those who may read bids.
create function public.sourcing_savings()
returns table (sourcing_id uuid, estimated numeric, awarded numeric, saving numeric, percent numeric, over boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, (j ->> 'estimated')::numeric, (j ->> 'awarded')::numeric, (j ->> 'saving')::numeric,
         (j ->> 'percent')::numeric, (j ->> 'over')::boolean
    from public.sourcing s
    cross join lateral (select app.sourcing_saving(s.id) as j) x
   where s.company_id = app.current_company_id() and app.can_view_bids() and s.status in ('WINNER_APPROVED', 'COMPLETED')
$$;

revoke execute on function app.round_half_up(numeric, integer), app.saving_build(jsonb), app.sourcing_saving(uuid),
  app.po_saving(uuid), app.comparison_json(uuid), app.comparison_base_json(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.sourcing_savings() from public, anon;
grant execute on function public.sourcing_savings() to authenticated;
