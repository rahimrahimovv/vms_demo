-- DEMO-03: gives business rows past dates after the loader created them through the application's own functions.
-- The functions refuse past deadlines and stamp rows with now(), so the loader builds a story in the present and then
-- calls app.demo_backdate once per story root (a requisition, a sourcing or a vendor) to move its timestamps back.
--
-- Safety, in the same spirit as app.demo_reset:
--   * refuses unless public.demo_flag is enabled in this database;
--   * lives in the app schema (not exposed by the API) and no API role may execute it;
--   * touches only a fixed list of timestamp columns of business rows, never a status, never audit_entry, never minutes;
--   * does not disable, replace or bypass any trigger (the immutability triggers stay enabled; audit and minutes keep
--     the load time on purpose);
--   * leaves OPEN records alone: an OPEN sourcing and everything under it, a VOTING decision and its voters, and the
--     final-offer deadline and answers of a running final-offer round keep their times and their future deadlines.

create function app.demo_backdate(p_root_type text, p_root_id uuid, p_by interval) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ids   uuid[] := '{}';
  v_moved jsonb := '{}';
  v_n     integer;
  v_status text;
begin
  if not app.demo_enabled() then
    raise exception 'Demo backdate refused: demo_flag is not enabled in this database' using errcode = '42501';
  end if;
  if p_by is null or p_by <= interval '0' or p_by > interval '365 days' then
    raise exception 'Demo backdate refused: the shift must be between 0 and 365 days';
  end if;

  if p_root_type = 'requisition' then
    update public.requisition set created_at = created_at - p_by, submitted_at = submitted_at - p_by where id = p_root_id;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'Demo backdate: requisition not found'; end if;
    v_moved := v_moved || jsonb_build_object('requisition', v_n);
    v_ids := array[p_root_id];

  elsif p_root_type = 'vendor' then
    update public.vendor set created_at = created_at - p_by, submitted_at = submitted_at - p_by where id = p_root_id;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'Demo backdate: vendor not found'; end if;
    v_moved := v_moved || jsonb_build_object('vendor', v_n);
    v_ids := array[p_root_id];

    update public.vendor_contact set created_at = created_at - p_by where vendor_id = p_root_id;
    update public.vendor_bank_account set created_at = created_at - p_by where vendor_id = p_root_id;
    update public.vendor_certificate set created_at = created_at - p_by where vendor_id = p_root_id;

    with m as (update public.questionnaire_response
                  set created_at = created_at - p_by, submitted_at = submitted_at - p_by, reviewed_at = reviewed_at - p_by
                where vendor_id = p_root_id returning id)
    select v_ids || coalesce(array_agg(id), '{}') into v_ids from m;
    with m as (update public.category_application
                  set created_at = created_at - p_by, decided_at = decided_at - p_by
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
    with m as (update public.purchase_order set created_at = created_at - p_by
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
end $$;

revoke execute on function app.demo_backdate(text, uuid, interval) from public, anon, authenticated, service_role;
