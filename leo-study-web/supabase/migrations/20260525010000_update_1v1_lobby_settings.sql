-- Let a 1v1 host change the waiting lobby's game mode and settings.

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
  v_category text := lower(trim(coalesce(p_category, '')));
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

  if v_game_type not in ('quiz', 'matching', 'blaster') then
    raise exception 'Invalid game type';
  end if;

  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_game_type in ('matching', 'blaster') and v_category = 'scenarios' then
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

select pg_notify('pgrst', 'reload schema');
