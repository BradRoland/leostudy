create or replace function public.recompute_duel_player_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise notice 'recompute_duel_player_stats is disabled to preserve live 1v1 leaderboard aggregates.';
end;
$$;

revoke all on function public.recompute_duel_player_stats() from public, anon, authenticated;
select pg_notify('pgrst', 'reload schema');
