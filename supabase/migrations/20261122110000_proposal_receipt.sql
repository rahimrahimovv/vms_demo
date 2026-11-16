-- RFQ-12: the data of the proposal receipt. Only the owning vendor, only for a SUBMITTED proposal; a DRAFT or WITHDRAWN
-- proposal, another vendor's proposal and every internal user get NULL. It holds what the vendor itself submitted
-- (prices as entered, terms, file names) and nothing else: no estimate, no other vendor, no committee data.
-- The latest price per line counts (a final offer replaces the first one); the round is 2 once the vendor answered a
-- final-offer request, and the submission time is then the time of that answer.

create function public.proposal_receipt(p_proposal uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (
    select x.* from public.proposal x
     where x.id = p_proposal and x.status = 'SUBMITTED' and x.vendor_id = app.current_vendor_id()),
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

revoke execute on function public.proposal_receipt(uuid) from public, anon;
grant execute on function public.proposal_receipt(uuid) to authenticated;
