-- Seed the two current enrollment classes, retire Class 180 from new enrollment,
-- and enforce class-scoped weekly/all-time leaderboard access.
-- Existing Class 180 memberships and leaderboard rows are intentionally preserved.

with academy as (
  insert into public.academies (name, city, state)
  values ('Police Academy 180', '', 'CA')
  on conflict (lower(name), lower(city), lower(state)) do update
    set updated_at = now()
  returning id
), enrollment_classes as (
  insert into public.academy_classes (
    academy_id,
    class_name,
    status,
    visibility,
    join_mode
  )
  select academy.id, class_name, 'active', 'listed', 'open'
  from academy
  cross join (values ('Class 181'), ('Class 182')) as requested_classes(class_name)
  on conflict (academy_id, lower(class_name)) do update
    set status = 'active',
        visibility = 'listed',
        join_mode = 'open',
        updated_at = now()
  returning id
)
insert into public.class_departments (class_id, name, department_type)
select id, 'Unassigned', 'agency'
from enrollment_classes
on conflict (class_id, lower(name)) do update
  set name = excluded.name;

update public.academy_classes
set visibility = 'unlisted',
    join_mode = 'code_only',
    updated_at = now()
where lower(trim(class_name)) = 'class 180';

update public.class_invites
set disabled_at = coalesce(disabled_at, now())
where class_id in (
  select id
  from public.academy_classes
  where lower(trim(class_name)) = 'class 180'
);

update public.class_join_requests
set status = 'cancelled',
    decision_note = 'Class 180 is closed to new enrollment.',
    decided_at = coalesce(decided_at, now())
where status = 'pending'
  and class_id in (
    select id
    from public.academy_classes
    where lower(trim(class_name)) = 'class 180'
  );

create or replace function public.is_current_enrollment_class(p_class_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.academy_classes
    where id = p_class_id
      and lower(trim(class_name)) in ('class 181', 'class 182')
      and status = 'active'
  );
$$;

revoke all on function public.is_current_enrollment_class(uuid) from public, anon;
grant execute on function public.is_current_enrollment_class(uuid) to authenticated, service_role;

create or replace function public.ensure_class_180_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select c.id into v_class_id
  from public.academy_classes c
  join public.class_memberships cm
    on cm.class_id = c.id
   and cm.user_id = auth.uid()
   and cm.status = 'active'
  where lower(trim(c.class_name)) = 'class 180'
  limit 1;

  if v_class_id is not null then
    return v_class_id;
  end if;

  raise exception 'Class 180 is closed to new enrollment. Choose Class 181 or Class 182.';
end;
$$;

revoke all on function public.ensure_class_180_membership() from public, anon;
grant execute on function public.ensure_class_180_membership() to authenticated, service_role;

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

  if not public.is_current_enrollment_class(p_class_id) or v_class.visibility <> 'listed' then
    raise exception 'Choose Class 181 or Class 182';
  end if;

  if v_class.join_mode = 'approval_required' then
    raise exception 'This class requires admin approval to join';
  end if;

  if v_class.join_mode <> 'open' then
    raise exception 'This class is not open for direct enrollment';
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
  v_visibility text;
  v_department_class_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select join_mode, visibility into v_join_mode, v_visibility
  from public.academy_classes
  where id = p_class_id;

  if not found then
    raise exception 'Class not found';
  end if;

  if not public.is_current_enrollment_class(p_class_id) or v_visibility <> 'listed' then
    raise exception 'Choose Class 181 or Class 182';
  end if;

  if v_join_mode <> 'approval_required' then
    raise exception 'This class is open. Join it directly instead';
  end if;

  if exists (
    select 1
    from public.class_memberships
    where class_id = p_class_id
      and user_id = auth.uid()
      and status = 'active'
  ) then
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

