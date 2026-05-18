-- Make 1v1 Code Blaster misses apply negative tug pressure instead of a harmless zero-point miss.

create or replace function public.submit_1v1_round(
  p_room_id uuid,
  p_round integer,
  p_correct boolean,
  p_elapsed_ms integer,
  p_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_points integer;
  v_elapsed bigint;
  v_rounds integer;
  v_players_finished integer;
  v_total_players integer;
  v_results jsonb := '[]'::jsonb;
  v_row record;
  v_blaster_duration_seconds integer;
  v_blaster_rope_limit integer;
  v_blaster_win_condition text;
  v_score_gap integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'completed' then
    for v_row in
      select user_id, score, total_time_ms, fastest_round_ms, current_round, finished_at
      from public.room_players
      where room_id = p_room_id
      order by slot_no
    loop
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'user_id', v_row.user_id,
        'score', v_row.score,
        'total_time_ms', v_row.total_time_ms,
        'fastest_round_ms', v_row.fastest_round_ms,
        'current_round', v_row.current_round,
        'finished_at', v_row.finished_at
      ));
    end loop;

    return jsonb_build_object('room_id', p_room_id, 'status', v_room.status, 'winner_user_id', v_room.winner_user_id, 'players', v_results);
  end if;

  if v_room.status <> 'in_progress' then
    raise exception 'Room is not active';
  end if;

  if v_room.started_at is null or now() < v_room.started_at then
    raise exception 'Match countdown active';
  end if;

  if not exists (select 1 from public.room_players where room_id = p_room_id and user_id = v_uid) then
    raise exception 'Player not in room';
  end if;

  v_blaster_duration_seconds := greatest(15, least(coalesce((v_room.settings->>'blaster_duration_seconds')::integer, 30), 300));
  v_blaster_rope_limit := greatest(300, least(coalesce((v_room.settings->>'blaster_rope_limit')::integer, 900), 3000));
  v_blaster_win_condition := coalesce(nullif(v_room.settings->>'blaster_win_condition', ''), 'timed');

  if v_room.game_type = 'blaster'
    and v_blaster_win_condition <> 'death'
    and now() >= v_room.started_at + make_interval(secs => v_blaster_duration_seconds) then
    update public.room_players
    set current_round = greatest(current_round, coalesce(v_room.rounds, current_round) + 1),
        finished_at = coalesce(finished_at, now()),
        last_seen = now()
    where room_id = p_room_id;

    return public.finish_1v1_room_by_score(p_room_id);
  end if;

  if p_round is null or p_round < 1 then
    raise exception 'Invalid round';
  end if;

  v_rounds := greatest(1, coalesce(v_room.rounds, 1));
  v_elapsed := greatest(0, least(coalesce(p_elapsed_ms, 0), 300000));

  if v_room.game_type = 'blaster' and p_points is not null then
    v_points := case
      when p_correct then greatest(0, least(p_points, 1000))
      else least(0, greatest(p_points, -500))
    end;
  elsif v_room.game_type = 'matching' and p_correct and p_points is not null then
    v_points := greatest(0, least(p_points, 1000));
  else
    v_points := case when p_correct then 100 else 0 end;
  end if;

  update public.room_players
  set score = score + v_points,
      total_time_ms = total_time_ms + v_elapsed,
      fastest_round_ms = case
        when v_elapsed <= 0 then fastest_round_ms
        when fastest_round_ms <= 0 then v_elapsed
        else least(fastest_round_ms, v_elapsed)
      end,
      current_round = least(p_round + 1, v_rounds + 1),
      finished_at = case when p_round >= v_rounds then coalesce(finished_at, now()) else finished_at end,
      last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round = p_round;

  if not found then
    raise exception 'Round already submitted or player not in room';
  end if;

  if v_room.game_type = 'blaster' then
    select coalesce(max(score), 0) - coalesce(min(score), 0)
    into v_score_gap
    from public.room_players
    where room_id = p_room_id;

    if coalesce(v_score_gap, 0) >= v_blaster_rope_limit then
      update public.room_players
      set current_round = greatest(current_round, v_rounds + 1),
          finished_at = coalesce(finished_at, now()),
          last_seen = now()
      where room_id = p_room_id;

      return public.finish_1v1_room_by_score(p_room_id);
    end if;
  end if;

  select count(*)::int, count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 then
    return public.finish_1v1_room_by_score(p_room_id);
  end if;

  update public.rooms
  set current_round = greatest(current_round, least(p_round + 1, v_rounds)), updated_at = now()
  where id = p_room_id and status = 'in_progress';

  for v_row in
    select user_id, score, total_time_ms, fastest_round_ms, current_round, finished_at
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'user_id', v_row.user_id,
      'score', v_row.score,
      'total_time_ms', v_row.total_time_ms,
      'fastest_round_ms', v_row.fastest_round_ms,
      'current_round', v_row.current_round,
      'finished_at', v_row.finished_at
    ));
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id),
    'players', v_results
  );
end;
$$;

revoke all on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) from public, anon;
grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated, service_role;
