-- Keep the Class 180 auto-membership helper compatible with the current
-- academy_classes.join_mode constraint introduced by class join settings.

create or replace function public.ensure_class_180_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_academy_id uuid;
  v_class_id uuid;
  v_department_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into public.academies (name, city, state)
  values ('Police Academy 180', '', 'CA')
  on conflict (lower(name), lower(city), lower(state)) do update set name = excluded.name
  returning id into v_academy_id;

  insert into public.academy_classes (academy_id, class_name, status, visibility, join_mode)
  values (v_academy_id, 'Class 180', 'active', 'listed', 'open')
  on conflict (academy_id, lower(class_name)) do update
    set status = 'active',
        visibility = 'listed',
        join_mode = case
          when public.academy_classes.join_mode in ('open', 'approval_required', 'code_only') then public.academy_classes.join_mode
          else 'open'
        end,
        updated_at = now()
  returning id into v_class_id;

  insert into public.class_departments (class_id, name, department_type)
  values (v_class_id, 'Unassigned', 'agency')
  on conflict (class_id, lower(name)) do update set name = excluded.name
  returning id into v_department_id;

  if exists (
    select 1
    from public.class_memberships
    where user_id = v_uid
      and status = 'active'
  ) then
    return (
      select class_id
      from public.class_memberships
      where user_id = v_uid
        and status = 'active'
      order by is_active desc, joined_at desc
      limit 1
    );
  end if;

  insert into public.class_memberships (class_id, user_id, department_id, role, is_active, status)
  values (v_class_id, v_uid, v_department_id, 'cadet', true, 'active')
  on conflict (class_id, user_id) do update
    set status = 'active',
        is_active = true,
        department_id = coalesce(public.class_memberships.department_id, excluded.department_id),
        updated_at = now();

  return v_class_id;
end;
$$;

revoke all on function public.ensure_class_180_membership() from public, anon;
grant execute on function public.ensure_class_180_membership() to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
