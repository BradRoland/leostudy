-- Start 1v1 waiting rooms in place instead of handing both players to a new room.
-- The old handoff path could leave one or both clients stuck on "Syncing with opponent"
-- while following the cancelled lobby room to the fresh in-progress room.

create or replace function public.set_1v1_ready(p_room_id uuid, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_ready_count integer := 0;
  v_player_count integer := 0;
  v_started_room_id uuid;
  v_status text;
  v_started_at timestamptz;
  v_publish_for_spectators boolean := false;
  v_rounds integer := 10;
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

  if v_room.status = 'completed' and v_room.rematch_room_id is not null then
    select count(*)::int
    into v_player_count
    from public.room_players
    where room_id = v_room.rematch_room_id;

    if v_player_count = 2 and exists (
      select 1
      from public.rooms r
      where r.id = v_room.rematch_room_id
        and r.status in ('waiting', 'in_progress')
    ) then
      select started_at
      into v_started_at
      from public.rooms
      where id = v_room.rematch_room_id;

      return jsonb_build_object(
        'status', 'in_progress',
        'ready_count', 2,
        'player_count', 2,
        'rematch_started', true,
        'room_id', v_room.rematch_room_id,
        'started_at', v_started_at
      );
    end if;

    update public.rooms
    set status = 'cancelled',
        ended_at = now(),
        updated_at = now()
    where id = v_room.rematch_room_id
      and status in ('waiting', 'in_progress');

    update public.rooms
    set rematch_room_id = null,
        updated_at = now()
    where id = p_room_id;

    update public.room_players
    set is_ready = false,
        last_seen = now()
    where room_id = p_room_id;

    select count(*)::int
    into v_player_count
    from public.room_players
    where room_id = p_room_id;

    return jsonb_build_object(
      'status', 'completed',
      'ready_count', 0,
      'player_count', v_player_count,
      'rematch_started', false,
      'rematch_cancelled', true,
      'room_id', p_room_id,
      'message', 'Opponent left the rematch. Rematch cancelled.'
    );
  end if;

  update public.room_players
  set is_ready = p_ready,
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

    v_started_at := now() + interval '2 seconds';
    v_rounds := case
      when v_room.game_type = 'matching' then 5
      else greatest(5, least(coalesce(v_room.rounds, 10), 50))
    end;

    delete from public.room_results
    where room_id = p_room_id;

    update public.room_players
    set is_ready = false,
        score = 0,
        total_time_ms = 0,
        fastest_round_ms = 0,
        current_round = 1,
        finished_at = null,
        last_seen = now()
    where room_id = p_room_id;

    update public.rooms
    set status = 'in_progress',
        started_at = v_started_at,
        current_round = 1,
        rounds = v_rounds,
        is_public = coalesce(v_room.is_public, false) or v_publish_for_spectators,
        join_code = case when coalesce(v_room.is_public, false) or v_publish_for_spectators then null else join_code end,
        ended_at = null,
        winner_user_id = null,
        rematch_room_id = null,
        updated_at = now()
    where id = p_room_id;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', false,
      'room_id', p_room_id,
      'started_at', v_started_at
    );
  end if;

  if v_room.status = 'completed' and v_player_count = 2 and v_ready_count = 2 then
    v_started_room_id := public.rematch_1v1_room(p_room_id, null);

    select started_at
    into v_started_at
    from public.rooms
    where id = v_started_room_id;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', true,
      'room_id', v_started_room_id,
      'started_at', v_started_at
    );
  end if;

  select status, started_at
  into v_status, v_started_at
  from public.rooms
  where id = p_room_id;

  return jsonb_build_object(
    'status', coalesce(v_status, v_room.status),
    'ready_count', v_ready_count,
    'player_count', v_player_count,
    'rematch_started', false,
    'room_id', p_room_id,
    'started_at', v_started_at
  );
end;
$$;

revoke all on function public.set_1v1_ready(uuid, boolean) from public, anon;
grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
