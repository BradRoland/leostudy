-- Hotfix: allow running leaderboard-only reset from Supabase SQL editor
-- while still enforcing owner checks for app-authenticated users.

create or replace function public.reset_global_leaderboard_only()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_leaderboard integer := 0;
  v_is_owner boolean := false;
  v_uid uuid := auth.uid();
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_sql_editor boolean := current_user in ('postgres', 'supabase_admin');
  v_is_service_role boolean := v_jwt_role = 'service_role';
begin
  -- SQL editor (postgres) and service-role callers are allowed directly.
  -- Normal authenticated users must be owner.
  if not v_is_sql_editor and not v_is_service_role then
    if v_uid is null then
      raise exception 'Not authenticated';
    end if;

    if to_regclass('public.user_roles') is not null then
      select exists (
        select 1
        from public.user_roles
        where user_id = v_uid
          and role = 'owner'
      )
      into v_is_owner;
    end if;

    if not v_is_owner then
      raise exception 'Only owner can reset global leaderboard.';
    end if;
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
