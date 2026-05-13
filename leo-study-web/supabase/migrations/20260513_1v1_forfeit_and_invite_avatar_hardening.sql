-- Harden 1v1 starts and forfeits:
-- - keep per-player finish timestamps available to the app
-- - prevent stale timers or very early broken starts from recording fake 0-0 wins
-- - return finished_at in 1v1 snapshots so clients stay in sync

alter table public.room_players
  add column if not exists fastest_round_ms bigint not null default 0,
  add column if not exists finished_at timestamptz;

create or replace function public.finish_1v1_room_by_score(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_winner uuid := null;
  v_results jsonb := '[]'::jsonb;
  v_row record;
  v_first record;
  v_second record;
begin
  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select ranked.* into v_first
  from (
    select
      rp.user_id,
      rp.score,
      rp.total_time_ms,
      coalesce(rp.finished_at, rp.last_seen, 'infinity'::timestamptz) as finish_norm,
      case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, finish_norm asc, rp.total_time_ms asc, fastest_norm asc
    limit 1
  ) ranked;

  select ranked.* into v_second
  from (
    select
      rp.user_id,
      rp.score,
      rp.total_time_ms,
      coalesce(rp.finished_at, rp.last_seen, 'infinity'::timestamptz) as finish_norm,
      case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, finish_norm asc, rp.total_time_ms asc, fastest_norm asc
    offset 1
    limit 1
  ) ranked;

  if v_first.user_id is null then
    raise exception 'No players found';
  elsif v_second.user_id is null then
    v_winner := v_first.user_id;
  elsif v_first.score <> v_second.score then
    v_winner := v_first.user_id;
  elsif v_first.finish_norm is distinct from v_second.finish_norm then
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
      rp.finished_at,
      row_number() over (
        order by rp.score desc,
                 coalesce(rp.finished_at, rp.last_seen, 'infinity'::timestamptz) asc,
                 rp.total_time_ms asc,
                 case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end asc
      ) as rank_position
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rank_position
  loop
    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (
      p_room_id,
      v_row.user_id,
      v_row.score,
      v_row.total_time_ms,
      case when v_winner is null then 1 else v_row.rank_position end,
      (v_winner is not null and v_row.user_id = v_winner)
    );
  end loop;

  update public.rooms
  set status = 'completed',
      winner_user_id = v_winner,
      ended_at = coalesce(ended_at, now()),
      current_round = coalesce(rounds, current_round),
      updated_at = now()
  where id = p_room_id;

  update public.room_players
  set is_ready = false
  where room_id = p_room_id;

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
    'status', 'completed',
    'winner_user_id', v_winner,
    'players', v_results
  );
end;
$$;

revoke all on function public.finish_1v1_room_by_score(uuid) from public, anon, authenticated;

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
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

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

  if v_room.started_at is null or now() < v_room.started_at then
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
    finished_at = case
      when p_round >= v_rounds then coalesce(finished_at, now())
      else finished_at
    end,
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round = p_round;

  if not found then
    raise exception 'Round already submitted or player not in room';
  end if;

  select count(*)::int,
         count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 then
    return public.finish_1v1_room_by_score(p_room_id);
  end if;

  update public.rooms
  set current_round = greatest(current_round, least(p_round + 1, v_rounds)),
      updated_at = now()
  where id = p_room_id
    and status = 'in_progress';

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

grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;

