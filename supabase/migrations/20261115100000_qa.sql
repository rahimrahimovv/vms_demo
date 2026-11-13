-- Slice 6, RFQ-03: clarifications inside the sourcing. A vendor whose invitation is INVITED or ACCEPTED asks while
-- the sourcing is OPEN; the owner publishes the (possibly edited) question with an answer, or a clarification
-- without a question. Published items reach every vendor that has not declined, without the asker's name.
-- A file attached to a question stays with the specialist (RFQ-03 AC2, revised 13 Nov 2026); answers are text.
-- The table `question` exists since the procurement-model migration; it is written only through these functions.

-- Publishing is a status change (UNANSWERED -> PUBLISHED): audited, with the original text as the reason when the
-- specialist edited the question (AC3: the original stays visible to the specialist and in History).
create trigger question_audit after insert or update of status on public.question
  for each row execute function app.audit_status_change('question');

-- AC1: up to 2,000 characters, the owner is notified, the vendor sees "Awaiting answer".
create function public.question_ask(p_sourcing uuid, p_text text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  i    public.invitation;
  s    public.sourcing;
  v_id uuid;
  v_q  text;
begin
  select * into i from public.invitation where sourcing_id = p_sourcing and vendor_id = app.current_vendor_id();
  if i.id is null then perform app.fail('errors.noAccess'); end if;
  select * into s from public.sourcing where id = p_sourcing;
  if s.status <> 'OPEN' or s.deadline <= now() or i.status not in ('INVITED', 'ACCEPTED') then
    perform app.fail('errors.questionsClosed');                                          -- AC5
  end if;
  v_q := app.need(p_text);
  if char_length(v_q) > 2000 then perform app.fail('errors.questionTooLong'); end if;
  perform set_config('app.audit_reason', '', true);
  insert into public.question (sourcing_id, vendor_id, question_text) values (s.id, i.vendor_id, v_q)
  returning id into v_id;
  perform app.notify(array[s.owner_id], 'question.received', 'sourcing', s.id, s.number,
                     jsonb_build_object('text', left(v_q, 200)));
  return v_id;
end $$;

-- AC2-AC4: p_question null = a clarification without a question (OPEN only). The answer is required; an edited
-- question text replaces the vendor's wording in what is published. Questions can be answered until the sourcing
-- is completed or cancelled (AC6).
create function public.question_publish(p_sourcing uuid, p_question uuid, p_question_text text, p_answer text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s      public.sourcing := app.owned_sourcing(p_sourcing, array['OPEN', 'CLOSED', 'AWAITING_OPENING',
                            'TECHNICAL_EVALUATION', 'COMPARISON', 'FINAL_OFFER_ROUND', 'IN_COMMITTEE', 'WINNER_APPROVED']);
  q      public.question;
  v_text text := nullif(btrim(p_question_text), '');
  v_ans  text := app.need(p_answer);
begin
  if v_text is not null and char_length(v_text) > 2000 then perform app.fail('errors.questionTooLong'); end if;
  if p_question is null then
    if s.status <> 'OPEN' then perform app.fail('errors.statusChanged'); end if;     -- AC4
    perform set_config('app.audit_reason', '', true);
    insert into public.question (sourcing_id, vendor_id, question_text, published_question_text, answer_text,
                                 status, published_at)
    values (s.id, null, null, v_text, v_ans, 'PUBLISHED', now());
  else
    select * into q from public.question where id = p_question and sourcing_id = s.id for update;
    if q.id is null then perform app.fail('errors.noAccess'); end if;
    if q.status <> 'UNANSWERED' then perform app.fail('errors.statusChanged'); end if;
    v_text := coalesce(v_text, q.question_text);
    perform set_config('app.audit_reason',
      case when v_text <> q.question_text then 'Original question: ' || q.question_text else '' end, true);  -- AC3
    update public.question
       set published_question_text = v_text, answer_text = v_ans, status = 'PUBLISHED', published_at = now()
     where id = q.id;
  end if;
  perform app.notify(app.invited_user_ids(s.id), 'qa.published', 'sourcing', s.id, s.number,
                     jsonb_build_object('question', coalesce(left(v_text, 200), left(v_ans, 200))));
end $$;

-- What a vendor reads: published items (no asker) and its own questions; nothing after a decline (AC2, AC5).
create function public.vendor_qa(p_sourcing uuid)
returns table (id uuid, question text, answer text, status text, own boolean, asked_at timestamptz,
               published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select q.id,
         case when q.status = 'PUBLISHED' then q.published_question_text else q.question_text end,
         q.answer_text, q.status, coalesce(q.vendor_id = i.vendor_id, false), q.asked_at, q.published_at
    from public.invitation i
    join public.question q on q.sourcing_id = i.sourcing_id
   where i.sourcing_id = p_sourcing and i.vendor_id = app.current_vendor_id() and i.status <> 'DECLINED'
     and (q.status = 'PUBLISHED' or q.vendor_id = i.vendor_id)
   order by coalesce(q.published_at, q.asked_at)
$$;

-- Files: 'question' attachments by the asking vendor while the question is UNANSWERED and the sourcing OPEN.
create or replace function public.file_attach_allowed(p_owner_type text, p_owner_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_owner_type
    when 'sourcing' then exists (select 1 from public.sourcing s where s.id = p_owner_id
                                 and s.owner_id = auth.uid() and s.status = 'DRAFT')
    when 'proposal' then exists (select 1 from public.proposal p join public.sourcing s on s.id = p.sourcing_id
                                 where p.id = p_owner_id and p.vendor_id = app.current_vendor_id()
                                   and p.status in ('DRAFT', 'SUBMITTED', 'WITHDRAWN')
                                   and s.status = 'OPEN' and s.deadline > now())
    when 'question' then exists (select 1 from public.question q join public.sourcing s on s.id = q.sourcing_id
                                 where q.id = p_owner_id and q.vendor_id = app.current_vendor_id()
                                   and q.status = 'UNANSWERED' and s.status = 'OPEN')
    else false end
$$;

revoke execute on function public.question_ask(uuid, text), public.question_publish(uuid, uuid, text, text),
  public.vendor_qa(uuid), public.file_attach_allowed(text, uuid) from public, anon;
grant execute on function public.question_ask(uuid, text), public.question_publish(uuid, uuid, text, text),
  public.vendor_qa(uuid), public.file_attach_allowed(text, uuid) to authenticated;
