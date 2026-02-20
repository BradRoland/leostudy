-- Invite room locking + spectate gating:
-- 1) Invite-created rooms stay private while waiting (only invited users can join).
-- 2) Once both invited players ready and match starts, room becomes public for spectating.
-- 3) Spectate details are only visible for participants or public in-progress rooms.

create or replace function public.join_1v1_room(
  p_room_id uuid default null,
  p_join_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_slot integer;
  v_players integer;
  v_code text := trim(coalesce(p_join_code, ''));
  v_is_invite_room boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_room_id is not null then
    select * into v_room
    from public.rooms
    where id = p_room_id;
  elsif v_code <> '' then
    select * into v_room
    from public.rooms
    where join_code = v_code;
  else
    raise exception 'Room id or join code required';
  end if;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Room is not joinable';
  end if;

  if exists (
    select 1 from public.room_players rp
    where rp.room_id = v_room.id and rp.user_id = v_uid
  ) then
    return v_room.id;
  end if;

  if to_regclass('public.duel_invites') is not null then
    select exists (
      select 1
      from public.duel_invites di
      where di.room_id = v_room.id
    )
    into v_is_invite_room;
  end if;

  if v_is_invite_room then
    if not exists (
      select 1
      from public.duel_invites di
      where di.room_id = v_room.id
        and (di.sender_user_id = v_uid or di.recipient_user_id = v_uid)
    ) then
      raise exception 'This room is invite-only';
    end if;
  elsif not v_room.is_public and v_code = '' then
    raise exception 'Private rooms require a join code';
  end if;

  select count(*)::int into v_players
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_players >= 2 then
    raise exception 'Room is full';
  end if;

  if not exists (select 1 from public.room_players rp where rp.room_id = v_room.id and rp.slot_no = 1) then
    v_slot := 1;
  else
    v_slot := 2;
  end if;

  insert into public.room_players (room_id, user_id, slot_no, is_ready)
  values (v_room.id, v_uid, v_slot, false);

  return v_room.id;
end;
$$;

grant execute on function public.join_1v1_room(uuid, text) to authenticated;

create or replace function public.set_1v1_ready(
  p_room_id uuid,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_ready_count integer := 0;
  v_player_count integer := 0;
  v_started_room_id uuid;
  v_status text;
  v_publish_for_spectators boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  update public.room_players
  set
    is_ready = p_ready,
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid;

  if not found then
    raise exception 'Not in room';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  if v_room.status = 'waiting' and v_player_count = 2 and v_ready_count = 2 then
    if to_regclass('public.duel_invites') is not null then
      select exists (
        select 1
        from public.duel_invites di
        where di.room_id = p_room_id
      )
      into v_publish_for_spectators;
    end if;

    update public.rooms
    set
      status = 'in_progress',
      started_at = now(),
      current_round = 1,
      is_public = case when v_publish_for_spectators then true else is_public end
    where id = p_room_id
      and status = 'waiting';

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', v_ready_count,
      'player_count', v_player_count,
      'rematch_started', false,
      'room_id', p_room_id
    );
  end if;

  if v_room.status = 'completed' and v_player_count = 2 and v_ready_count = 2 then
    v_started_room_id := public.rematch_1v1_room(p_room_id, null);
    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', true,
      'room_id', v_started_room_id
    );
  end if;

  select status into v_status
  from public.rooms
  where id = p_room_id;

  return jsonb_build_object(
    'status', coalesce(v_status, v_room.status),
    'ready_count', v_ready_count,
    'player_count', v_player_count,
    'rematch_started', false,
    'room_id', p_room_id
  );
end;
$$;

grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;

create or replace function public.get_1v1_room_details(p_room_id uuid)
returns table (
  room jsonb,
  players jsonb,
  results jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_can_view boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null then
    return;
  end if;

  v_can_view := public.is_room_participant(v_room.id, v_uid)
    or (v_room.is_public = true and v_room.status = 'in_progress');

  if not v_can_view then
    raise exception 'Room is private';
  end if;

  return query
  select
    row_to_json(r)::jsonb as room,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', rp.id,
          'room_id', rp.room_id,
          'user_id', rp.user_id,
          'slot_no', rp.slot_no,
          'is_ready', rp.is_ready,
          'score', rp.score,
          'total_time_ms', rp.total_time_ms,
          'fastest_round_ms', rp.fastest_round_ms,
          'current_round', rp.current_round
        )
        order by rp.slot_no asc
      )
      from public.room_players rp
      where rp.room_id = r.id
    ), '[]'::jsonb) as players,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', rr.id,
          'room_id', rr.room_id,
          'user_id', rr.user_id,
          'score', rr.score,
          'total_time_ms', rr.total_time_ms,
          'placement', rr.placement,
          'is_winner', rr.is_winner
        )
        order by rr.placement asc, rr.score desc
      )
      from public.room_results rr
      where rr.room_id = r.id
    ), '[]'::jsonb) as results
  from public.rooms r
  where r.id = p_room_id;
end;
$$;

grant execute on function public.get_1v1_room_details(uuid) to authenticated;