create or replace function public.forfeit_1v1_match(
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
  v_self public.room_players%rowtype;
  v_opponent public.room_players%rowtype;
  v_remaining_players integer := 0;
  v_players_finished integer := 0;
  v_total_players integer := 0;
  v_no_answers boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select * into v_self
  from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  if v_self.id is null then
    raise exception 'Not in room';
  end if;

  if v_room.status = 'waiting' then
    delete from public.room_players
    where room_id = p_room_id
      and user_id = v_uid;

    select count(*)::int into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    if v_remaining_players = 0 then
      update public.rooms
      set status = 'cancelled', ended_at = now(), updated_at = now()
      where id = p_room_id;
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', (select status from public.rooms where id = p_room_id),
      'winner_user_id', null
    );
  end if;

  if v_room.status <> 'in_progress' then
    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id
    );
  end if;

  select count(*)::int,
         count(*) filter (where current_round > greatest(1, coalesce(v_room.rounds, 1)))::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_self.current_round > greatest(1, coalesce(v_room.rounds, 1)) then
    if v_total_players = 2 and v_players_finished = 2 then
      return public.finish_1v1_room_by_score(p_room_id);
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id,
      'ignored', true,
      'reason', 'player_already_finished'
    );
  end if;

  select not exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and (
        rp.current_round > 1
        or rp.score <> 0
        or rp.total_time_ms <> 0
        or rp.fastest_round_ms <> 0
      )
  ) into v_no_answers;

  if v_room.started_at is not null
    and now() < v_room.started_at + interval '10 seconds'
    and v_no_answers
  then
    update public.rooms
    set status = 'cancelled',
        winner_user_id = null,
        ended_at = now(),
        current_round = 1,
        updated_at = now()
    where id = p_room_id;

    update public.room_players
    set is_ready = false,
        last_seen = now()
    where room_id = p_room_id;

    delete from public.room_results where room_id = p_room_id;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', 'cancelled',
      'winner_user_id', null,
      'ignored', true,
      'reason', 'early_no_answers'
    );
  end if;

  select * into v_opponent
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_uid
  order by slot_no
  limit 1;

  update public.room_players
  set current_round = greatest(current_round, v_room.rounds + 1),
      finished_at = coalesce(finished_at, now()),
      last_seen = now()
  where id = v_self.id;

  if v_opponent.id is not null then
    update public.room_players
    set current_round = greatest(current_round, v_room.rounds + 1),
        finished_at = coalesce(finished_at, now()),
        last_seen = now()
    where id = v_opponent.id;

    delete from public.room_results where room_id = p_room_id;

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_opponent.user_id, v_opponent.score, v_opponent.total_time_ms, 1, true);

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_self.user_id, v_self.score, v_self.total_time_ms, 2, false);

    update public.rooms
    set status = 'completed',
        winner_user_id = v_opponent.user_id,
        ended_at = now(),
        current_round = v_room.rounds,
        updated_at = now()
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  else
    update public.rooms
    set status = 'cancelled',
        ended_at = now(),
        current_round = v_room.rounds,
        updated_at = now()
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id)
  );
end;
$$;

grant execute on function public.forfeit_1v1_match(uuid) to authenticated;

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
begin
  return query
  select
    row_to_json(r)::jsonb as room,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rp.id,
        'room_id', rp.room_id,
        'user_id', rp.user_id,
        'slot_no', rp.slot_no,
        'is_ready', rp.is_ready,
        'score', rp.score,
        'total_time_ms', rp.total_time_ms,
        'fastest_round_ms', rp.fastest_round_ms,
        'current_round', rp.current_round,
        'last_seen', rp.last_seen,
        'finished_at', rp.finished_at
      ) order by rp.slot_no asc)
      from public.room_players rp
      where rp.room_id = r.id
    ), '[]'::jsonb) as players,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rr.id,
        'room_id', rr.room_id,
        'user_id', rr.user_id,
        'score', rr.score,
        'total_time_ms', rr.total_time_ms,
        'placement', rr.placement,
        'is_winner', rr.is_winner
      ) order by rr.placement asc, rr.score desc)
      from public.room_results rr
      where rr.room_id = r.id
    ), '[]'::jsonb) as results
  from public.rooms r
  where r.id = p_room_id;
end;
$$;

grant execute on function public.get_1v1_room_details(uuid) to authenticated;

with broken_rooms as (
  select r.id
  from public.rooms r
  where r.status = 'completed'
    and r.started_at is not null
    and r.ended_at is not null
    and r.ended_at < r.started_at + interval '10 seconds'
    and exists (
      select 1
      from public.room_players rp
      where rp.room_id = r.id
      group by rp.room_id
      having count(*) = 2
        and bool_and(rp.score = 0)
        and bool_and(rp.total_time_ms = 0)
        and bool_and(rp.current_round > r.rounds)
    )
)
delete from public.room_results rr
using broken_rooms br
where rr.room_id = br.id;

with broken_rooms as (
  select r.id
  from public.rooms r
  where r.status = 'completed'
    and r.started_at is not null
    and r.ended_at is not null
    and r.ended_at < r.started_at + interval '10 seconds'
    and exists (
      select 1
      from public.room_players rp
      where rp.room_id = r.id
      group by rp.room_id
      having count(*) = 2
        and bool_and(rp.score = 0)
        and bool_and(rp.total_time_ms = 0)
        and bool_and(rp.current_round > r.rounds)
    )
)
update public.rooms r
set status = 'cancelled',
    winner_user_id = null,
    current_round = 1,
    updated_at = now()
from broken_rooms br
where r.id = br.id;

notify pgrst, 'reload schema';
