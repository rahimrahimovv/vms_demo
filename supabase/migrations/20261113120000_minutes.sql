-- Slice 5, CMT-03: numbered minutes for every closed decision.
-- The number MIN-YYYY-NNN is taken and the row inserted by app.close_decision (decision engine) in the same
-- transaction as the status change, so there is one minutes row per closed decision and numbers are never reused
-- (doc_counter). Minutes are read-only: the immutability trigger and "no write privilege" exist since the
-- procurement-model migration (AC4); vendors are not in the readers' role list (AC5).

-- Everything the minutes screen and the English PDF show (AC2), in one place so both agree.
-- Votes: FOR, AGAINST, CONFLICT, NONE (shown as "Did not vote"). Voters are the snapshot taken when the
-- decision opened, conflicts included. Counts follow the Calculation Rules.
create function public.minutes_view(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'number', m.number, 'createdAt', m.created_at,
    'decisionId', d.id, 'type', d.type, 'status', d.status, 'resultRule', d.result_rule,
    'openedAt', d.opened_at, 'closedAt', d.closed_at, 'deadline', d.deadline,
    'sourcingId', s.id, 'sourcingNumber', s.number, 'poNumber', po.number,
    'closeReason', d.close_reason, 'reopenReason', d.reopen_reason,
    'eligible', (select count(*) from public.decision_voter v where v.decision_id = d.id and v.vote <> 'CONFLICT'),
    'for', (select count(*) from public.decision_voter v where v.decision_id = d.id and v.vote = 'FOR'),
    'against', (select count(*) from public.decision_voter v where v.decision_id = d.id and v.vote = 'AGAINST'),
    'voters', (select coalesce(jsonb_agg(jsonb_build_object(
                 'name', u.full_name, 'isChair', v.is_chair, 'vote', v.vote, 'comment', v.comment)
               order by v.is_chair desc, u.full_name), '[]'::jsonb)
                 from public.decision_voter v join public.app_user u on u.id = v.user_id
                where v.decision_id = d.id))
    from public.minutes m
    join public.decision d on d.id = m.decision_id
    join public.sourcing s on s.id = d.sourcing_id
    left join public.purchase_order po on po.id = d.purchase_order_id
   where m.id = p_id and d.company_id = app.current_company_id() and app.can_view_minutes()
$$;

revoke execute on function public.minutes_view(uuid) from public, anon;
grant execute on function public.minutes_view(uuid) to authenticated;
