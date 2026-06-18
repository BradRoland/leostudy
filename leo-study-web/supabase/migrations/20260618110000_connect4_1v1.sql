-- Add enabled-by-default Connect 4 to the existing 1v1 room system.

alter table public.app_settings
  add column if not exists connect4_enabled boolean not null default true;

insert into public.app_settings (id, connect4_enabled, updated_at)
values ('global', true, now())
on conflict (id)
do update set
  connect4_enabled = true,
  updated_at = now();

alter table public.rooms drop constraint if exists rooms_game_type_check;
alter table public.rooms
  add constraint rooms_game_type_check check (game_type in ('quiz', 'matching', 'blaster', 'connect4'));

alter table public.duel_invites drop constraint if exists duel_invites_game_type_check;
alter table public.duel_invites
  add constraint duel_invites_game_type_check check (game_type in ('quiz', 'matching', 'blaster', 'connect4'));

alter table public.duel_player_stats drop constraint if exists duel_player_stats_game_type_check;
alter table public.duel_player_stats
  add constraint duel_player_stats_game_type_check check (game_type in ('all', 'quiz', 'matching', 'blaster', 'connect4'));

create or replace function public.default_connect4_state()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'board', jsonb_build_array(
      jsonb_build_array(null, null, null, null, null, null, null),
      jsonb_build_array(null, null, null, null, null, null, null),
      jsonb_build_array(null, null, null, null, null, null, null),
      jsonb_build_array(null, null, null, null, null, null, null),
      jsonb_build_array(null, null, null, null, null, null, null),
      jsonb_build_array(null, null, null, null, null, null, null)
    ),
    'currentTurn', 'P1',
    'winner', null,
    'winnerUserId', null,
    'draw', false,
    'status', 'active',
    'moveHistory', '[]'::jsonb
  );
$$;

create or replace function public.connect4_feature_enabled()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select app_settings.connect4_enabled from public.app_settings where id = 'global'),
    true
  );
$$;

create or replace function public.create_1v1_room_v2(
  p_game_type text,
  p_category text,
  p_is_public boolean default true,
  p_rounds integer default 10,
  p_powerups_enabled boolean default false,
  p_blaster_duration_seconds integer default 30,
  p_blaster_sudden_death boolean default false,
  p_blaster_rope_limit integer default 900,
  p_blaster_overtime_enabled boolean default true,
  p_blaster_overtime_after_seconds integer default 45
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_game_type text := lower(trim(coalesce(p_game_type, '')));
  v_category text := lower(trim(coalesce(p_category, 'all')));
  v_join_code text;
  v_overtime_after_seconds integer := greatest(45, least(coalesce(p_blaster_overtime_after_seconds, 45), 90));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_game_type = 'connect4' then
    if not public.connect4_feature_enabled() then
      raise exception 'Connect 4 is disabled';
    end if;

    v_join_code := case when coalesce(p_is_public, true) then null else public.generate_room_join_code() end;

    insert into public.rooms (
      host_user_id,
      game_type,
      category,
      is_public,
      join_code,
      rounds,
      question_set,
      settings,
      status,
      current_round
    ) values (
      v_uid,
      'connect4',
      'all',
      coalesce(p_is_public, true),
      v_join_code,
      42,
      '[]'::jsonb,
      jsonb_build_object('connect4', public.default_connect4_state()),
      'waiting',
      1
    ) returning id into v_room_id;

    insert into public.room_players (room_id, user_id, slot_no, is_ready)
    values (v_room_id, v_uid, 1, false);

    return v_room_id;
  end if;

  v_room_id := public.create_1v1_room(
    p_game_type,
    p_category,
    p_is_public,
    p_rounds,
    p_powerups_enabled,
    p_blaster_duration_seconds,
    p_blaster_sudden_death,
    p_blaster_rope_limit
  );

  if v_game_type = 'blaster' then
    update public.rooms
    set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'blaster_overtime_enabled', coalesce(p_blaster_overtime_enabled, true),
      'blaster_overtime_after_seconds', v_overtime_after_seconds
    )
    where id = v_room_id;
  end if;

  return v_room_id;
end;
$$;

revoke all on function public.create_1v1_room_v2(text, text, boolean, integer, boolean, integer, boolean, integer, boolean, integer) from public, anon;
grant execute on function public.create_1v1_room_v2(text, text, boolean, integer, boolean, integer, boolean, integer, boolean, integer) to authenticated, service_role;

