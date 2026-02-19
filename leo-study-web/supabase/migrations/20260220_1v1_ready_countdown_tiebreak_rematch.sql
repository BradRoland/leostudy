-- 1v1 quality-of-life updates:
-- - ready-gated countdown protection on submit
-- - explicit tie-break order: score -> total time -> fastest round -> draw
-- - rematch room creation with same two players

alter table public.room_players
  add column if not exists fastest_round_ms bigint not null default 0;

alter table public.rooms
  add column if not exists rematch_room_id uuid references public.rooms(id) on delete set null;

create index if not exists idx_rooms_rematch_room_id
  on public.rooms (rematch_room_id);

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
  v_winner uuid := null;
  v_results jsonb := '[]'::jsonb;
  v_row record;
  v_first record;
  v_second record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'completed' then
    for v_row in
      select user_id, score, total_time_ms, fastest_round_ms, current_round
      from public.room_players
      where room_id = p_room_id
      order by slot_no
    loop
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'user_id', v_row.user_id,
          'score', v_row.score,
          'total_time_ms', v_row.total_time_ms,
          'fastest_round_ms', v_row.fastest_round_ms,
          'current_round', v_row.current_round
        )
      );
    end loop;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id,
      'players', v_results
    );
  end if;

  if v_room.status <> 'in_progress' then
    raise exception 'Room is not active';
  end if;

  if v_room.started_at is null or now() < (v_room.started_at + interval '3 seconds') then
    raise exception 'Match countdown active';
  end if;

  if p_round is null or p_round < 1 then
    raise exception 'Invalid round';
  end if;

  v_rounds := greatest(1, coalesce(v_room.rounds, 1));
  v_elapsed := greatest(0, least(coalesce(p_elapsed_ms, 0), 300000));

  if v_room.game_type = 'matching' and p_points is not null then
    v_points := greatest(0, least(p_points, 1000));
  else
    v_points := case when p_correct then 100 else 0 end;
  end if;

  update public.room_players
  set
    score = score + v_points,
    total_time_ms = total_time_ms + v_elapsed,
    fastest_round_ms = case
      when v_elapsed <= 0 then fastest_round_ms
      when fastest_round_ms <= 0 then v_elapsed
      else least(fastest_round_ms, v_elapsed)
    end,
    current_round = greatest(current_round, least(p_round + 1, v_rounds + 1)),
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round <= p_round;

  if not found then
    raise exception 'Round already submitted or player not in room';
  end if;

  select
    count(*)::int,
    count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 and v_room.status <> 'completed' then
    select ranked.*
    into v_first
    from (
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
      from public.room_players rp
      where rp.room_id = p_room_id
      order by rp.score desc, rp.total_time_ms asc, fastest_norm asc, rp.joined_at asc
      limit 1
    ) ranked;

    select ranked.*
    into v_second
    from (
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
      from public.room_players rp
      where rp.room_id = p_room_id
      order by rp.score desc, rp.total_time_ms asc, fastest_norm asc, rp.joined_at asc
      offset 1
      limit 1
    ) ranked;

    if v_second.user_id is null then
      v_winner := v_first.user_id;
    elsif v_first.score <> v_second.score then
      v_winner := v_first.user_id;
    elsif v_first.total_time_ms <> v_second.total_time_ms then
      v_winner := v_first.user_id;
    elsif v_first.fastest_norm <> v_second.fastest_norm then
      v_winner := v_first.user_id;
    else
      v_winner := null;
    end if;

    for v_row in
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        rp.fastest_round_ms,
        row_number() over (
          order by rp.score desc,
                   rp.total_time_ms asc,
                   case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end asc,
                   rp.joined_at asc
        ) as rank_position
      from public.room_players rp
      where rp.room_id = p_room_id
      order by rank_position
    loop
      insert into public.room_results (
        room_id,
        user_id,
        score,
        total_time_ms,
        placement,
        is_winner
      ) values (
        p_room_id,
        v_row.user_id,
        v_row.score,
        v_row.total_time_ms,
        case when v_winner is null then 1 else v_row.rank_position end,
        (v_winner is not null and v_row.user_id = v_winner)
      )
      on conflict (room_id, user_id)
      do update set
        score = excluded.score,
        total_time_ms = excluded.total_time_ms,
        placement = excluded.placement,
        is_winner = excluded.is_winner,
        finished_at = now();
    end loop;

    update public.rooms
    set
      status = 'completed',
      winner_user_id = v_winner,
      ended_at = now(),
      current_round = v_rounds
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  else
    update public.rooms
    set current_round = greatest(current_round, least(p_round + 1, v_rounds))
    where id = p_room_id
      and status = 'in_progress';
  end if;

  v_results := '[]'::jsonb;
  for v_row in
    select user_id, score, total_time_ms, fastest_round_ms, current_round
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'user_id', v_row.user_id,
        'score', v_row.score,
        'total_time_ms', v_row.total_time_ms,
        'fastest_round_ms', v_row.fastest_round_ms,
        'current_round', v_row.current_round
      )
    );
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id),
    'players', v_results
  );