create or replace function public.lookup_class_invite(p_code text)
returns table (
  class_id uuid,
  class_name text,
  academy_name text,
  academy_city text,
  academy_state text,
  start_date date,
  end_date date,
  role_granted text,
  department_id uuid,
  department_name text,
  expires_at timestamptz,
  max_uses int,
  use_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.class_invites%rowtype;
begin
  select * into v_invite
  from public.class_invites
  where token_hash = public.class_invite_hash(p_code);

  if not found then raise exception 'Invite not found'; end if;
  if not public.is_current_enrollment_class(v_invite.class_id) then
    raise exception 'This class is closed to new enrollment';
  end if;
  if v_invite.disabled_at is not null then raise exception 'Invite is disabled'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then raise exception 'Invite has expired'; end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then raise exception 'Invite has no uses remaining'; end if;

  return query
  select
    c.id,
    c.class_name,
    a.name,
    a.city,
    a.state,
    c.start_date,
    c.end_date,
    v_invite.role_granted,
    d.id,
    d.name,
    v_invite.expires_at,
    v_invite.max_uses,
    v_invite.use_count
  from public.academy_classes c
  join public.academies a on a.id = c.academy_id
  left join public.class_departments d
    on d.id = v_invite.department_id
   and d.class_id = v_invite.class_id
  where c.id = v_invite.class_id;
end;
$$;

create or replace function public.accept_class_invite(p_code text, p_department_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.class_invites%rowtype;
  v_department_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_invite
  from public.class_invites
  where token_hash = public.class_invite_hash(p_code)
  for update;

  if not found then raise exception 'Invite not found'; end if;
  if not public.is_current_enrollment_class(v_invite.class_id) then
    raise exception 'This class is closed to new enrollment';
  end if;
  if v_invite.disabled_at is not null then raise exception 'Invite is disabled'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then raise exception 'Invite has expired'; end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then raise exception 'Invite has no uses remaining'; end if;

  v_department_id := coalesce(v_invite.department_id, p_department_id);
  if v_department_id is not null and not exists (
    select 1
    from public.class_departments
    where id = v_department_id
      and class_id = v_invite.class_id
  ) then
    raise exception 'Department is not part of this class';
  end if;

  update public.class_memberships
  set is_active = false
  where user_id = auth.uid();

  insert into public.class_memberships (class_id, user_id, department_id, role, is_active, status)
  values (v_invite.class_id, auth.uid(), v_department_id, v_invite.role_granted, true, 'active')
  on conflict (class_id, user_id) do update
    set department_id = coalesce(excluded.department_id, public.class_memberships.department_id),
        role = case
          when public.class_memberships.role = 'class_admin' then 'class_admin'
          else excluded.role
        end,
        status = 'active',
        is_active = true;

  update public.class_invites
  set use_count = use_count + 1
  where id = v_invite.id;

  insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
  values (v_invite.class_id, auth.uid(), auth.uid(), 'invite_accepted', jsonb_build_object('inviteId', v_invite.id));

  return v_invite.class_id;
end;
$$;

create or replace function public.approve_class_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.class_join_requests%rowtype;
begin
  select * into v_request
  from public.class_join_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Join request not found'; end if;
  if not public.is_current_enrollment_class(v_request.class_id) then
    raise exception 'This class is closed to new enrollment';
  end if;
  if not public.is_class_admin(v_request.class_id, auth.uid()) then
    raise exception 'Class admin role required';
  end if;

  update public.class_memberships
  set is_active = false
  where user_id = v_request.user_id;

  insert into public.class_memberships (class_id, user_id, department_id, role, is_active, status)
  values (v_request.class_id, v_request.user_id, v_request.department_id, 'cadet', true, 'active')
  on conflict (class_id, user_id) do update
    set department_id = excluded.department_id,
        status = 'active',
        is_active = true;

  update public.class_join_requests
  set status = 'approved',
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_request_id;

  insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
  values (v_request.class_id, auth.uid(), v_request.user_id, 'join_request_approved', jsonb_build_object('requestId', p_request_id));
end;
$$;

revoke all on function public.join_class_directly(uuid, uuid) from public, anon;
revoke all on function public.request_to_join_class(uuid, uuid, text) from public, anon;
revoke all on function public.accept_class_invite(text, uuid) from public, anon;
revoke all on function public.approve_class_join_request(uuid) from public, anon;
grant execute on function public.join_class_directly(uuid, uuid) to authenticated, service_role;
grant execute on function public.request_to_join_class(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.lookup_class_invite(text) to anon, authenticated;
grant execute on function public.accept_class_invite(text, uuid) to authenticated, service_role;
grant execute on function public.approve_class_join_request(uuid) to authenticated, service_role;

drop policy if exists leaderboard_read_all on public.leaderboard;
drop policy if exists leaderboard_read_active_class on public.leaderboard;
create policy leaderboard_read_active_class
on public.leaderboard
for select
to authenticated
using (
  public.is_owner((select auth.uid()))
  or class_id = public.get_active_class_id((select auth.uid()))
  or (
    class_id is null
    and exists (
      select 1
      from public.class_memberships cm
      join public.academy_classes c on c.id = cm.class_id
      where cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and cm.is_active
        and lower(trim(c.class_name)) = 'class 180'
    )
  )
);

drop policy if exists leaderboard_insert_self on public.leaderboard;
drop policy if exists leaderboard_update_self on public.leaderboard;
create policy leaderboard_insert_self
on public.leaderboard
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and class_id = public.get_active_class_id((select auth.uid()))
);
create policy leaderboard_update_self
on public.leaderboard
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and class_id = public.get_active_class_id((select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  and class_id = public.get_active_class_id((select auth.uid()))
);

drop policy if exists weekly_leaderboard_select_all on public.weekly_leaderboard;
drop policy if exists weekly_leaderboard_read_active_class on public.weekly_leaderboard;
create policy weekly_leaderboard_read_active_class
on public.weekly_leaderboard
for select
to authenticated
using (
  public.is_owner((select auth.uid()))
  or class_id = public.get_active_class_id((select auth.uid()))
  or (
    class_id is null
    and exists (
      select 1
      from public.class_memberships cm
      join public.academy_classes c on c.id = cm.class_id
      where cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and cm.is_active
        and lower(trim(c.class_name)) = 'class 180'
    )
  )
);

drop policy if exists weekly_leaderboard_insert_self on public.weekly_leaderboard;
drop policy if exists weekly_leaderboard_update_self on public.weekly_leaderboard;
create policy weekly_leaderboard_insert_self
on public.weekly_leaderboard
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and class_id = public.get_active_class_id((select auth.uid()))
);
create policy weekly_leaderboard_update_self
on public.weekly_leaderboard
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and class_id = public.get_active_class_id((select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  and class_id = public.get_active_class_id((select auth.uid()))
);

drop policy if exists duel_player_stats_read_authenticated on public.duel_player_stats;
drop policy if exists duel_player_stats_read_active_class on public.duel_player_stats;
create policy duel_player_stats_read_active_class
on public.duel_player_stats
for select
to authenticated
using (
  public.is_owner((select auth.uid()))
  or class_id = public.get_active_class_id((select auth.uid()))
  or (
    class_id is null
    and exists (
      select 1
      from public.class_memberships cm
      join public.academy_classes c on c.id = cm.class_id
      where cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and cm.is_active
        and lower(trim(c.class_name)) = 'class 180'
    )
  )
);

notify pgrst, 'reload schema';
