-- Make 1v1 rematches use a brand-new room instead of mutating the completed room.
-- The completed room keeps its results, both players vote there, and once both agree
-- they are handed off to a fresh in_progress room with a shared future started_at.

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
  v_room public.rooms%rowtype;
  v_self public.room_players%rowtype;
  v_opponent public.room_players%rowtype;
  v_category text;
  v_rounds integer;
  v_ready_count integer := 0;
  v_player_count integer := 0;
  v_new_room_id uuid;
  v_start_at timestamptz := now() + interval '4 seconds';
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

  if v_room.rematch_room_id is not null then
    return v_room.rematch_room_id;
  end if;

  if v_room.status <> 'completed' then
    raise exception 'Rematch is available only after match completion';
  end if;

  select *
  into v_self
  from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  if v_self.id is null then
    raise exception 'Only room participants can request a rematch';
  end if;

  select *
  into v_opponent
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_uid
  order by slot_no
  limit 1;

  if v_opponent.id is null then
    raise exception 'Opponent has left this match';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count <> 2 then
    raise exception 'Rematch requires exactly two players';
  end if;

  if v_ready_count <> 2 then
    raise exception 'Both players must agree to rematch';
  end if;

  v_category := lower(trim(coalesce(nullif(p_category, ''), v_room.category)));
  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_room.game_type = 'matching' and v_category = 'scenarios' then
    v_category := 'all';
  end if;

  v_rounds := case
    when v_room.game_type = 'matching' then 5
    else greatest(5, least(coalesce(v_room.rounds, 10), 50))
  end;

  v_new_room_id := public.create_1v1_room(v_room.game_type, v_category, coalesce(v_room.is_public, false), v_rounds);

  update public.room_players
  set
    slot_no = v_self.slot_no,
    is_ready = false,
    score = 0,
    total_time_ms = 0,
    fastest_round_ms = 0,
    current_round = 1,
    last_seen = now()
  where room_id = v_new_room_id
    and user_id = v_uid;

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
  )
  values (
    v_new_room_id,
    v_opponent.user_id,
    v_opponent.slot_no,
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

  update public.rooms
  set
    status = 'in_progress',
    current_round = 1,
    started_at = v_start_at,
    ended_at = null,
    winner_user_id = null,
    join_code = case when coalesce(is_public, false) then null else join_code end,
    updated_at = now()
  where id = v_new_room_id;

  update public.room_players
  set is_ready = false,
      last_seen = now()
  where room_id = p_room_id;

  update public.rooms
  set rematch_room_id = v_new_room_id,
      updated_at = now()
  where id = p_room_id;

  return v_new_room_id;
end;
$$;

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
  v_started_at timestamptz;
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

  if v_room.status = 'completed' and v_room.rematch_room_id is not null then
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

    update public.rooms
    set
      status = 'in_progress',
      started_at = v_started_at,
      current_round = 1,
      is_public = case when v_publish_for_spectators then true else is_public end,
      join_code = case when v_publish_for_spectators then null else join_code end,
      updated_at = now()
    where id = p_room_id
      and status = 'waiting';

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', v_ready_count,
      'player_count', v_player_count,
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

do $$
declare
  v_function_sql text;
  v_updated_sql text;
begin
  if to_regprocedure('public.submit_1v1_round(uuid, integer, boolean, integer, integer)') is not null then
    v_function_sql := pg_get_functiondef('public.submit_1v1_round(uuid, integer, boolean, integer, integer)'::regprocedure);
    v_updated_sql := replace(
      v_function_sql,
      'if v_room.started_at is null or now() < (v_room.started_at + interval ''3 seconds'') then',
      'if v_room.started_at is null or now() < v_room.started_at then'
    );
    if v_updated_sql <> v_function_sql then
      execute v_updated_sql;
    end if;
  end if;
end $$;

grant execute on function public.rematch_1v1_room(uuid, text) to authenticated;
grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;
grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;

select pg_notify('pgrst', 'reload schema');
