-- 1v1 room lifecycle controls:
-- - remove inactive waiting rooms after 5 minutes
-- - allow users to leave waiting/completed rooms cleanly
-- - allow host (or owner) to delete rooms

create or replace function public.cleanup_inactive_1v1_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  with stale_rooms as (
    select r.id
    from public.rooms r
    where (
      r.status = 'waiting'
      and r.created_at <= now() - interval '5 minutes'
      and not exists (
        select 1
        from public.room_players rp
        where rp.room_id = r.id
          and rp.last_seen >= now() - interval '5 minutes'
      )
    ) or (
      r.status in ('completed', 'cancelled')
      and coalesce(r.ended_at, r.updated_at, r.created_at) <= now() - interval '5 minutes'
      and r.rematch_room_id is null
    )
  )
  delete from public.rooms r
  using stale_rooms s
  where r.id = s.id;

  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
end;
$$;

grant execute on function public.cleanup_inactive_1v1_rooms() to authenticated;

drop function if exists public.list_public_1v1_rooms();
create or replace function public.list_public_1v1_rooms()
returns table (
  id uuid,
  game_type text,
  category text,
  rounds integer,
  created_at timestamptz,
  host_user_id uuid,
  player_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_inactive_1v1_rooms();

  return query
  select
    r.id,
    r.game_type,
    r.category,
    r.rounds,
    r.created_at,
    r.host_user_id,
    count(rp.id)::int as player_count
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  where r.is_public = true
    and r.status = 'waiting'
  group by r.id
  having count(rp.id) < 2
  order by r.created_at desc
  limit 50;
end;
$$;

grant execute on function public.list_public_1v1_rooms() to authenticated;

create or replace function public.leave_1v1_room(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_remaining_players integer := 0;
  v_next_host uuid := null;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'in_progress' then
    raise exception 'Cannot leave an active match. Use forfeit instead.';
  end if;

  if v_room.status in ('completed', 'cancelled') then
    delete from public.room_players
    where room_id = p_room_id
      and user_id = v_uid;

    if not found then
      raise exception 'Not in room';
    end if;

    select count(*)::int
    into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    if v_remaining_players <= 0 then
      delete from public.rooms
      where id = p_room_id;

      return jsonb_build_object(
        'room_id', p_room_id,
        'status', 'deleted',
        'player_count', 0,
        'deleted', true
      );
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'player_count', v_remaining_players,
      'deleted', false
    );
  end if;

  delete from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  if not found then
    select count(*)::int
    into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', coalesce(v_room.status, 'waiting'),
      'player_count', v_remaining_players
    );
  end if;

  select count(*)::int
  into v_remaining_players
  from public.room_players
  where room_id = p_room_id;

  if v_remaining_players <= 0 then
    delete from public.rooms
    where id = p_room_id;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', 'deleted',
      'player_count', 0,
      'deleted', true
    );
  end if;

  select rp.user_id
  into v_next_host
  from public.room_players rp
  where rp.room_id = p_room_id
  order by rp.slot_no asc
  limit 1;

  update public.rooms
  set host_user_id = coalesce(v_next_host, host_user_id),
      status = 'waiting',
      current_round = 1,
      started_at = null,
      winner_user_id = null,
      ended_at = null,
      rematch_room_id = null
  where id = p_room_id;

  update public.room_players
  set is_ready = false
  where room_id = p_room_id;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', 'waiting',
    'player_count', v_remaining_players
  );
end;
$$;

grant execute on function public.leave_1v1_room(uuid) to authenticated;

create or replace function public.delete_1v1_room(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_is_owner boolean := false;
  v_is_participant boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select exists(
    select 1
    from public.user_roles r
    where r.user_id = v_uid
      and r.role = 'owner'
  ) into v_is_owner;

  select exists(
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = v_uid
  ) into v_is_participant;

  if v_room.status in ('completed', 'cancelled') then
    if not v_is_owner and not v_is_participant and v_room.host_user_id <> v_uid then
      raise exception 'Only room participants, host, or owner can delete completed rooms';
    end if;
  else
    if not v_is_owner and v_room.host_user_id <> v_uid then
      raise exception 'Only host or owner can delete this room';
    end if;

    if v_room.status = 'in_progress' and not v_is_owner then
      raise exception 'Host cannot delete an active room';
    end if;
  end if;

  delete from public.rooms
  where id = p_room_id;

  return jsonb_build_object(
    'room_id', p_room_id,
    'deleted', true
  );
end;
$$;

grant execute on function public.delete_1v1_room(uuid) to authenticated;
