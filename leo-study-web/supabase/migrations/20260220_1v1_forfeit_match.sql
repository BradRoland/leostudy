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
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id;

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

    select count(*)::int
    into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    if v_remaining_players = 0 then
      update public.rooms
      set status = 'cancelled',
          ended_at = now()
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

  select * into v_opponent
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_uid
  order by slot_no
  limit 1;

  update public.room_players
  set current_round = greatest(current_round, v_room.rounds + 1),
      last_seen = now()
  where id = v_self.id;

  if v_opponent.id is not null then
    update public.room_players
    set current_round = greatest(current_round, v_room.rounds + 1),
        last_seen = now()
    where id = v_opponent.id;

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_opponent.user_id, v_opponent.score, v_opponent.total_time_ms, 1, true)
    on conflict (room_id, user_id)
    do update set
      score = excluded.score,
      total_time_ms = excluded.total_time_ms,
      placement = excluded.placement,
      is_winner = excluded.is_winner,
      finished_at = now();

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_self.user_id, v_self.score, v_self.total_time_ms, 2, false)
    on conflict (room_id, user_id)
    do update set
      score = excluded.score,
      total_time_ms = excluded.total_time_ms,
      placement = excluded.placement,
      is_winner = excluded.is_winner,
      finished_at = now();

    update public.rooms
    set status = 'completed',
        winner_user_id = v_opponent.user_id,
        ended_at = now(),
        current_round = v_room.rounds
    where id = p_room_id;
  else
    update public.rooms
    set status = 'cancelled',
        ended_at = now(),
        current_round = v_room.rounds
    where id = p_room_id;
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id)
  );
end;
$$;

grant execute on function public.forfeit_1v1_match(uuid) to authenticated;
