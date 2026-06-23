-- Owner-only class detail editing for the Settings admin panel.
-- This updates class metadata only; it does not touch memberships, scores, chat, or leaderboard rows.

create or replace function public.owner_update_class(
  p_class_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_name text := trim(coalesce(p_payload->>'className', ''));
  v_start_date date := nullif(p_payload->>'startDate', '')::date;
  v_end_date date := nullif(p_payload->>'endDate', '')::date;
  v_join_mode text := coalesce(nullif(p_payload->>'joinMode', ''), 'open');
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'active');
  v_visibility text := coalesce(nullif(p_payload->>'visibility', ''), 'listed');
begin
  if not public.is_owner(auth.uid()) then
    raise exception 'Owner role required';
  end if;
  if p_class_id is null then
    raise exception 'Class is required';
  end if;
  if v_class_name = '' then
    raise exception 'Class name is required';
  end if;
  if v_join_mode not in ('open', 'approval_required', 'code_only') then
    raise exception 'Unsupported join mode';
  end if;
  if v_status not in ('pending', 'active', 'completed', 'archived', 'rejected') then
    raise exception 'Unsupported class status';
  end if;
  if v_visibility not in ('listed', 'unlisted') then
    raise exception 'Unsupported class visibility';
  end if;

  update public.academy_classes
  set class_name = v_class_name,
      start_date = v_start_date,
      end_date = v_end_date,
      join_mode = v_join_mode,
      status = v_status,
      visibility = v_visibility,
      updated_at = now()
  where id = p_class_id;

  if not found then
    raise exception 'Class not found';
  end if;

  insert into public.class_departments (class_id, name, department_type)
  select p_class_id, department_name, 'agency'
  from (
    select distinct trim(value) as department_name
    from jsonb_array_elements_text(coalesce(p_payload->'departments', '[]'::jsonb)) as value
  ) departments
  where department_name <> ''
  on conflict (class_id, lower(name)) do update set name = excluded.name;

  insert into public.class_audit_events (class_id, actor_user_id, event_type, metadata)
  values (
    p_class_id,
    auth.uid(),
    'owner_update_class',
    jsonb_build_object(
      'className', v_class_name,
      'startDate', v_start_date,
      'endDate', v_end_date,
      'joinMode', v_join_mode,
      'status', v_status,
      'visibility', v_visibility
    )
  );
end;
$$;

revoke all on function public.owner_update_class(uuid, jsonb) from public, anon;
grant execute on function public.owner_update_class(uuid, jsonb) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
