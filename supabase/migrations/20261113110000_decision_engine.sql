-- Slice 5, CMT-02: one voting engine for the decision types OPENING, WINNER and PO.
-- Opening a decision snapshots the eligible voters (committee members except the sourcing owner), votes are
-- hidden until the decision closes, and the decision closes by quorum and majority (Calculation Rules).
-- Decisions, voters and minutes are written only through these functions. What a closed decision does to
-- the sourcing or the PO is app.apply_decision_outcome: OPENING comes with CMT-04, WINNER and PO with
-- Slices 6 and 7 (the triggers that open those decisions come with them).

------------------------------------------------------------------
-- 1. Voting deadline: opening time + voting period in business days (Monday to Friday, Asia/Baku)
------------------------------------------------------------------
-- Thu 12 Nov 2026 10:00 + 3 business days = Tue 17 Nov 2026 10:00 (Calculation Rules).
create function app.add_business_days(p_from timestamptz, p_days integer) returns timestamptz
language plpgsql immutable set search_path = '' as $$
declare
  v_local timestamp := p_from at time zone 'Asia/Baku';
  v_left  integer   := p_days;
begin
  while v_left > 0 loop
    v_local := v_local + interval '1 day';
    if extract(isodow from v_local) < 6 then v_left := v_left - 1; end if;
  end loop;
  return v_local at time zone 'Asia/Baku';
end $$;

