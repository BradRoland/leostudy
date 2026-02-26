-- Global leaderboard reset that preserves user progress and per-user stats.
-- Use this instead of any progress-reset SQL when you only want rankings cleared.

create or replace function public.reset_global_leaderboard_only()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_leaderboard integer := 0;
  v_is_owner boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if to_regclass('public.user_roles') is not null then
    select exists (
      select 1
      from public.user_roles
      where user_id = auth.uid()
        and role = 'owner'
    )
    into v_is_owner;
  end if;

  if not v_is_owner then
    raise exception 'Only owner can reset global leaderboard.';
  end if;

  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard
    where true;
    get diagnostics v_deleted_leaderboard = row_count;
  end if;

  return jsonb_build_object(
    'leaderboard_rows_deleted', v_deleted_leaderboard,
    'app_state_preserved', true,
    'duel_player_stats_preserved', true,
    'game_attempt_history_preserved', true
  );
end;
$$;

revoke all on function public.reset_global_leaderboard_only() from public;
revoke all on function public.reset_global_leaderboard_only() from anon;
grant execute on function public.reset_global_leaderboard_only() to authenticated;