create or replace function public.create_1v1_invite_v2(
  p_target_user_id uuid,
  p_game_type text,
  p_category text,
  p_rounds integer default 10,
  p_powerups_enabled boolean default false,
  p_blaster_duration_seconds integer default 30,
  p_blaster_sudden_death boolean default false,
  p_blaster_rope_limit integer default 900,
  p_blaster_overtime_enabled boolean default true,
  p_blaster_overtime_after_seconds integer default 45
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_room_id uuid;
  v_invite_id uuid;
  v_target_online boolean := false;
  v_game_type text := lower(trim(coalesce(p_game_type, '')));
  v_category text := lower(trim(coalesce(p_category, 'all')));
  v_overtime_after_seconds integer := greatest(45, least(coalesce(p_blaster_overtime_after_seconds, 45), 90));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid invite target';
  end if;

  if v_game_type = 'connect4' then
    if not public.connect4_feature_enabled() then
      raise exception 'Connect 4 is disabled';
    end if;

    select exists (
      select 1
      from public.profiles p
      where p.user_id = p_target_user_id
        and p.last_active is not null
        and p.last_active > now() - interval '5 minutes'
    ) into v_target_online;

    if not v_target_online then
      raise exception 'User is not currently online';
    end if;

    update public.duel_invites
    set status = 'cancelled', responded_at = now()
    where sender_user_id = v_uid
      and recipient_user_id = p_target_user_id
      and status = 'pending';

    v_room_id := public.create_1v1_room_v2('connect4', 'all', false, 42);

    insert into public.duel_invites (sender_user_id, recipient_user_id, room_id, game_type, category, rounds, status, expires_at)
    values (v_uid, p_target_user_id, v_room_id, 'connect4', 'all', 42, 'pending', now() + interval '5 minutes')
    returning id into v_invite_id;

    return jsonb_build_object('invite_id', v_invite_id, 'room_id', v_room_id, 'status', 'pending');
  end if;

  v_result := public.create_1v1_invite(
    p_target_user_id,
    p_game_type,
    p_category,
    p_rounds,
    p_powerups_enabled,
    p_blaster_duration_seconds,
    p_blaster_sudden_death,
    p_blaster_rope_limit
  );

  if v_game_type = 'blaster' then
    v_room_id := nullif(v_result->>'room_id', '')::uuid;
    update public.rooms
    set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'blaster_overtime_enabled', coalesce(p_blaster_overtime_enabled, true),
      'blaster_overtime_after_seconds', v_overtime_after_seconds
    )
    where id = v_room_id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.create_1v1_invite_v2(uuid, text, text, integer, boolean, integer, boolean, integer, boolean, integer) from public, anon;
grant execute on function public.create_1v1_invite_v2(uuid, text, text, integer, boolean, integer, boolean, integer, boolean, integer) to authenticated, service_role;

