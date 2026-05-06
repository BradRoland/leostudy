-- Ensure invite-created 1v1 rooms become visible for spectating after both
-- invited players ready up and the match starts.

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

    update public.rooms
    set
      status = 'in_progress',
      started_at = now(),
      current_round = 1,
      is_public = case when v_publish_for_spectators then true else is_public end,
      join_code = case when v_publish_for_spectators then null else join_code end
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
      'room_id', p_room_id
    );
  end if;

  if v_room.status = 'completed' and v_player_count = 2 and v_ready_count = 2 then
    v_started_room_id := public.rematch_1v1_room(p_room_id, null);
    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', true,
      'room_id', v_started_room_id
    );
  end if;

  select status into v_status
  from public.rooms
  where id = p_room_id;

  return jsonb_build_object(
    'status', coalesce(v_status, v_room.status),
    'ready_count', v_ready_count,
    'player_count', v_player_count,
    'rematch_started', false,
    'room_id', p_room_id
  );
end;
$$;

grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;

select pg_notify('pgrst', 'reload schema');
