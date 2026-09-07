-- Class-scoped score policies and self-only history policies remain unchanged.
begin;
do $$ declare relation_name text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach relation_name in array array['leaderboard','weekly_leaderboard','duel_player_stats','game_attempt_history'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=relation_name) then
    execute format('alter publication supabase_realtime add table public.%I',relation_name);
   end if;
  end loop;
 end if;
end $$;
commit;
