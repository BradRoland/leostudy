-- Keep completed/cancelled 1v1 player rows available for both clients.
-- Deleting a player row immediately after one client reached the result screen
-- made the other client more likely to miss the final completed snapshot.

create or replace function public.leave_1v1_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_remaining_players integer := 0;
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

  if v_room.status = 'in_progress' then
    raise exception 'Cannot leave an active match. Use forfeit instead.';
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
          current_round = 1,
          started_at = null,
          winner_user_id = null,
          ended_at = now(),
          rematch_room_id = null,
          updated_at = now()
      where id = p_room_id;

      if to_regclass('public.duel_invites') is not null then
        update public.duel_invites
        set status = 'cancelled',
            responded_at = now()
        where room_id = p_room_id
          and status = 'pending';
      end if;

      return jsonb_build_object(
        'room_id', p_room_id,
        'status', 'cancelled',
        'player_count', 0
      );
    end if;

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
    set status = 'waiting',
        current_round = 1,
        started_at = null,
        winner_user_id = null,
        ended_at = null,
        updated_at = now()
    where id = p_room_id;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', 'waiting',
      'player_count', v_remaining_players
    );
  end if;

  update public.room_players
  set is_ready = false,
      last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid;

  update public.rooms
  set rematch_room_id = null,
      updated_at = now()
  where id = p_room_id;

  select count(*)::int
  into v_remaining_players
  from public.room_players
  where room_id = p_room_id;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', v_room.status,
    'player_count', v_remaining_players
  );
end;
$$;

revoke all on function public.leave_1v1_room(uuid) from public, anon;
grant execute on function public.leave_1v1_room(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
