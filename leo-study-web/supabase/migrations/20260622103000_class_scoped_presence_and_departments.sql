create or replace function public.list_class_member_departments(p_class_id uuid)
returns table (
  user_id uuid,
  department_id uuid,
  department_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_class_member(p_class_id, auth.uid()) then
    raise exception 'You are not a member of this class';
  end if;

  return query
  select
    cm.user_id,
    cm.department_id,
    coalesce(cd.name, '') as department_name
  from public.class_memberships cm
  left join public.class_departments cd on cd.id = cm.department_id
  where cm.class_id = p_class_id
    and cm.status = 'active';
end;
$$;

create or replace function public.list_online_class_users(
  p_class_id uuid,
  p_minutes_interval int default 5
)
returns table (
  user_id uuid,
  username text,
  avatar_path text,
  supporter_tier text,
  department_name text,
  last_active timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_minutes int := greatest(1, least(coalesce(p_minutes_interval, 5), 60));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_class_member(p_class_id, v_uid) then
    raise exception 'You are not a member of this class';
  end if;

  return query
  select
    p.user_id,
    p.username,
    p.avatar_path,
    p.supporter_tier,
    coalesce(cd.name, '') as department_name,
    p.last_active
  from public.class_memberships cm
  join public.profiles p on p.user_id = cm.user_id
  left join public.class_departments cd on cd.id = cm.department_id
  where cm.class_id = p_class_id
    and cm.status = 'active'
    and p.user_id <> v_uid
    and p.last_active is not null
    and p.last_active > now() - (v_minutes::text || ' minutes')::interval
    and not public.is_user_banned(p.user_id)
  order by p.last_active desc, p.username asc;
end;
$$;

create or replace function public.get_online_class_users_count(
  p_class_id uuid,
  p_minutes_interval int default 5
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_minutes int := greatest(1, least(coalesce(p_minutes_interval, 5), 60));
  v_count int := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_class_member(p_class_id, v_uid) then
    raise exception 'You are not a member of this class';
  end if;

  select count(*)::int into v_count
  from public.class_memberships cm
  join public.profiles p on p.user_id = cm.user_id
  where cm.class_id = p_class_id
    and cm.status = 'active'
    and p.last_active is not null
    and p.last_active > now() - (v_minutes::text || ' minutes')::interval
    and not public.is_user_banned(p.user_id);

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.list_class_member_departments(uuid) to authenticated;
grant execute on function public.list_online_class_users(uuid, int) to authenticated;
grant execute on function public.get_online_class_users_count(uuid, int) to authenticated;
