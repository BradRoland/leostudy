-- If one player accepts a rematch and the other leaves, do not hand the
-- remaining player into a stale/empty rematch room.

do $$
declare
  v_sql text;
  v_next_sql text;
begin
  v_sql := pg_get_functiondef('public.rematch_1v1_room(uuid, text)'::regprocedure);
  v_next_sql := replace(
    v_sql,
$old$
  if v_room.rematch_room_id is not null then
    return v_room.rematch_room_id;
  end if;
$old$,
$new$
  if v_room.rematch_room_id is not null then
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
      return v_room.rematch_room_id;
    end if;

    update public.rooms
    set rematch_room_id = null,
        updated_at = now()
    where id = p_room_id;

    update public.rooms
    set status = 'cancelled',
        ended_at = now(),
        updated_at = now()
    where id = v_room.rematch_room_id
      and status in ('waiting', 'in_progress');

    update public.room_players
    set is_ready = false,
        last_seen = now()
    where room_id = p_room_id;

    raise exception 'Opponent left the rematch. Rematch cancelled.';
  end if;
$new$
  );

  if v_next_sql = v_sql and position('Opponent left the rematch. Rematch cancelled.' in v_sql) = 0 then
    raise exception 'Could not patch rematch_1v1_room stale rematch guard';
  end if;

  if v_next_sql <> v_sql then
    execute v_next_sql;
  end if;

  v_sql := pg_get_functiondef('public.set_1v1_ready(uuid, boolean)'::regprocedure);
  v_next_sql := replace(
    v_sql,
$old$
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
$old$,
$new$
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
$new$
  );

  if v_next_sql = v_sql and position('rematch_cancelled' in v_sql) = 0 then
    raise exception 'Could not patch set_1v1_ready stale rematch guard';
  end if;

  if v_next_sql <> v_sql then
    execute v_next_sql;
  end if;
end $$;

grant execute on function public.rematch_1v1_room(uuid, text) to authenticated;
grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;

select pg_notify('pgrst', 'reload schema');
