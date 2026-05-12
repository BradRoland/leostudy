-- Harden 1v1 room reuse:
-- 1) Leaving a completed/cancelled room no longer reopens it as a waiting lobby.
-- 2) Starting a waiting room always hands both players into a fresh in-progress room,
--    which regenerates question_set and resets player progress/answers.

create or replace function public.leave_1v1_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_remaining_players integer := 0;
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

  if v_room.status = 'in_progress' then
    raise exception 'Cannot leave an active match. Use forfeit instead.';
  end if;

  delete from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  select count(*)::int
  into v_remaining_players
  from public.room_players
  where room_id = p_room_id;

  if v_room.status = 'waiting' then
    if v_remaining_players = 0 then
      update public.rooms
      set status = 'cancelled',
          current_round = 1,
          started_at = null,
          winner_user_id = null,
          ended_at = now(),
          rematch_room_id = null,
          updated_at = now()
      where id = p_room_id;

      if to_regclass('public.duel_invites') is not null then
        update public.duel_invites
        set status = 'cancelled',
            responded_at = now()
        where room_id = p_room_id
          and status = 'pending';
      end if;

      return jsonb_build_object(
        'room_id', p_room_id,
        'status', 'cancelled',
        'player_count', 0
      );
    end if;

    update public.room_players
    set is_ready = false,
        score = 0,
        total_time_ms = 0,
        fastest_round_ms = 0,
        current_round = 1,
        last_seen = now()
    where room_id = p_room_id;

    update public.rooms
    set status = 'waiting',
        current_round = 1,
        started_at = null,
        winner_user_id = null,
        ended_at = null,
        updated_at = now()
    where id = p_room_id;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', 'waiting',
      'player_count', v_remaining_players
    );
  end if;

  -- Completed/cancelled rooms must stay closed. Previously this reopened old
  -- matches as waiting rooms, which reused old questions and stale player rounds.
  update public.room_players
  set is_ready = false,
      last_seen = now()
  where room_id = p_room_id;

  update public.rooms
  set rematch_room_id = null,
      updated_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', v_room.status,
    'player_count', v_remaining_players,
    'message', case when v_remaining_players < 2 then 'Opponent left the lobby. Rematch cancelled.' else null end
  );
end;
$$;

grant execute on function public.leave_1v1_room(uuid) to authenticated;

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
  v_player record;
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

    v_started_at := now() + interval '4 seconds';
    v_rounds := case
      when v_room.game_type = 'matching' then 5
      else greatest(5, least(coalesce(v_room.rounds, 10), 50))
    end;

    -- Build a brand-new room/question_set for every start. This prevents stale
    -- completed/rematch lobbies from reusing old questions or answered rounds.
    v_started_room_id := public.create_1v1_room(
      v_room.game_type,
      v_room.category,
      coalesce(v_room.is_public, false) or v_publish_for_spectators,
      v_rounds
    );

    delete from public.room_players
    where room_id = v_started_room_id;

    for v_player in
      select user_id, slot_no
      from public.room_players
      where room_id = p_room_id
      order by slot_no
    loop
      insert into public.room_players (
        room_id,
        user_id,
        slot_no,
        is_ready,
        score,
        total_time_ms,
        fastest_round_ms,
        current_round,
        last_seen
      ) values (
        v_started_room_id,
        v_player.user_id,
        v_player.slot_no,
        false,
        0,
        0,
        0,
        1,
        now()
      )
      on conflict (room_id, user_id)
      do update set
        slot_no = excluded.slot_no,
        is_ready = false,
        score = 0,
        total_time_ms = 0,
        fastest_round_ms = 0,
        current_round = 1,
        last_seen = now();
    end loop;

    update public.rooms
    set status = 'in_progress',
        started_at = v_started_at,
        current_round = 1,
        is_public = coalesce(v_room.is_public, false) or v_publish_for_spectators,
        join_code = case when coalesce(v_room.is_public, false) or v_publish_for_spectators then null else join_code end,
        ended_at = null,
        winner_user_id = null,
        updated_at = now()
    where id = v_started_room_id;

    update public.room_players
    set is_ready = false,
        last_seen = now()
    where room_id = p_room_id;

    update public.rooms
    set status = 'cancelled',
        rematch_room_id = v_started_room_id,
        ended_at = now(),
        updated_at = now()
    where id = p_room_id;

    if to_regclass('public.duel_invites') is not null then
      update public.duel_invites
      set room_id = v_started_room_id
      where room_id = p_room_id
        and status in ('pending', 'accepted');
    end if;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', false,
      'room_id', v_started_room_id,
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

grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;

-- Clean currently reopened stale rooms caused by the old leave behavior.
update public.rooms r
set status = 'cancelled',
    ended_at = coalesce(r.ended_at, now()),
    rematch_room_id = null,
    updated_at = now()
where r.status = 'waiting'
  and exists (
    select 1
    from public.room_players rp
    where rp.room_id = r.id
      and (
        rp.current_round > 1
        or rp.score > 0
        or rp.total_time_ms > 0
        or rp.fastest_round_ms > 0
      )
  );

update public.room_players rp
set is_ready = false,
    last_seen = now()
where exists (
  select 1
  from public.rooms r
  where r.id = rp.room_id
    and r.status in ('cancelled', 'completed')
);

select pg_notify('pgrst', 'reload schema');
