alter table public.class_creation_requests
  add column if not exists requester_name text not null default '',
  add column if not exists requester_email text not null default '';

create or replace function public.request_class_creation(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_user_metadata jsonb := coalesce(auth.jwt()->'user_metadata', '{}'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.class_creation_requests (
    requester_user_id,
    requester_name,
    requester_email,
    academy_name,
    academy_city,
    academy_state,
    class_name,
    start_date,
    end_date,
    departments,
    requester_department,
    requester_note
  )
  values (
    auth.uid(),
    trim(coalesce(
      v_user_metadata->>'full_name',
      v_user_metadata->>'name',
      v_user_metadata->>'display_name',
      v_user_metadata->>'username',
      ''
    )),
    trim(coalesce(auth.jwt()->>'email', '')),
    trim(coalesce(p_payload->>'academyName', '')),
    trim(coalesce(p_payload->>'academyCity', '')),
    upper(trim(coalesce(p_payload->>'academyState', 'CA'))),
    trim(coalesce(p_payload->>'className', '')),
    nullif(p_payload->>'startDate', '')::date,
    nullif(p_payload->>'endDate', '')::date,
    coalesce(array(select distinct trim(value) from jsonb_array_elements_text(coalesce(p_payload->'departments', '[]'::jsonb)) as value where trim(value) <> ''), '{}'::text[]),
    trim(coalesce(p_payload->>'requesterDepartment', '')),
    trim(coalesce(p_payload->>'requesterNote', ''))
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.request_class_creation(jsonb) to authenticated;
