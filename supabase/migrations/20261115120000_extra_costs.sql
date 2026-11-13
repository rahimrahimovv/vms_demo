-- Slice 6, RFQ-07: extra costs per unit (Customs, Delivery, Insurance, Other) on a vendor's line, added by the owner
-- in COMPARISON. The evaluated unit price and the default winner read them live (app.offer_rows); from IN_COMMITTEE
-- on they are locked (AC4). The PO keeps the vendor's own prices (AC5, Slice 7).

create function app.cost_sourcing(p_line uuid) returns public.sourcing
language plpgsql security definer set search_path = '' as $$
declare s public.sourcing;
begin
  select sr.* into s from public.sourcing_line sl join public.sourcing sr on sr.id = sl.sourcing_id where sl.id = p_line;
  if s.id is null then perform app.fail('errors.noAccess'); end if;
  s := app.owned_sourcing(s.id, array['DRAFT', 'OPEN', 'CLOSED', 'AWAITING_OPENING', 'TECHNICAL_EVALUATION', 'COMPARISON',
                                      'FINAL_OFFER_ROUND', 'IN_COMMITTEE', 'WINNER_APPROVED', 'COMPLETED', 'CANCELLED']);
  if s.status <> 'COMPARISON' then perform app.fail('errors.costsLocked'); end if;          -- AC4
  return s;
end $$;

-- AC1: p_id null adds a cost; otherwise changes it. Amount in AZN per unit, 0 or more, 2 decimals.
create function public.comparison_cost_save(p_id uuid, p_line uuid, p_proposal uuid, p_type text, p_amount numeric,
                                            p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c    public.comparison_cost;
  s    public.sourcing;
  v_id uuid;
begin
  if p_id is not null then
    select * into c from public.comparison_cost where id = p_id;
    if c.id is null then perform app.fail('errors.noAccess'); end if;
    p_line := c.sourcing_line_id;
    p_proposal := c.proposal_id;
  end if;
  s := app.cost_sourcing(p_line);
  if p_type is null or p_type not in ('CUSTOMS', 'DELIVERY', 'INSURANCE', 'OTHER') then perform app.fail('errors.required'); end if;
  if p_amount is null or p_amount < 0 or p_amount <> round(p_amount, 2) then perform app.fail('errors.amountInvalid'); end if;
  if not exists (select 1 from app.offer_rows(s.id) o where o.sourcing_line_id = p_line and o.proposal_id = p_proposal) then
    perform app.fail('errors.vendorNotEligible');
  end if;
  if p_id is null then
    insert into public.comparison_cost (sourcing_line_id, proposal_id, type, amount_per_unit, note, created_by)
    values (p_line, p_proposal, p_type, p_amount, nullif(btrim(p_note), ''), auth.uid())
    returning id into v_id;
  else
    update public.comparison_cost set type = p_type, amount_per_unit = p_amount, note = nullif(btrim(p_note), '')
     where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.comparison_cost_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.comparison_cost;
begin
  select * into c from public.comparison_cost where id = p_id;
  if c.id is null then perform app.fail('errors.noAccess'); end if;
  perform app.cost_sourcing(c.sourcing_line_id);
  delete from public.comparison_cost where id = p_id;
end $$;

revoke execute on function app.cost_sourcing(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.comparison_cost_save(uuid, uuid, uuid, text, numeric, text),
  public.comparison_cost_delete(uuid) from public, anon;
grant execute on function public.comparison_cost_save(uuid, uuid, uuid, text, numeric, text),
  public.comparison_cost_delete(uuid) to authenticated;
