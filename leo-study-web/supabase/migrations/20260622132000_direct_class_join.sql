-- Let signed-in cadets join a listed academy class immediately.
-- The older request/approval tables stay in place for historical rows, but onboarding no longer uses them.

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

revoke all on function public.join_class_directly(uuid, uuid) from public, anon;
grant execute on function public.join_class_directly(uuid, uuid) to authenticated;
