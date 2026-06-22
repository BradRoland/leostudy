-- Class department management for class admins and owner.
-- Lets class members choose only departments that belong to their active class.

create or replace function public.add_class_department(
  p_class_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_department_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_class_id is null or v_name = '' then
    raise exception 'Class and department name are required';
  end if;

  if not (public.is_owner(auth.uid()) or public.is_class_admin(p_class_id, auth.uid())) then
    raise exception 'Class admin role required';
  end if;

  insert into public.class_departments (class_id, name)
  values (p_class_id, v_name)
  on conflict (class_id, lower(name)) do update set name = excluded.name
  returning id into v_department_id;

  insert into public.class_audit_events (class_id, actor_user_id, event_type, metadata)
  values (p_class_id, auth.uid(), 'department_added', jsonb_build_object('departmentId', v_department_id, 'name', v_name));

  return v_department_id;
end;
$$;

create or replace function public.rename_class_department(
  p_department_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_class_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_department_id is null or v_name = '' then
    raise exception 'Department and name are required';
  end if;

  select class_id into v_class_id
  from public.class_departments
  where id = p_department_id;

  if v_class_id is null then
    raise exception 'Department not found';
  end if;

  if not (public.is_owner(auth.uid()) or public.is_class_admin(v_class_id, auth.uid())) then
    raise exception 'Class admin role required';
  end if;

  update public.class_departments
  set name = v_name
  where id = p_department_id;

  insert into public.class_audit_events (class_id, actor_user_id, event_type, metadata)
  values (v_class_id, auth.uid(), 'department_renamed', jsonb_build_object('departmentId', p_department_id, 'name', v_name));
end;
$$;

create or replace function public.delete_class_department(
  p_department_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_department_id is null then
    raise exception 'Department is required';
  end if;

  select class_id, name into v_class_id, v_name
  from public.class_departments
  where id = p_department_id;

  if v_class_id is null then
    raise exception 'Department not found';
  end if;

  if not (public.is_owner(auth.uid()) or public.is_class_admin(v_class_id, auth.uid())) then
    raise exception 'Class admin role required';
  end if;

  delete from public.class_departments
  where id = p_department_id;

  insert into public.class_audit_events (class_id, actor_user_id, event_type, metadata)
  values (v_class_id, auth.uid(), 'department_deleted', jsonb_build_object('departmentId', p_department_id, 'name', v_name));
end;
$$;

create or replace function public.update_own_class_department(
  p_class_id uuid,
  p_department_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_class_id is null or p_department_id is null then
    raise exception 'Class and department are required';
  end if;

  select name into v_department_name
  from public.class_departments
  where id = p_department_id
    and class_id = p_class_id;

  if v_department_name is null then
    raise exception 'Department does not belong to this class';
  end if;

  update public.class_memberships
  set department_id = p_department_id,
      updated_at = now()
  where class_id = p_class_id
    and user_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Active class membership not found';
  end if;

  insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
  values (p_class_id, auth.uid(), auth.uid(), 'member_department_updated', jsonb_build_object('departmentId', p_department_id, 'name', v_department_name));
end;
$$;

revoke all on function public.add_class_department(uuid, text) from public, anon;
grant execute on function public.add_class_department(uuid, text) to authenticated, service_role;
revoke all on function public.rename_class_department(uuid, text) from public, anon;
grant execute on function public.rename_class_department(uuid, text) to authenticated, service_role;
revoke all on function public.delete_class_department(uuid) from public, anon;
grant execute on function public.delete_class_department(uuid) to authenticated, service_role;
revoke all on function public.update_own_class_department(uuid, uuid) from public, anon;
grant execute on function public.update_own_class_department(uuid, uuid) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
