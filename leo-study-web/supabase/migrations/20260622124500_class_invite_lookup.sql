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
  left join public.class_departments d on d.id = v_invite.department_id and d.class_id = v_invite.class_id
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
  select * into v_invite from public.class_invites
  where token_hash = public.class_invite_hash(p_code)
  for update;
  if not found then raise exception 'Invite not found'; end if;
  if v_invite.disabled_at is not null then raise exception 'Invite is disabled'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then raise exception 'Invite has expired'; end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then raise exception 'Invite has no uses remaining'; end if;

  v_department_id := coalesce(v_invite.department_id, p_department_id);
  if v_department_id is not null and not exists (
    select 1
    from public.class_departments
    where id = v_department_id and class_id = v_invite.class_id
  ) then
    raise exception 'Department is not part of this class';
  end if;

  update public.class_memberships set is_active = false where user_id = auth.uid();
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
  update public.class_invites set use_count = use_count + 1 where id = v_invite.id;
  insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
  values (v_invite.class_id, auth.uid(), auth.uid(), 'invite_accepted', jsonb_build_object('inviteId', v_invite.id));
  return v_invite.class_id;
end;
$$;

grant execute on function public.lookup_class_invite(text) to anon, authenticated;
grant execute on function public.accept_class_invite(text, uuid) to authenticated;

notify pgrst, 'reload schema';
