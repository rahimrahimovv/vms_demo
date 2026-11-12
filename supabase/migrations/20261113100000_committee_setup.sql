-- Slice 5, CMT-01: the Admin sets the committee members, the Chair and the voting period.
-- Tables `committee` and `committee_member` exist since the procurement-model migration and are written
-- only through this function (no write policies). Open decisions keep the voter list they opened with
-- (decision_voter is a snapshot), so a saved change only reaches new decisions (AC3).

-- Columns the decision engine needs (CMT-02 AC8, CMT-04 AC4, RFQ-04 AC6; backlog ERD of 12 Nov 2026).
alter table public.decision
  add column reopened_from_id uuid references public.decision (id),
  add column reopen_reason    text,
  add column close_reason     text;

do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.decision'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%result_rule%' loop
    execute format('alter table public.decision drop constraint %I', c);
  end loop;
end $$;
alter table public.decision add constraint decision_result_rule_check check (result_rule in (
  'MAJORITY', 'CHAIR_CASTING_VOTE', 'NO_QUORUM', 'TIE_WITHOUT_CHAIR', 'SOURCING_CANCELLED'));

-- AC1: odd number of members, at least 3, exactly one Chair; AC2: voting period in business days.
create function public.committee_save(p_members uuid[], p_chair uuid, p_voting_days integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := app.current_company_id();
  v_members uuid[];
  v_committee uuid;
begin
  if not app.has_role('ADMIN') then perform app.fail('errors.noAccess'); end if;
  select coalesce(array_agg(distinct m), '{}') into v_members from unnest(coalesce(p_members, '{}')) m;
  if cardinality(v_members) < 3 or cardinality(v_members) % 2 = 0 then perform app.fail('errors.committeeSize'); end if;
  if p_chair is null or not (p_chair = any (v_members)) then perform app.fail('errors.chairRequired'); end if;
  if p_voting_days is null or p_voting_days < 1 then perform app.fail('errors.votingPeriod'); end if;
  if (select count(*) from public.app_user u join public.user_role r on r.user_id = u.id
       where u.id = any (v_members) and u.company_id = v_company and u.is_active
         and r.role = 'COMMITTEE_MEMBER') <> cardinality(v_members) then
    perform app.fail('errors.committeeMember');
  end if;

  insert into public.committee (company_id, voting_period_days) values (v_company, p_voting_days)
  on conflict (company_id) do update set voting_period_days = excluded.voting_period_days
  returning id into v_committee;
  delete from public.committee_member where committee_id = v_committee;
  insert into public.committee_member (committee_id, user_id, is_chair)
  select v_committee, m, m = p_chair from unnest(v_members) m;
end $$;

revoke execute on function public.committee_save(uuid[], uuid, integer) from public, anon;
grant execute on function public.committee_save(uuid[], uuid, integer) to authenticated;
