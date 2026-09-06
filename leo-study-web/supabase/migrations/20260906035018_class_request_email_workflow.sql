-- Approval and email delivery are one durable workflow. Existing accounts,
-- memberships, study data and historical requests are preserved.
create schema if not exists class_workflow_private;
revoke all on schema class_workflow_private from public, anon, authenticated;

create table public.class_request_email_outbox (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.class_creation_requests(id) on delete cascade,
  event_type text not null check (event_type in ('owner_review', 'request_approved', 'request_rejected')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'needs_review')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  lock_token uuid,
  first_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  unique (request_id, event_type)
);
alter table public.class_request_email_outbox enable row level security;
revoke all on public.class_request_email_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.class_request_email_outbox to service_role;
create index class_request_email_outbox_ready_idx on public.class_request_email_outbox(available_at) where status = 'pending';

create function class_workflow_private.queue_class_request_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_event text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then v_event := 'owner_review';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'approved' then v_event := 'request_approved';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'rejected' then v_event := 'request_rejected';
  else return new;
  end if;
  insert into public.class_request_email_outbox(request_id, event_type, payload)
  values (new.id, v_event, to_jsonb(new) - 'created_invite_code')
  on conflict (request_id, event_type) do nothing;
  return new;
end;
$$;
revoke all on function class_workflow_private.queue_class_request_email() from public, anon, authenticated;
create trigger class_request_email_event after insert or update of status on public.class_creation_requests
for each row execute function class_workflow_private.queue_class_request_email();

-- These service-only RPCs use the caller's permissions. A lease and SKIP LOCKED
-- let multiple web processes share the queue without sending the same event.
create function public.claim_class_request_emails(p_limit integer default 10)
returns setof public.class_request_email_outbox language plpgsql security invoker set search_path = '' as $$
begin
  -- An expired lease may have delivered SMTP before the process stopped. Never
  -- automatically resend an uncertain delivery; the operator can inspect it.
  update public.class_request_email_outbox set status = 'needs_review',
    last_error = 'Delivery lease expired. Verify provider delivery before retrying.', lock_token = null
  where status = 'sending' and locked_until < now();
  return query
  with ready as (
    select id from public.class_request_email_outbox
    where status = 'pending' and available_at <= now()
    order by available_at, created_at for update skip locked limit greatest(1, least(p_limit, 25))
  )
  update public.class_request_email_outbox o
  set status = 'sending', attempts = attempts + 1,
      locked_until = now() + interval '5 minutes', lock_token = gen_random_uuid(),
      first_attempt_at = coalesce(first_attempt_at, now())
  from ready where o.id = ready.id returning o.*;
