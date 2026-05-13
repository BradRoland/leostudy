-- Keep level and leaderboard refreshes snappy without indexing large app_state JSON blobs.
create index if not exists leaderboard_score_rank_idx
  on public.leaderboard (score desc, round desc, created_at desc);

create index if not exists leaderboard_user_score_lookup_idx
  on public.leaderboard (user_id, score desc, created_at desc);

create index if not exists weekly_leaderboard_week_score_rank_idx
  on public.weekly_leaderboard (week_start, score desc, round desc, updated_at desc);

-- If the project has the public app_state read policy used by the home/leveling
-- widgets, remove the older self-only select policy so Postgres does not evaluate
-- two permissive SELECT policies for every app_state leaderboard read.
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_state'
      and policyname = 'app_state_read_all'
  ) then
    drop policy if exists app_state_select_self on public.app_state;
  end if;
end $$;
