-- Harden 1v1 winner selection so exact ties become draws instead of favoring
-- the player who joined first. Also removes stale result rows from rooms that
-- were reset for rematch and are no longer completed.

alter table public.room_players
  add column if not exists fastest_round_ms bigint not null default 0;

delete from public.room_results rr
using public.rooms r
where rr.room_id = r.id
  and r.status <> 'completed';

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
  where id = p_room_id
  for update;

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

  if v_room.game_type = 'matching' and p_correct and p_points is not null then
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
    current_round = least(p_round + 1, v_rounds + 1),
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round = p_round;

  if not found then
    raise exception 'Round already submitted or player not in room';
  end if;

  select
    count(*)::int,
    count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 then
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
      order by rp.score desc, rp.total_time_ms asc, fastest_norm asc
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
      order by rp.score desc, rp.total_time_ms asc, fastest_norm asc
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

    delete from public.room_results where room_id = p_room_id;

    for v_row in
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        rp.fastest_round_ms,
        row_number() over (
          order by rp.score desc,
                   rp.total_time_ms asc,
                   case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end asc
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
      );
    end loop;

    update public.rooms
    set
      status = 'completed',
      winner_user_id = v_winner,
      ended_at = now(),
      current_round = v_rounds
    where id = p_room_id
      and status = 'in_progress';

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
notify pgrst, 'reload schema';