create or replace function public.update_1v1_lobby_settings(
  p_room_id uuid,
  p_game_type text,
  p_category text,
  p_rounds integer default 10,
  p_powerups_enabled boolean default false,
  p_blaster_duration_seconds integer default 30,
  p_blaster_sudden_death boolean default false,
  p_blaster_rope_limit integer default 900,
  p_blaster_overtime_enabled boolean default true,
  p_blaster_overtime_after_seconds integer default 45
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_generated_room public.rooms%rowtype;
  v_generated_room_id uuid;
  v_game_type text := lower(trim(coalesce(p_game_type, '')));
  v_category text := lower(trim(coalesce(p_category, 'all')));
  v_rounds integer := greatest(5, least(coalesce(p_rounds, 10), 50));
  v_player_count integer := 0;
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

  if v_room.host_user_id <> v_uid then
    raise exception 'Only the host can change lobby settings';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Lobby settings can only be changed before the match starts';
  end if;

  if not exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = v_uid
  ) then
    raise exception 'Host is not in room';
  end if;

  if v_game_type not in ('quiz', 'matching', 'blaster', 'connect4') then
    raise exception 'Invalid game type';
  end if;

  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_game_type = 'connect4' then
    if not public.connect4_feature_enabled() then
      raise exception 'Connect 4 is disabled';
    end if;
    v_category := 'all';
    v_rounds := 42;
  elsif v_game_type in ('matching', 'blaster') and v_category = 'scenarios' then
    v_category := 'all';
  end if;

  if v_game_type = 'matching' then
    v_rounds := 5;
  elsif v_game_type = 'blaster' then
    v_rounds := 50;
  end if;

  v_generated_room_id := public.create_1v1_room_v2(
    v_game_type,
    v_category,
    false,
    v_rounds,
    case when v_game_type = 'blaster' then coalesce(p_powerups_enabled, false) else false end,
    case when v_game_type = 'blaster' then p_blaster_duration_seconds else 30 end,
    case when v_game_type = 'blaster' then coalesce(p_blaster_sudden_death, false) else false end,
    case when v_game_type = 'blaster' then p_blaster_rope_limit else 900 end,
    case when v_game_type = 'blaster' then coalesce(p_blaster_overtime_enabled, true) else true end,
    case when v_game_type = 'blaster' then p_blaster_overtime_after_seconds else 45 end
  );

  select *
  into v_generated_room
  from public.rooms
  where id = v_generated_room_id;

  if v_generated_room.id is null then
    raise exception 'Could not prepare lobby settings';
  end if;

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
  set game_type = v_generated_room.game_type,
      category = v_generated_room.category,
      rounds = v_generated_room.rounds,
      question_set = v_generated_room.question_set,
      settings = v_generated_room.settings,
      current_round = 1,
      started_at = null,
      ended_at = null,
      winner_user_id = null,
      rematch_room_id = null,
      updated_at = now()
  where id = p_room_id;

  delete from public.rooms
  where id = v_generated_room_id;

  select count(*)::int
  into v_player_count
  from public.room_players
  where room_id = p_room_id;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', 'waiting',
    'game_type', v_generated_room.game_type,
    'category', v_generated_room.category,
    'rounds', v_generated_room.rounds,
    'settings', v_generated_room.settings,
    'ready_count', 0,
    'player_count', v_player_count,
    'message', 'Lobby settings updated'
  );
end;
$$;

revoke all on function public.update_1v1_lobby_settings(uuid, text, text, integer, boolean, integer, boolean, integer, boolean, integer) from public, anon;
grant execute on function public.update_1v1_lobby_settings(uuid, text, text, integer, boolean, integer, boolean, integer, boolean, integer) to authenticated, service_role;

