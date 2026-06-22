-- Per-class join access setting.
-- Existing data is preserved. Existing classes default to open joining unless an admin changes them.

alter table public.academy_classes
  drop constraint if exists academy_classes_join_mode_check;

update public.academy_classes
set join_mode = 'open'
where join_mode in ('request_only', 'request_and_code');

update public.academy_classes
set join_mode = 'approval_required'
where join_mode = 'closed';

alter table public.academy_classes
  alter column join_mode set default 'open';

alter table public.academy_classes
  add constraint academy_classes_join_mode_check
  check (join_mode in ('open', 'approval_required', 'code_only'));

create or replace function public.update_class_join_mode(p_class_id uuid, p_join_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_join_mode not in ('open', 'approval_required') then
    raise exception 'Unsupported join mode';
  end if;

  if not public.is_class_admin(p_class_id, auth.uid()) then
    raise exception 'Class admin role required';
  end if;

  update public.academy_classes
  set join_mode = p_join_mode,
      updated_at = now()
  where id = p_class_id;

  if not found then
    raise exception 'Class not found';
  end if;

  insert into public.class_audit_events (class_id, actor_user_id, event_type, metadata)
  values (p_class_id, auth.uid(), 'class_join_mode_updated', jsonb_build_object('joinMode', p_join_mode));
end;
$$;

create or replace function public.owner_approve_class_creation_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.class_creation_requests%rowtype;
  v_academy_id uuid;
  v_class_id uuid;
  v_department_name text;
  v_requester_department_id uuid;
  v_invite_code text;
begin
  if not public.is_owner(auth.uid()) then
    raise exception 'Owner role required';
  end if;

  select * into v_request from public.class_creation_requests where id = p_request_id for update;
  if not found then raise exception 'Class request not found'; end if;
  if v_request.status <> 'pending' then raise exception 'Class request already decided'; end if;

  insert into public.academies (name, city, state)
  values (v_request.academy_name, v_request.academy_city, v_request.academy_state)
  on conflict (lower(name), lower(city), lower(state)) do update set updated_at = now()
  returning id into v_academy_id;

  insert into public.academy_classes (academy_id, class_name, start_date, end_date, status, visibility, join_mode, created_by)
  values (v_academy_id, v_request.class_name, v_request.start_date, v_request.end_date, 'active', 'listed', 'open', v_request.requester_user_id)
  on conflict (academy_id, lower(class_name)) do update
    set start_date = excluded.start_date,
        end_date = excluded.end_date,
        status = 'active',
        visibility = 'listed',
        join_mode = coalesce(nullif(public.academy_classes.join_mode, ''), 'open'),
        updated_at = now()
  returning id into v_class_id;

  foreach v_department_name in array coalesce(v_request.departments, '{}'::text[]) loop
    if trim(v_department_name) <> '' then
      insert into public.class_departments (class_id, name)
      values (v_class_id, trim(v_department_name))
      on conflict (class_id, lower(name)) do nothing;
    end if;
  end loop;

  insert into public.class_departments (class_id, name)
  values (v_class_id, coalesce(nullif(v_request.requester_department, ''), 'Unassigned'))
  on conflict (class_id, lower(name)) do update set name = excluded.name
  returning id into v_requester_department_id;

  update public.class_memberships set is_active = false where user_id = v_request.requester_user_id;
  insert into public.class_memberships (class_id, user_id, department_id, role, is_active, status)
  values (v_class_id, v_request.requester_user_id, v_requester_department_id, 'class_admin', true, 'active')
  on conflict (class_id, user_id) do update
    set role = 'class_admin',
        department_id = excluded.department_id,
        status = 'active',
        is_active = true;

  v_invite_code := public.generate_class_invite_code(v_request.class_name);
  insert into public.class_invites (class_id, token_hash, code_hint, role_granted, created_by)
  values (v_class_id, public.class_invite_hash(v_invite_code), right(v_invite_code, 4), 'cadet', auth.uid());

  update public.class_creation_requests
  set status = 'approved',
      decided_by = auth.uid(),
      decided_at = now(),
      created_class_id = v_class_id,
      created_invite_code = v_invite_code
  where id = p_request_id;

  insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
  values (v_class_id, auth.uid(), v_request.requester_user_id, 'class_request_approved', jsonb_build_object('requestId', p_request_id, 'inviteCode', v_invite_code));

  return jsonb_build_object('classId', v_class_id, 'inviteCode', v_invite_code);
end;
$$;

create or replace function public.join_class_directly(p_class_id uuid, p_department_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.academy_classes%rowtype;
  v_existing_role text;
  v_department_class_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_class
  from public.academy_classes
  where id = p_class_id;

  if not found then
    raise exception 'Class not found';
  end if;

  if v_class.join_mode = 'approval_required' then
    raise exception 'This class requires admin approval to join';
  end if;

  if v_class.join_mode = 'code_only' then
    raise exception 'Enter a class code to join this class';
  end if;

  if p_department_id is not null then
    select class_id into v_department_class_id
    from public.class_departments
    where id = p_department_id;

    if v_department_class_id is null or v_department_class_id <> p_class_id then
      raise exception 'Choose a department in this class';
    end if;
  end if;

  select role into v_existing_role
  from public.class_memberships
  where class_id = p_class_id
    and user_id = auth.uid()
  limit 1;

  update public.class_memberships
  set is_active = false
  where user_id = auth.uid();

  insert into public.class_memberships (class_id, user_id, department_id, role, is_active, status)
  values (
    p_class_id,
    auth.uid(),
    p_department_id,
    case when v_existing_role in ('class_admin', 'moderator') then v_existing_role else 'cadet' end,
    true,
    'active'
  )
  on conflict (class_id, user_id) do update
    set department_id = coalesce(excluded.department_id, public.class_memberships.department_id),
        role = case
          when public.class_memberships.role in ('class_admin', 'moderator') then public.class_memberships.role
          else 'cadet'
        end,
        status = 'active',
        is_active = true;

  update public.class_join_requests
  set status = 'cancelled',
      decision_note = 'User joined directly.',
      decided_at = now()
  where class_id = p_class_id
    and user_id = auth.uid()
    and status = 'pending';

  insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
  values (p_class_id, auth.uid(), auth.uid(), 'class_joined_directly', jsonb_build_object('departmentId', p_department_id));

  return p_class_id;
end;
$$;

create or replace function public.request_to_join_class(p_class_id uuid, p_department_id uuid default null, p_note text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_join_mode text;
  v_department_class_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select join_mode into v_join_mode
  from public.academy_classes
  where id = p_class_id;

  if not found then
    raise exception 'Class not found';
  end if;

  if v_join_mode <> 'approval_required' then
    raise exception 'This class is open. Join it directly instead';
  end if;

  if exists (select 1 from public.class_memberships where class_id = p_class_id and user_id = auth.uid() and status = 'active') then
    raise exception 'You are already in this class';
  end if;

  if p_department_id is not null then
    select class_id into v_department_class_id
    from public.class_departments
    where id = p_department_id;

    if v_department_class_id is null or v_department_class_id <> p_class_id then
      raise exception 'Choose a department in this class';
    end if;
  end if;

  insert into public.class_join_requests (class_id, user_id, department_id, note)
  values (p_class_id, auth.uid(), p_department_id, coalesce(p_note, ''))
  on conflict (class_id, user_id, status) do update
    set note = excluded.note,
        department_id = excluded.department_id
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.update_class_join_mode(uuid, text) from public, anon;
grant execute on function public.update_class_join_mode(uuid, text) to authenticated, service_role;
grant execute on function public.join_class_directly(uuid, uuid) to authenticated, service_role;
grant execute on function public.request_to_join_class(uuid, uuid, text) to authenticated, service_role;