end;
$$;
create function public.finish_class_request_email(p_id uuid, p_lock_token uuid, p_outcome text,
  p_provider_message_id text default null, p_error text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_outcome not in ('sent', 'retry', 'needs_review') then raise exception 'Invalid delivery outcome'; end if;
  update public.class_request_email_outbox set
    status = case when p_outcome = 'retry' and attempts < 8 then 'pending'
                  when p_outcome = 'sent' then 'sent' else 'needs_review' end,
    available_at = now() + make_interval(secs => least(3600, (30 * power(2, attempts))::integer)),
    sent_at = case when p_outcome = 'sent' then now() else null end,
    provider_message_id = p_provider_message_id,
    last_error = left(p_error, 500), locked_until = null, lock_token = null
  where id = p_id and lock_token = p_lock_token and status = 'sending';
  return found;
end;
$$;
revoke all on function public.claim_class_request_emails(integer) from public, anon, authenticated;
revoke all on function public.finish_class_request_email(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_class_request_emails(integer) to service_role;
grant execute on function public.finish_class_request_email(uuid, uuid, text, text, text) to service_role;

-- Prevent direct inserts from bypassing validation or setting an approval state.
drop policy if exists class_creation_requests_insert_self on public.class_creation_requests;
drop policy if exists class_creation_requests_update_owner on public.class_creation_requests;
revoke insert, update on public.class_creation_requests from authenticated;

create or replace function public.request_class_creation(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_request_id uuid;
  v_name text;
  v_email text;
  v_academy text := trim(coalesce(p_payload->>'academyName', ''));
  v_class text := trim(coalesce(p_payload->>'className', ''));
  v_departments text[];
  v_requester_department text := trim(coalesce(p_payload->>'requesterDepartment', ''));
  v_start date;
  v_end date;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select coalesce(nullif(trim(raw_user_meta_data->>'full_name'), ''), nullif(trim(raw_user_meta_data->>'username'), ''), email), email
    into v_name, v_email from auth.users where id = v_user_id;
  if nullif(v_email, '') is null then raise exception 'An email address is required'; end if;
  if length(v_academy) not between 2 and 160 or length(v_class) not between 2 and 120 then
    raise exception 'Enter an academy name and class name';
  end if;
  if length(coalesce(p_payload->>'academyCity', '')) > 120 or length(coalesce(p_payload->>'academyState', '')) > 80
    or length(coalesce(p_payload->>'requesterNote', '')) > 2000 then raise exception 'Class details are too long'; end if;
  if jsonb_typeof(p_payload->'departments') is distinct from 'array' then raise exception 'Add your class departments'; end if;
  if jsonb_array_length(p_payload->'departments') not between 1 and 100 then raise exception 'Add between 1 and 100 departments'; end if;
  select array_agg(name order by name) into v_departments from (
    select min(trim(value)) as name from jsonb_array_elements_text(p_payload->'departments')
    where trim(value) <> '' group by lower(trim(value))
  ) d;
  if coalesce(array_length(v_departments, 1), 0) = 0 or exists (select 1 from unnest(v_departments) d where length(d) > 160) then
    raise exception 'Add valid department names (up to 160 characters each)';
  end if;
  if v_requester_department = '' then v_requester_department := v_departments[1]; end if;
  select d into v_requester_department from unnest(v_departments) d where lower(d) = lower(v_requester_department);
  if v_requester_department is null then raise exception 'Choose a department from your class department list'; end if;
  if coalesce(p_payload->>'startDate', '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_payload->>'endDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Enter the class start and graduation dates';
  end if;
  v_start := (p_payload->>'startDate')::date;
  v_end := (p_payload->>'endDate')::date;
  if v_end < v_start then raise exception 'Graduation must be on or after the start date'; end if;
  if v_end < current_date then raise exception 'Graduation date cannot be in the past'; end if;
  -- Serialize retries for this requester so a lost HTTP response does not create
  -- duplicate requests or duplicate emails. Limit outstanding requests to one.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  -- Keep profile setup atomic with this request, including Google accounts.
  -- Merge only a UX key, never an authorization claim. Existing class members
  -- retain their previous onboarding state and all other metadata is preserved.
  update auth.users set
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('academy_onboarding_version', 1),
    updated_at = now()
  where id = v_user_id
    and not exists(select 1 from public.class_memberships where user_id = v_user_id and status = 'active');
  select id into v_request_id from public.class_creation_requests
    where requester_user_id = v_user_id and status = 'pending' order by created_at desc limit 1;
  if v_request_id is not null then return v_request_id; end if;
  if exists (select 1 from public.academy_classes c join public.academies a on a.id = c.academy_id
    where lower(c.class_name) = lower(v_class) and lower(a.name) = lower(v_academy)
      and lower(a.city) = lower(trim(coalesce(p_payload->>'academyCity', '')))
      and lower(a.state) = lower(trim(coalesce(p_payload->>'academyState', 'CA')))) then
    raise exception 'This class already exists. Choose it from the class list or contact the owner.';
  end if;
  insert into public.class_creation_requests(requester_user_id, requester_name, requester_email,
    academy_name, academy_city, academy_state, class_name, start_date, end_date, departments, requester_department, requester_note)
  values(v_user_id, v_name, v_email, v_academy, trim(coalesce(p_payload->>'academyCity', '')),
    upper(trim(coalesce(p_payload->>'academyState', 'CA'))), v_class, v_start, v_end, v_departments,
    v_requester_department, trim(coalesce(p_payload->>'requesterNote', '')))
  returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.request_class_creation(jsonb) from public, anon;
grant execute on function public.request_class_creation(jsonb) to authenticated;

create or replace function public.owner_approve_class_creation_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request public.class_creation_requests%rowtype;
  v_academy_id uuid;
  v_class_id uuid;
  v_department_name text;
  v_requester_department_id uuid;
  v_invite_code text;
begin
  if auth.uid() is null or not public.is_owner(auth.uid()) then raise exception 'Owner role required'; end if;
  select * into v_request from public.class_creation_requests where id = p_request_id for update;
  if not found then raise exception 'Class request not found'; end if;
  if v_request.status = 'approved' then
    return jsonb_build_object('classId', v_request.created_class_id, 'inviteCode', v_request.created_invite_code);
  end if;
  if v_request.status <> 'pending' then raise exception 'Class request already decided'; end if;
  if v_request.end_date < current_date then raise exception 'This class has graduated. Request updated dates before approval.'; end if;

  insert into public.academies (name, city, state)
  values (v_request.academy_name, v_request.academy_city, v_request.academy_state)
  on conflict (lower(name), lower(city), lower(state)) do update set updated_at = now() returning id into v_academy_id;
  -- Never upsert an existing class here: doing so could promote a requester
  -- into another class or overwrite its dates and enrollment settings.
  if exists (select 1 from public.academy_classes where academy_id = v_academy_id and lower(class_name) = lower(v_request.class_name)) then
    raise exception 'A class with this academy and name already exists';
  end if;
  insert into public.academy_classes(academy_id, class_name, start_date, end_date, status, visibility, join_mode, created_by)
  values(v_academy_id, v_request.class_name, v_request.start_date, v_request.end_date, 'active', 'listed', 'open', v_request.requester_user_id)
  returning id into v_class_id;
  foreach v_department_name in array coalesce(v_request.departments, '{}'::text[]) loop
    if trim(v_department_name) <> '' then
      insert into public.class_departments(class_id, name) values(v_class_id, trim(v_department_name))
      on conflict (class_id, lower(name)) do nothing;
    end if;
  end loop;
  insert into public.class_departments(class_id, name)
  values(v_class_id, coalesce(nullif(v_request.requester_department, ''), v_request.departments[1], 'Unassigned'))
  on conflict (class_id, lower(name)) do update set name = excluded.name returning id into v_requester_department_id;
  update public.class_memberships set is_active = false where user_id = v_request.requester_user_id;
  insert into public.class_memberships(class_id, user_id, department_id, role, is_active, status)
  values(v_class_id, v_request.requester_user_id, v_requester_department_id, 'class_admin', true, 'active');
  v_invite_code := public.generate_class_invite_code(v_request.class_name);
  insert into public.class_invites(class_id, token_hash, code_hint, role_granted, created_by)
  values(v_class_id, public.class_invite_hash(v_invite_code), right(v_invite_code, 4), 'cadet', auth.uid());
  update public.class_creation_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(),
    created_class_id = v_class_id, created_invite_code = v_invite_code where id = p_request_id;
  insert into public.class_audit_events(class_id, actor_user_id, target_user_id, event_type, metadata)
  values(v_class_id, auth.uid(), v_request.requester_user_id, 'class_request_approved', jsonb_build_object('requestId', p_request_id));
  return jsonb_build_object('classId', v_class_id, 'inviteCode', v_invite_code);
end;
$$;
revoke all on function public.owner_approve_class_creation_request(uuid) from public, anon;
grant execute on function public.owner_approve_class_creation_request(uuid) to authenticated;

-- All enrollment RPCs already use this helper. Eligibility now follows class
-- state, so approved future classes work without another application release.
create or replace function public.is_current_enrollment_class(p_class_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.academy_classes where id = p_class_id
    and status = 'active' and visibility = 'listed' and (end_date is null or end_date >= current_date));
$$;
revoke all on function public.is_current_enrollment_class(uuid) from public, anon;
grant execute on function public.is_current_enrollment_class(uuid) to authenticated, service_role;

-- A new requester waits for owner approval before acquiring workspace access,
-- including through a valid invite for another class. Existing members keep
-- access while requesting an additional class. The owner approval transaction
-- is the only user action allowed to establish that first membership.
create or replace function class_workflow_private.guard_pending_class_enrollment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (tg_table_name = 'class_memberships' and new.status <> 'active')
    or (tg_table_name = 'class_join_requests' and new.status <> 'pending') then return new; end if;
  -- Maintenance uses the server service role without a user JWT. End-user
  -- writes still require the existing table/RPC permissions and RLS policies.
  if auth.uid() is null or public.is_owner(auth.uid()) then return new; end if;
  if exists(select 1 from public.class_creation_requests where requester_user_id = new.user_id and status = 'pending')
    and not exists(select 1 from public.class_memberships where user_id = new.user_id and status = 'active') then
    raise exception 'Your class request is awaiting owner approval. We will email you when it is ready.';
  end if;
  return new;
end;
$$;
revoke all on function class_workflow_private.guard_pending_class_enrollment() from public, anon, authenticated;
create trigger class_pending_approval_membership_guard before insert or update of user_id, class_id, status on public.class_memberships
for each row execute function class_workflow_private.guard_pending_class_enrollment();
create trigger class_pending_approval_join_request_guard before insert or update of user_id, class_id, status on public.class_join_requests
for each row execute function class_workflow_private.guard_pending_class_enrollment();