create or replace function public.submit_connect4_move(
  p_room_id uuid,
  p_column integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
  v_player_token text;
  v_next_turn text;
  v_state jsonb;
  v_board jsonb;
  v_history jsonb;
  v_row integer;
  v_direction record;
  v_count integer;
  v_scan_row integer;
  v_scan_col integer;
  v_winner text := null;
  v_winner_user_id uuid := null;
  v_draw boolean := false;
  v_status text := 'active';
  v_top_filled boolean := true;
  v_player_count integer := 0;
  v_result_player record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.connect4_feature_enabled() then
    raise exception 'Connect 4 is disabled';
  end if;

  if p_column is null or p_column < 0 or p_column > 6 then
    raise exception 'Column must be between 0 and 6';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.game_type <> 'connect4' then
    raise exception 'Room is not a Connect 4 game';
  end if;

  if v_room.status = 'completed' then
    raise exception 'Game is already completed';
  end if;

  if v_room.status <> 'in_progress' then
    raise exception 'Room is not active';
  end if;

  if v_room.started_at is null or now() < v_room.started_at then
    raise exception 'Match countdown active';
  end if;

  select *
  into v_player
  from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  if v_player.id is null then
    raise exception 'Only players can move';
  end if;

  select count(*)::int
  into v_player_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count <> 2 then
    raise exception 'Connect 4 requires two players';
  end if;

  v_player_token := case when v_player.slot_no = 1 then 'P1' when v_player.slot_no = 2 then 'P2' else null end;
  if v_player_token is null then
    raise exception 'Only players can move';
  end if;

  v_state := coalesce(v_room.settings->'connect4', public.default_connect4_state());
  if coalesce(v_state->>'status', 'active') = 'completed' then
    raise exception 'Game is already completed';
  end if;

  if coalesce(v_state->>'currentTurn', 'P1') <> v_player_token then
    raise exception 'Not your turn';
  end if;

  v_board := coalesce(v_state->'board', public.default_connect4_state()->'board');
  v_history := coalesce(v_state->'moveHistory', '[]'::jsonb);

  v_row := null;
  for v_scan_row in reverse 5..0 loop
    if v_board->v_scan_row->>p_column is null then
      v_row := v_scan_row;
      exit;
    end if;
  end loop;

  if v_row is null then
    raise exception 'Column is full';
  end if;

  v_board := jsonb_set(v_board, array[v_row::text, p_column::text], to_jsonb(v_player_token), false);
  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'player', v_player_token,
    'column', p_column,
    'row', v_row,
    'userId', v_uid,
    'playedAt', now()
  ));

  for v_direction in
    select *
    from (values (0, 1), (1, 0), (1, 1), (-1, 1)) as d(row_delta, col_delta)
  loop
    v_count := 1;

    v_scan_row := v_row + v_direction.row_delta;
    v_scan_col := p_column + v_direction.col_delta;
    while v_scan_row between 0 and 5
      and v_scan_col between 0 and 6
      and v_board->v_scan_row->>v_scan_col = v_player_token
    loop
      v_count := v_count + 1;
      v_scan_row := v_scan_row + v_direction.row_delta;
      v_scan_col := v_scan_col + v_direction.col_delta;
    end loop;

    v_scan_row := v_row - v_direction.row_delta;
    v_scan_col := p_column - v_direction.col_delta;
    while v_scan_row between 0 and 5
      and v_scan_col between 0 and 6
      and v_board->v_scan_row->>v_scan_col = v_player_token
    loop
      v_count := v_count + 1;
      v_scan_row := v_scan_row - v_direction.row_delta;
      v_scan_col := v_scan_col - v_direction.col_delta;
    end loop;

    if v_count >= 4 then
      v_winner := v_player_token;
      exit;
    end if;
  end loop;

  if v_winner is not null then
    v_status := 'completed';
    v_winner_user_id := v_uid;
  else
    v_top_filled := true;
    for v_scan_col in 0..6 loop
      if v_board->0->>v_scan_col is null then
        v_top_filled := false;
      end if;
    end loop;
    v_draw := v_top_filled;
    if v_draw then
      v_status := 'completed';
    end if;
  end if;

  v_next_turn := case when v_player_token = 'P1' then 'P2' else 'P1' end;
  v_state := jsonb_build_object(
    'board', v_board,
    'currentTurn', case when v_status = 'completed' then v_player_token else v_next_turn end,
    'winner', v_winner,
    'winnerUserId', v_winner_user_id,
    'draw', v_draw,
    'status', v_status,
    'moveHistory', v_history
  );

  update public.rooms
  set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('connect4', v_state),
      current_round = least(42, greatest(1, jsonb_array_length(v_history))),
      updated_at = now()
  where id = p_room_id;

  if v_status = 'completed' then
    delete from public.room_results where room_id = p_room_id;

    for v_result_player in
      select *
      from public.room_players
      where room_id = p_room_id
      order by slot_no
    loop
      update public.room_players
      set score = case
            when v_winner_user_id is not null and user_id = v_winner_user_id then 1
            else 0
          end,
          current_round = 43,
          finished_at = coalesce(finished_at, now()),
          last_seen = now()
      where id = v_result_player.id;

      insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
      values (
        p_room_id,
        v_result_player.user_id,
        case when v_winner_user_id is not null and v_result_player.user_id = v_winner_user_id then 1 else 0 end,
        0,
        case
          when v_winner_user_id is null then 1
          when v_result_player.user_id = v_winner_user_id then 1
          else 2
        end,
        v_winner_user_id is not null and v_result_player.user_id = v_winner_user_id
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
    set status = 'completed',
        winner_user_id = v_winner_user_id,
        ended_at = now(),
        current_round = 42,
        updated_at = now()
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  else
    update public.room_players
    set last_seen = now()
    where id = v_player.id;
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', case when v_status = 'completed' then 'completed' else 'in_progress' end,
    'winner_user_id', v_winner_user_id,
    'connect4', v_state
  );
end;
$$;

revoke all on function public.submit_connect4_move(uuid, integer) from public, anon;
grant execute on function public.submit_connect4_move(uuid, integer) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
