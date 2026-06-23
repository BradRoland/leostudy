-- Owner-wide admin panel support for class creation, member roles, removals, and class chat timeouts.

create table if not exists public.class_member_timeouts (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.academy_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default '',
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists class_member_timeouts_class_user_active_idx
  on public.class_member_timeouts (class_id, user_id, expires_at desc);

alter table public.class_member_timeouts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_member_timeouts'
      and policyname = 'class_member_timeouts_read_owner_admin_self'
  ) then
    create policy class_member_timeouts_read_owner_admin_self
    on public.class_member_timeouts
    for select to authenticated
    using (
      user_id = auth.uid()
      or public.is_owner(auth.uid())
      or public.is_class_admin(class_id, auth.uid())
    );
  end if;
end $$;

create or replace function public.is_class_member_timed_out(p_class_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_member_timeouts t
    where t.class_id = p_class_id
      and t.user_id = p_user_id
      and t.expires_at > now()
  );
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_messages'
      and policyname = 'class_messages_block_timed_out_insert'
  ) then
    create policy class_messages_block_timed_out_insert
    on public.class_messages
    as restrictive
    for insert to authenticated
    with check (not public.is_class_member_timed_out(class_id, auth.uid()));
  end if;
end $$;

create or replace function public.owner_create_class(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy_id uuid;
  v_class_id uuid;
  v_class_name text := trim(coalesce(p_payload->>'className', ''));
  v_start_date date := nullif(p_payload->>'startDate', '')::date;
  v_end_date date := nullif(p_payload->>'endDate', '')::date;
  v_join_mode text := coalesce(nullif(p_payload->>'joinMode', ''), 'open');
begin
  if not public.is_owner(auth.uid()) then
    raise exception 'Owner role required';
  end if;
  if v_class_name = '' then
    raise exception 'Class name is required';
  end if;
  if v_join_mode not in ('open', 'approval_required', 'code_only') then
    raise exception 'Unsupported join mode';
  end if;

  insert into public.academies (name, city, state)
  values (
    trim(coalesce(nullif(p_payload->>'academyName', ''), 'Police Academy 180')),
    trim(coalesce(p_payload->>'academyCity', '')),
    upper(trim(coalesce(nullif(p_payload->>'academyState', ''), 'CA')))
  )
  on conflict (lower(name), lower(city), lower(state)) do update
    set name = excluded.name,
        city = excluded.city,
        state = excluded.state,
        updated_at = now()
  returning id into v_academy_id;

  insert into public.academy_classes (
    academy_id,
    class_name,
    start_date,
    end_date,
    status,
    visibility,
    join_mode,
    created_by
  )
  values (
    v_academy_id,
    v_class_name,
    v_start_date,
    v_end_date,
    'active',
    'listed',
    v_join_mode,
    auth.uid()
  )
  on conflict (academy_id, lower(class_name)) do update
    set start_date = excluded.start_date,
        end_date = excluded.end_date,
        status = 'active',
        visibility = 'listed',
        join_mode = excluded.join_mode,
        updated_at = now()
  returning id into v_class_id;

  insert into public.class_departments (class_id, name, department_type)
  select v_class_id, department_name, 'agency'
  from (
    select distinct trim(value) as department_name
    from jsonb_array_elements_text(coalesce(p_payload->'departments', '[]'::jsonb)) as value
  ) departments
  where department_name <> ''
  on conflict (class_id, lower(name)) do update set name = excluded.name;

  insert into public.class_departments (class_id, name, department_type)
  values (v_class_id, 'Unassigned', 'agency')
  on conflict (class_id, lower(name)) do nothing;

  insert into public.class_audit_events (class_id, actor_user_id, event_type, metadata)
  values (
    v_class_id,
    auth.uid(),
    'owner_create_class',
    jsonb_build_object('className', v_class_name, 'joinMode', v_join_mode)
  );

  return v_class_id;
end;
$$;

create or replace function public.owner_list_class_members(p_class_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  email text,
  username text,
  avatar_path text,
  department_id uuid,
  department_name text,
  role text,
  is_active boolean,
  status text,
  joined_at timestamptz,
  timeout_until timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_owner(auth.uid()) then
    raise exception 'Owner role required';
  end if;

  return query
  select
    cm.id,
    cm.user_id,
    au.email::text,
    coalesce(p.username, '')::text,
    coalesce(p.avatar_path, '')::text,
    cm.department_id,
    coalesce(cd.name, '')::text,
    cm.role,
    cm.is_active,
    cm.status,
    cm.joined_at,
    (
      select max(t.expires_at)
      from public.class_member_timeouts t
      where t.class_id = cm.class_id
        and t.user_id = cm.user_id
        and t.expires_at > now()
    ) as timeout_until
  from public.class_memberships cm
  join auth.users au on au.id = cm.user_id
  left join public.profiles p on p.user_id = cm.user_id
  left join public.class_departments cd on cd.id = cm.department_id
  where cm.class_id = p_class_id
  order by
    case cm.role when 'class_admin' then 1 when 'moderator' then 2 else 3 end,
    coalesce(p.username, au.email, '') asc;
end;
$$;

create or replace function public.owner_set_class_member_role(
  p_membership_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_user_id uuid;
begin
  if not public.is_owner(auth.uid()) then
    raise exception 'Owner role required';
  end if;
  if p_role not in ('cadet', 'moderator', 'class_admin') then
    raise exception 'Unsupported role';
  end if;

  update public.class_memberships
  set role = p_role,
      updated_at = now()
  where id = p_membership_id
  returning class_id, user_id into v_class_id, v_user_id;

  if not found then
    raise exception 'Membership not found';
  end if;

  insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
  values (v_class_id, auth.uid(), v_user_id, 'owner_set_member_role', jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.owner_remove_class_member(
  p_membership_id uuid,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_user_id uuid;
begin
  if not public.is_owner(auth.uid()) then
    raise exception 'Owner role required';
  end if;

  update public.class_memberships
  set status = 'removed',
      is_active = false,
      updated_at = now()
  where id = p_membership_id
  returning class_id, user_id into v_class_id, v_user_id;

  if not found then
    raise exception 'Membership not found';
  end if;

  insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
  values (v_class_id, auth.uid(), v_user_id, 'owner_remove_member', jsonb_build_object('reason', coalesce(p_reason, '')));
end;
$$;

create or replace function public.owner_timeout_class_member(
  p_class_id uuid,
  p_user_id uuid,
  p_minutes int,
  p_reason text default ''
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes int := greatest(1, least(coalesce(p_minutes, 10), 10080));
  v_expires_at timestamptz := now() + (v_minutes::text || ' minutes')::interval;
begin
  if not public.is_owner(auth.uid()) then
    raise exception 'Owner role required';
  end if;

  if not exists (
    select 1 from public.class_memberships
    where class_id = p_class_id
      and user_id = p_user_id
      and status = 'active'
  ) then
    raise exception 'Active class membership not found';
  end if;

  insert into public.class_member_timeouts (class_id, user_id, reason, expires_at, created_by)
  values (p_class_id, p_user_id, coalesce(p_reason, ''), v_expires_at, auth.uid());

  insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
  values (
    p_class_id,
    auth.uid(),
    p_user_id,
    'owner_timeout_member',
    jsonb_build_object('minutes', v_minutes, 'reason', coalesce(p_reason, ''), 'expiresAt', v_expires_at)
  );

  return v_expires_at;
end;
$$;

grant select on public.class_member_timeouts to authenticated;
revoke all on function public.is_class_member_timed_out(uuid, uuid) from public, anon;
grant execute on function public.is_class_member_timed_out(uuid, uuid) to authenticated, service_role;
revoke all on function public.owner_create_class(jsonb) from public, anon;
grant execute on function public.owner_create_class(jsonb) to authenticated, service_role;
revoke all on function public.owner_list_class_members(uuid) from public, anon;
grant execute on function public.owner_list_class_members(uuid) to authenticated, service_role;
revoke all on function public.owner_set_class_member_role(uuid, text) from public, anon;
grant execute on function public.owner_set_class_member_role(uuid, text) to authenticated, service_role;
revoke all on function public.owner_remove_class_member(uuid, text) from public, anon;
grant execute on function public.owner_remove_class_member(uuid, text) to authenticated, service_role;
revoke all on function public.owner_timeout_class_member(uuid, uuid, int, text) from public, anon;
grant execute on function public.owner_timeout_class_member(uuid, uuid, int, text) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