end;
$$;

grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;

drop function if exists public.rematch_1v1_room(uuid, text);
create or replace function public.rematch_1v1_room(
  p_room_id uuid,
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_source public.rooms%rowtype;
  v_existing public.rooms%rowtype;
  v_rematch_room_id uuid;
  v_category text;
  v_rounds integer;
  v_player_one uuid;
  v_player_two uuid;
  v_is_participant boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_source
  from public.rooms
  where id = p_room_id
  for update;

  if v_source.id is null then
    raise exception 'Room not found';
  end if;

  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = v_uid
  )
  into v_is_participant;

  if not v_is_participant then
    raise exception 'Only room participants can request a rematch';
  end if;

  if v_source.status <> 'completed' then
    raise exception 'Rematch is available only after match completion';
  end if;

  select rp.user_id
  into v_player_one
  from public.room_players rp
  where rp.room_id = p_room_id
  order by rp.slot_no asc
  limit 1;

  select rp.user_id
  into v_player_two
  from public.room_players rp
  where rp.room_id = p_room_id
  order by rp.slot_no asc
  offset 1
  limit 1;

  if v_player_one is null or v_player_two is null then
    raise exception 'Rematch requires exactly two players from the completed room';
  end if;

  v_category := lower(trim(coalesce(nullif(p_category, ''), v_source.category)));
  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_source.game_type = 'matching' and v_category = 'scenarios' then
    v_category := 'all';
  end if;

  v_rounds := case
    when v_source.game_type = 'matching' then 5
    else greatest(5, least(coalesce(v_source.rounds, 10), 50))
  end;

  if v_source.rematch_room_id is not null then
    select *
    into v_existing
    from public.rooms
    where id = v_source.rematch_room_id;

    -- If room exists and is in_progress, reset it to fresh state
    if v_existing.id is not null then
      -- Reset all player scores and state
      update public.room_players
      set is_ready = true,
          score = 0,
          total_time_ms = 0,
          fastest_round_ms = 0,
          current_round = 1,
          last_seen = now()
      where room_id = v_existing.id
        and user_id in (v_player_one, v_player_two);
      
      -- Reset room state
      update public.rooms
      set status = 'waiting',
          current_round = 1,
          winner_user_id = null,
          started_at = null,
          ended_at = null
      where id = v_existing.id;
      
      -- Return the fresh room (will trigger countdown on frontend)
      return v_existing.id;
    end if;

    if v_existing.id is not null and v_existing.status = 'waiting' and v_existing.category = v_category then
      delete from public.room_players
      where room_id = v_existing.id
        and user_id not in (v_player_one, v_player_two);

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
      ) values
      (v_existing.id, v_player_one, 1, true, 0, 0, 0, 1, now()),
      (v_existing.id, v_player_two, 2, true, 0, 0, 0, 1, now())
      on conflict (room_id, user_id)
      do update set
        slot_no = excluded.slot_no,
        is_ready = true,
        score = 0,
        total_time_ms = 0,
        fastest_round_ms = 0,
        current_round = 1,
        last_seen = now();

      update public.rooms
      set
        host_user_id = v_player_one,
        game_type = v_source.game_type,
        category = v_category,
        rounds = v_rounds,
        status = 'in_progress',
        current_round = 1,
        winner_user_id = null,
        started_at = now(),
        ended_at = null
      where id = v_existing.id;

      return v_existing.id;
    end if;

    if v_existing.id is not null and v_existing.status = 'waiting' then
      delete from public.rooms where id = v_existing.id;
    end if;
  end if;

  v_rematch_room_id := public.create_1v1_room(
    v_source.game_type,
    v_category,
    v_source.is_public,
    v_rounds
  );

  delete from public.room_players
  where room_id = v_rematch_room_id;

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
  ) values
  (v_rematch_room_id, v_player_one, 1, true, 0, 0, 0, 1, now()),
  (v_rematch_room_id, v_player_two, 2, true, 0, 0, 0, 1, now());

  update public.rooms
  set
    host_user_id = v_player_one,
    game_type = v_source.game_type,
    category = v_category,
    rounds = v_rounds,
    status = 'in_progress',
    current_round = 1,
    winner_user_id = null,
    started_at = now(),
    ended_at = null,
    rematch_room_id = null
  where id = v_rematch_room_id;

  update public.rooms
  set rematch_room_id = v_rematch_room_id
  where id = p_room_id;

  return v_rematch_room_id;
end;
$$;

grant execute on function public.rematch_1v1_room(uuid, text) to authenticated;
