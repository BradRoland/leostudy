create table if not exists public.duel_player_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_type text not null check (game_type in ('all', 'quiz', 'matching')),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  matches_played integer not null default 0 check (matches_played >= 0),
  current_win_streak integer not null default 0 check (current_win_streak >= 0),
  best_win_streak integer not null default 0 check (best_win_streak >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_type)
);

create index if not exists idx_duel_player_stats_type_wins
  on public.duel_player_stats (game_type, wins desc, updated_at desc);

create index if not exists idx_duel_player_stats_type_streak
  on public.duel_player_stats (game_type, current_win_streak desc, updated_at desc);

alter table public.duel_player_stats enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'duel_player_stats'
      and policyname = 'duel_player_stats_read_authenticated'
  ) then
    create policy duel_player_stats_read_authenticated
    on public.duel_player_stats
    for select
    to authenticated
    using (true);
  end if;
end $$;

grant select on public.duel_player_stats to authenticated;

create or replace function public.recompute_duel_player_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_game_type text;
  v_record record;
  v_modes text[] := array['all', 'quiz', 'matching'];
  v_mode text;
  v_wins integer;
  v_losses integer;
  v_matches integer;
  v_current_streak integer;
  v_best_streak integer;
begin
  delete from public.duel_player_stats;

  for v_mode in select unnest(v_modes)
  loop
    for v_record in
      with user_pool as (
        select distinct rr.user_id
        from public.room_results rr
        join public.rooms r on r.id = rr.room_id
        where r.status = 'completed'
          and (v_mode = 'all' or r.game_type = v_mode)
      )
      select user_id
      from user_pool
    loop
      v_user_id := v_record.user_id;
      v_wins := 0;
      v_losses := 0;
      v_matches := 0;
      v_current_streak := 0;
      v_best_streak := 0;

      for v_game_type in
        select case when rr.is_winner then 'W' else 'L' end
        from public.room_results rr
        join public.rooms r on r.id = rr.room_id
        where rr.user_id = v_user_id
          and r.status = 'completed'
          and (v_mode = 'all' or r.game_type = v_mode)
        order by coalesce(r.ended_at, rr.finished_at), rr.finished_at, rr.room_id
      loop
        v_matches := v_matches + 1;
        if v_game_type = 'W' then
          v_wins := v_wins + 1;
          v_current_streak := v_current_streak + 1;
          v_best_streak := greatest(v_best_streak, v_current_streak);
        else
          v_losses := v_losses + 1;
          v_current_streak := 0;
        end if;
      end loop;

      insert into public.duel_player_stats (
        user_id,
        game_type,
        wins,
        losses,
        matches_played,
        current_win_streak,
        best_win_streak
      ) values (
        v_user_id,
        v_mode,
        v_wins,
        v_losses,
        v_matches,
        v_current_streak,
        v_best_streak
      );
    end loop;
  end loop;
end;
$$;

create or replace function public.process_1v1_room_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player record;
  v_mode text;
  v_modes text[];
  v_is_winner boolean;
begin
  if new.status <> 'completed' then
    return new;
  end if;

  if old.status = 'completed' then
    return new;
  end if;

  if new.winner_user_id is null then
    return new;
  end if;

  v_modes := array['all', new.game_type];

  for v_player in
    select rp.user_id
    from public.room_players rp
    where rp.room_id = new.id
  loop
    v_is_winner := v_player.user_id = new.winner_user_id;
    foreach v_mode in array v_modes
    loop
      insert into public.duel_player_stats (
        user_id,
        game_type,
        wins,
        losses,
        matches_played,
        current_win_streak,
        best_win_streak
      ) values (
        v_player.user_id,
        v_mode,
        case when v_is_winner then 1 else 0 end,
        case when v_is_winner then 0 else 1 end,
        1,
        case when v_is_winner then 1 else 0 end,
        case when v_is_winner then 1 else 0 end
      )
      on conflict (user_id, game_type)
      do update set
        wins = public.duel_player_stats.wins + excluded.wins,
        losses = public.duel_player_stats.losses + excluded.losses,
        matches_played = public.duel_player_stats.matches_played + 1,
        current_win_streak = case
          when excluded.wins = 1 then public.duel_player_stats.current_win_streak + 1
          else 0
        end,
        best_win_streak = greatest(
          public.duel_player_stats.best_win_streak,
          case
            when excluded.wins = 1 then public.duel_player_stats.current_win_streak + 1
            else public.duel_player_stats.best_win_streak
          end
        ),
        updated_at = now();
    end loop;
  end loop;

  return new;
end;
$$;

revoke all on function public.recompute_duel_player_stats() from public, anon, authenticated;
revoke all on function public.process_1v1_room_completion() from public, anon, authenticated;

drop trigger if exists trg_rooms_process_1v1_stats on public.rooms;
create trigger trg_rooms_process_1v1_stats
after update of status on public.rooms
for each row
execute function public.process_1v1_room_completion();

select public.recompute_duel_player_stats();
