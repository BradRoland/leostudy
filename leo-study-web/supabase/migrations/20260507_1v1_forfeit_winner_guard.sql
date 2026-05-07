-- Prevent stale client timers from forfeiting a player who already completed all
-- 1v1 rounds. If a forfeit arrives after both players finished, finalize by the
-- normal tie-break order: score -> total time -> fastest single round -> draw.

alter table public.room_players
  add column if not exists fastest_round_ms bigint not null default 0;

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
      case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, rp.total_time_ms asc, fastest_norm asc
    limit 1
  ) ranked;

  select ranked.* into v_second
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

  if v_first.user_id is null then
    raise exception 'No players found';
  elsif v_second.user_id is null then
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
  set status = 'completed',
      winner_user_id = v_winner,
      ended_at = coalesce(ended_at, now()),
      current_round = coalesce(rounds, current_round)
  where id = p_room_id;

  update public.room_players
  set is_ready = false
  where room_id = p_room_id;

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
    'status', 'completed',
    'winner_user_id', v_winner,
    'players', v_results
  );
end;
$$;

revoke all on function public.finish_1v1_room_by_score(uuid) from public, anon, authenticated;

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
      set status = 'cancelled', ended_at = now()
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

  -- Stale browser timers can fire after a player has already answered the final
  -- question. Do not let that overwrite a valid 100% finish as a forfeit loss.
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

    delete from public.room_results where room_id = p_room_id;

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_opponent.user_id, v_opponent.score, v_opponent.total_time_ms, 1, true);

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_self.user_id, v_self.score, v_self.total_time_ms, 2, false);

    update public.rooms
    set status = 'completed',
        winner_user_id = v_opponent.user_id,
        ended_at = now(),
        current_round = v_room.rounds
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  else
    update public.rooms
    set status = 'cancelled', ended_at = now(), current_round = v_room.rounds
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
notify pgrst, 'reload schema';

-- Repair any already-completed 1v1 rooms where a stale forfeit result made a
-- lower score beat a higher score, then rebuild 1v1 stats from room_results.
do $$
declare
  v_room record;
  v_winner uuid;
  v_first record;
  v_second record;
  v_row record;
begin
  for v_room in
    select id, winner_user_id
    from public.rooms
    where status = 'completed'
      and exists (select 1 from public.room_players where room_id = rooms.id)
  loop
    select ranked.* into v_first
    from (
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
      from public.room_players rp
      where rp.room_id = v_room.id
      order by rp.score desc, rp.total_time_ms asc, fastest_norm asc
      limit 1
    ) ranked;

    select ranked.* into v_second
    from (
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
      from public.room_players rp
      where rp.room_id = v_room.id
      order by rp.score desc, rp.total_time_ms asc, fastest_norm asc
      offset 1
      limit 1
    ) ranked;

    if v_first.user_id is null then
      continue;
    elsif v_second.user_id is null then
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

    if v_room.winner_user_id is distinct from v_winner then
      delete from public.room_results where room_id = v_room.id;

      for v_row in
        select
          rp.user_id,
          rp.score,
          rp.total_time_ms,
          row_number() over (
            order by rp.score desc,
                     rp.total_time_ms asc,
                     case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end asc
          ) as rank_position
        from public.room_players rp
        where rp.room_id = v_room.id
        order by rank_position
      loop
        insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
        values (
          v_room.id,
          v_row.user_id,
          v_row.score,
          v_row.total_time_ms,
          case when v_winner is null then 1 else v_row.rank_position end,
          (v_winner is not null and v_row.user_id = v_winner)
        );
      end loop;

      update public.rooms
      set winner_user_id = v_winner
      where id = v_room.id;
    end if;
  end loop;

  if to_regclass('public.duel_player_stats') is not null then
    delete from public.duel_player_stats where true;

    with ordered_matches as (
      select
        rr.user_id,
        'all'::text as game_type,
        r.created_at,
        (rr.user_id = r.winner_user_id) as won
      from public.room_results rr
      join public.rooms r on r.id = rr.room_id
      where r.status = 'completed'
        and r.winner_user_id is not null
      union all
      select
        rr.user_id,
        r.game_type::text as game_type,
        r.created_at,
        (rr.user_id = r.winner_user_id) as won
      from public.room_results rr
      join public.rooms r on r.id = rr.room_id
      where r.status = 'completed'
        and r.winner_user_id is not null
    ), grouped as (
      select
        user_id,
        game_type,
        count(*)::int as matches_played,
        count(*) filter (where won)::int as wins,
        count(*) filter (where not won)::int as losses
      from ordered_matches
      group by user_id, game_type
    ), last_losses as (
      select
        user_id,
        game_type,
        max(created_at) filter (where not won) as last_loss_at
      from ordered_matches
      group by user_id, game_type
    ), current_streaks as (
      select
        g.user_id,
        g.game_type,
        count(om.*) filter (where om.won)::int as current_win_streak
      from grouped g
      left join last_losses ll on ll.user_id = g.user_id and ll.game_type = g.game_type
      left join ordered_matches om on om.user_id = g.user_id
        and om.game_type = g.game_type
        and om.won
        and (ll.last_loss_at is null or om.created_at > ll.last_loss_at)
      group by g.user_id, g.game_type
    ), streak_scan as (
      select
        user_id,
        game_type,
        won,
        sum(case when won then 0 else 1 end) over (
          partition by user_id, game_type order by created_at rows unbounded preceding
        ) as loss_group
      from ordered_matches
    ), best_streaks as (
      select user_id, game_type, coalesce(max(streak_len), 0)::int as best_win_streak
      from (
        select user_id, game_type, loss_group, count(*) filter (where won)::int as streak_len
        from streak_scan
        group by user_id, game_type, loss_group
      ) streaks
      group by user_id, game_type
    )
    insert into public.duel_player_stats (
      user_id,
      game_type,
      wins,
      losses,
      matches_played,
      current_win_streak,
      best_win_streak,
      updated_at
    )
    select
      g.user_id,
      g.game_type,
      g.wins,
      g.losses,
      g.matches_played,
      coalesce(cs.current_win_streak, 0),
      coalesce(bs.best_win_streak, 0),
      now()
    from grouped g
    left join current_streaks cs on cs.user_id = g.user_id and cs.game_type = g.game_type
    left join best_streaks bs on bs.user_id = g.user_id and bs.game_type = g.game_type;
  end if;
end;
$$;
