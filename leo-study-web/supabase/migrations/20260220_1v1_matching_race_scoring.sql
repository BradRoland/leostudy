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
  v_elapsed integer;
  v_rounds integer;
  v_players_finished integer;
  v_total_players integer;
  v_winner uuid;
  v_results jsonb := '[]'::jsonb;
  v_row record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'Room not found';
  end if;
  if v_room.status not in ('in_progress', 'completed') then
    raise exception 'Room is not active';
  end if;

  v_rounds := v_room.rounds;
  v_elapsed := greatest(0, least(coalesce(p_elapsed_ms, 0), 300000));

  if v_room.game_type = 'quiz' then
    v_points := case when p_correct then 100 else 0 end;
  else
    v_points := case when p_correct then 100 else 0 end;
  end if;

  update public.room_players
  set
    score = score + v_points,
    total_time_ms = total_time_ms + v_elapsed,
    current_round = greatest(current_round, least(p_round + 1, v_rounds + 1)),
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round <= p_round;

  select count(*)::int,
         count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 and v_room.status <> 'completed' then
    select rp.user_id
    into v_winner
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, rp.total_time_ms asc, rp.joined_at asc
    limit 1;

    for v_row in
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        row_number() over (order by rp.score desc, rp.total_time_ms asc, rp.joined_at asc) as placement
      from public.room_players rp
      where rp.room_id = p_room_id
      order by placement
    loop
      insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
      values (p_room_id, v_row.user_id, v_row.score, v_row.total_time_ms, v_row.placement, v_row.user_id = v_winner)
      on conflict (room_id, user_id)
      do update set
        score = excluded.score,
        total_time_ms = excluded.total_time_ms,
        placement = excluded.placement,
        is_winner = excluded.is_winner,
        finished_at = now();
    end loop;

    update public.rooms
    set status = 'completed',
        winner_user_id = v_winner,
        ended_at = now(),
        current_round = v_rounds
    where id = p_room_id;
  else
    update public.rooms
    set current_round = greatest(current_round, least(p_round + 1, v_rounds))
    where id = p_room_id
      and status = 'in_progress';
  end if;

  for v_row in
    select user_id, score, total_time_ms, current_round
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'user_id', v_row.user_id,
        'score', v_row.score,
        'total_time_ms', v_row.total_time_ms,
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
