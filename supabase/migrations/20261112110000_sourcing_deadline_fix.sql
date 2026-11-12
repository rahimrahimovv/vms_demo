-- RFQ-01 AC4 fix: the form sends the deadline to the minute, the stored prefilled value has microseconds.
-- "Not changed by the specialist" is therefore decided at minute precision. An unchanged prefilled deadline
-- keeps its stored value and stays "prefilled", so Publish recalculates it from the publish time.
create or replace function public.sourcing_save(p_id uuid, p_deadline timestamptz, p_incoterm text, p_named_place uuid,
                                                p_delivery_mode uuid, p_payment_term uuid, p_tech_doc boolean,
                                                p_justification text, p_excluded uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  s        public.sourcing := app.owned_sourcing(p_id, array['DRAFT']);
  v_same   boolean := s.deadline_prefilled and p_deadline is not null and s.deadline is not null
                      and date_trunc('minute', p_deadline) = date_trunc('minute', s.deadline);
begin
  if not v_same and p_deadline is not null and p_deadline <= now() then perform app.fail('errors.deadlinePast'); end if;
  update public.sourcing
     set deadline = case when v_same then s.deadline else p_deadline end,
         deadline_prefilled = v_same,
         required_incoterm = nullif(p_incoterm, ''), named_place_id = p_named_place,
         delivery_mode_id = p_delivery_mode, payment_term_id = p_payment_term,
         tech_doc_required = (s.type = 'TENDER' and coalesce(p_tech_doc, false)),
         ssp_justification = nullif(btrim(p_justification), ''),
         excluded_vendor_ids = case when s.type = 'SSP' then '{}' else coalesce(p_excluded, '{}') end
   where id = s.id;
end $$;

revoke execute on function public.sourcing_save(uuid, timestamptz, text, uuid, uuid, uuid, boolean, text, uuid[])
  from public, anon;
grant execute on function public.sourcing_save(uuid, timestamptz, text, uuid, uuid, uuid, boolean, text, uuid[])
  to authenticated;