------------------------------------------------------------------
-- 2. Open a decision
------------------------------------------------------------------
create function app.open_decision(p_sourcing uuid, p_type text, p_po uuid default null,
                                  p_reopened_from uuid default null, p_reopen_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s        public.sourcing;
  c        public.committee;
  v_id     uuid;
  v_dead   timestamptz;
  v_users  uuid[];
begin
  select * into s from public.sourcing where id = p_sourcing;
  select * into c from public.committee where company_id = s.company_id;
  v_dead := app.add_business_days(now(), coalesce(c.voting_period_days, 3));

  perform set_config('app.audit_reason', coalesce(nullif(btrim(p_reopen_reason), ''), ''), true);
  insert into public.decision (company_id, type, sourcing_id, purchase_order_id, deadline, reopened_from_id, reopen_reason)
  values (s.company_id, p_type, s.id, p_po, v_dead, p_reopened_from, nullif(btrim(p_reopen_reason), ''))
  returning id into v_id;

  -- AC1: the committee members at this moment, except the sourcing owner (#83); active, still Committee Members.
  insert into public.decision_voter (decision_id, user_id, is_chair)
  select v_id, m.user_id, m.is_chair
    from public.committee_member m
    join public.app_user u on u.id = m.user_id and u.is_active
   where m.committee_id = c.id and m.user_id <> s.owner_id
     and exists (select 1 from public.user_role r where r.user_id = m.user_id and r.role = 'COMMITTEE_MEMBER');

  select coalesce(array_agg(user_id), '{}') into v_users from public.decision_voter where decision_id = v_id;
  perform app.notify(v_users, 'decision.opened', 'decision', v_id, s.number,
                     jsonb_build_object('decisionType', p_type, 'deadline', v_dead));
  -- no eligible voter at all: "No quorum" at once
  if cardinality(v_users) = 0 then perform app.close_decision(v_id); end if;
  return v_id;
end $$;

------------------------------------------------------------------
-- 3. Close a decision (all voted, voting period over, or no eligible voter)
------------------------------------------------------------------
-- What the outcome does to the sourcing or the PO. Replaced by CMT-04 (OPENING); WINNER and PO follow in
-- Slices 6 and 7.
create function app.apply_decision_outcome(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  null;
end $$;

-- p_cancel_reason is set only when the sourcing was cancelled while the decision was VOTING (RFQ-04 AC6).
create function app.close_decision(p_id uuid, p_cancel_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d          public.decision;
  s          public.sourcing;
  v_eligible integer;
  v_for      integer;
  v_against  integer;
  v_chair    text;
  v_status   text;
  v_rule     text;
  v_label    text;
  v_minutes  text;
  v_users    uuid[];
begin
  select * into d from public.decision where id = p_id for update;
  if d.id is null or d.status <> 'VOTING' then return; end if;
  select * into s from public.sourcing where id = d.sourcing_id;

  select count(*) filter (where vote <> 'CONFLICT'), count(*) filter (where vote = 'FOR'),
         count(*) filter (where vote = 'AGAINST'), max(vote) filter (where is_chair)
    into v_eligible, v_for, v_against, v_chair
    from public.decision_voter where decision_id = d.id;

  if p_cancel_reason is not null then
    v_status := 'NO_DECISION'; v_rule := 'SOURCING_CANCELLED'; v_label := 'Sourcing cancelled';
  elsif (v_for + v_against) * 2 <= v_eligible or v_eligible = 0 then                        -- quorum: more than half
    v_status := 'NO_DECISION'; v_rule := 'NO_QUORUM'; v_label := 'No quorum';
  elsif v_for > v_against then
    v_status := 'APPROVED'; v_rule := 'MAJORITY'; v_label := 'Majority';
  elsif v_against > v_for then
    v_status := 'REJECTED'; v_rule := 'MAJORITY'; v_label := 'Majority';
  elsif v_chair = 'FOR' then
    v_status := 'APPROVED'; v_rule := 'CHAIR_CASTING_VOTE'; v_label := 'Chair''s casting vote';
  elsif v_chair = 'AGAINST' then
    v_status := 'REJECTED'; v_rule := 'CHAIR_CASTING_VOTE'; v_label := 'Chair''s casting vote';
  else
    v_status := 'NO_DECISION'; v_rule := 'TIE_WITHOUT_CHAIR'; v_label := 'Tie without the Chair''s vote';
  end if;

  perform set_config('app.audit_reason', v_label, true);
  update public.decision
     set status = v_status, result_rule = v_rule, closed_at = now(), close_reason = p_cancel_reason
   where id = d.id;
  v_minutes := app.next_number(d.company_id, 'MIN');                                          -- CMT-03 AC1
  insert into public.minutes (decision_id, number) values (d.id, v_minutes);

  select coalesce(array_agg(user_id), '{}') || s.owner_id into v_users from public.decision_voter where decision_id = d.id;
  perform app.notify(v_users, 'decision.closed', 'decision', d.id, s.number,
                     jsonb_build_object('decisionType', d.type, 'result', v_status, 'minutes', v_minutes));

  if p_cancel_reason is null then perform app.apply_decision_outcome(d.id); end if;
end $$;

-- Called by pg_cron every minute: decisions whose voting period has ended (NFR-010).
create function app.close_due_decisions() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.decision where status = 'VOTING' and deadline <= now()
           order by deadline for update skip locked loop
    perform app.close_decision(r.id);
  end loop;
end $$;
select cron.schedule('vms-decisions', '* * * * *', 'select app.close_due_decisions()');

------------------------------------------------------------------
-- 4. Members vote or declare a conflict of interest (AC4, AC5)
------------------------------------------------------------------
-- The caller's own voter row of a decision that is still VOTING, with the decision locked.
create function app.own_open_vote(p_decision uuid) returns public.decision_voter
language plpgsql security definer set search_path = '' as $$
declare d public.decision; v public.decision_voter;
begin
  if not app.has_role('COMMITTEE_MEMBER') then perform app.fail('errors.noAccess'); end if;
  select * into d from public.decision where id = p_decision and company_id = app.current_company_id() for update;
  if d.id is null then perform app.fail('errors.noAccess'); end if;
  select * into v from public.decision_voter where decision_id = d.id and user_id = auth.uid() for update;
  if v.id is null then perform app.fail('errors.noAccess'); end if;       -- not a voter: e.g. the sourcing owner (#83)
  if d.status <> 'VOTING' or d.deadline <= now() then perform app.fail('errors.votingClosed'); end if;
  if v.vote <> 'NONE' then perform app.fail('errors.alreadyVoted'); end if;  -- a submitted vote cannot be changed
  return v;
end $$;

-- Closes the decision as soon as every voter who is still eligible has voted.
create function app.close_if_all_voted(p_decision uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.decision_voter where decision_id = p_decision and vote = 'NONE') then
    perform app.close_decision(p_decision);
  end if;
end $$;

create function public.decision_vote(p_decision uuid, p_vote text, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.decision_voter;
begin
  if p_vote not in ('FOR', 'AGAINST') then perform app.fail('errors.noAccess'); end if;
  v := app.own_open_vote(p_decision);
  if p_vote = 'AGAINST' and nullif(btrim(p_comment), '') is null then perform app.fail('errors.commentRequired'); end if;
  update public.decision_voter
     set vote = p_vote, comment = nullif(btrim(p_comment), ''), voted_at = now() where id = v.id;
  perform app.close_if_all_voted(p_decision);
end $$;

-- AC5: the member cannot vote and leaves the eligible voters (the quorum counts the others).
create function public.decision_declare_conflict(p_decision uuid, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.decision_voter;
begin
  v := app.own_open_vote(p_decision);
  if nullif(btrim(p_comment), '') is null then perform app.fail('errors.commentRequired'); end if;
  update public.decision_voter
     set vote = 'CONFLICT', comment = btrim(p_comment), voted_at = now() where id = v.id;
  perform app.close_if_all_voted(p_decision);
end $$;

------------------------------------------------------------------
-- 5. Reopen vote (AC8): the sourcing owner, on the latest decision of its kind
------------------------------------------------------------------
-- NO_DECISION reopens (not after a cancelled sourcing); a REJECTED OPENING decision reopens with a reason that
-- the members see. WINNER and PO reopen only after NO_DECISION. The package is read live from the sourcing, so the
-- new decision carries "the same package"; only a new voter snapshot and voting period are taken.
create function public.decision_reopen(p_decision uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  d public.decision;
  s public.sourcing;
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
    perform app.fail('errors.statusChanged');                       -- already reopened, or a newer decision exists
  end if;
  if (d.type = 'OPENING' and s.status <> 'AWAITING_OPENING') or (d.type = 'WINNER' and s.status <> 'IN_COMMITTEE')
     or (d.type = 'PO' and not exists (select 1 from public.purchase_order po
                                       where po.id = d.purchase_order_id and po.status = 'PENDING_COMMITTEE')) then
    perform app.fail('errors.statusChanged');
  end if;
  if d.status = 'REJECTED' and nullif(btrim(p_reason), '') is null then perform app.fail('errors.reasonRequired'); end if;

  return app.open_decision(d.sourcing_id, d.type, d.purchase_order_id, d.id, p_reason);
end $$;

------------------------------------------------------------------
-- 6. What the screens read (votes stay hidden while VOTING, AC6; vendors read nothing here)
------------------------------------------------------------------
-- Who has voted, not how, until the decision closes; a member always sees their own vote.
create function public.decision_voters(p_decision uuid)
returns table (user_id uuid, full_name text, is_chair boolean, state text, vote text, comment text, voted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.user_id, u.full_name, v.is_chair,
         case v.vote when 'NONE' then 'WAITING' when 'CONFLICT' then 'CONFLICT' else 'VOTED' end,
         case when d.status <> 'VOTING' or v.user_id = auth.uid() then v.vote end,
         case when d.status <> 'VOTING' or v.user_id = auth.uid() then v.comment end,
         v.voted_at
    from public.decision d
    join public.decision_voter v on v.decision_id = d.id
    join public.app_user u on u.id = v.user_id
   where d.id = p_decision and d.company_id = app.current_company_id() and app.can_view_minutes()
   order by v.is_chair desc, u.full_name
$$;

-- The package a member votes on. OPENING: how many proposals arrived and, for those who may read bids
-- (Procurement Specialist, Committee Member, Admin), the bidders' names; never a price (CMT-04 AC1).
-- The WINNER and PO packages (comparison table, PO differences) come with Slices 6 and 7.
create function public.decision_package(p_decision uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'type', d.type, 'sourcingId', s.id, 'sourcingNumber', s.number, 'sourcingType', s.type,
    'sourcingStatus', s.status, 'minimum', s.min_proposals, 'lowCompetitionReason', s.low_competition_reason,
    'proposalCount', (select count(*) from public.proposal p where p.sourcing_id = s.id and p.status = 'SUBMITTED'),
    'bidders', case when app.can_view_bids() then
      (select coalesce(jsonb_agg(v.legal_name order by v.legal_name), '[]'::jsonb)
         from public.proposal p join public.vendor v on v.id = p.vendor_id
        where p.sourcing_id = s.id and p.status = 'SUBMITTED') end)
    from public.decision d join public.sourcing s on s.id = d.sourcing_id
   where d.id = p_decision and d.company_id = app.current_company_id() and app.can_view_minutes()
$$;

------------------------------------------------------------------
-- 7. Grants
------------------------------------------------------------------
revoke execute on function app.add_business_days(timestamptz, integer), app.open_decision(uuid, text, uuid, uuid, text),
  app.apply_decision_outcome(uuid), app.close_decision(uuid, text), app.close_due_decisions(),
  app.own_open_vote(uuid), app.close_if_all_voted(uuid)
  from public, anon, authenticated, service_role;

revoke execute on function public.decision_vote(uuid, text, text), public.decision_declare_conflict(uuid, text),
  public.decision_reopen(uuid, text), public.decision_voters(uuid), public.decision_package(uuid)
  from public, anon;
grant execute on function public.decision_vote(uuid, text, text), public.decision_declare_conflict(uuid, text),
  public.decision_reopen(uuid, text), public.decision_voters(uuid), public.decision_package(uuid)
  to authenticated;
