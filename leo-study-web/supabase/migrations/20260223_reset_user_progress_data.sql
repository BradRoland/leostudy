-- Reset all user-specific progress/stats data across the app.
-- Keeps account/profile identity intact while wiping progress history.

create or replace function public.reset_user_progress_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted integer := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if to_regclass('public.app_state') is not null then
    delete from public.app_state
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('app_state', v_deleted);
  end if;

  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('leaderboard', v_deleted);
  end if;

  if to_regclass('public.game_attempt_history') is not null then
    delete from public.game_attempt_history
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('game_attempt_history', v_deleted);
  end if;

  if to_regclass('public.duel_invites') is not null then
    delete from public.duel_invites
    where sender_user_id = v_uid
       or recipient_user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_invites', v_deleted);
  end if;

  if to_regclass('public.rooms') is not null then
    delete from public.rooms
    where host_user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('rooms_hosted', v_deleted);
  end if;

  if to_regclass('public.room_players') is not null then
    delete from public.room_players
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('room_players', v_deleted);
  end if;

  if to_regclass('public.room_results') is not null then
    delete from public.room_results
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('room_results', v_deleted);
  end if;

  if to_regclass('public.duel_room_messages') is not null then
    delete from public.duel_room_messages
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_room_messages', v_deleted);
  end if;

  if to_regclass('public.duel_player_stats') is not null then
    delete from public.duel_player_stats
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_player_stats', v_deleted);
  end if;

  return v_summary;
end;
$$;

revoke all on function public.reset_user_progress_data() from public;
revoke all on function public.reset_user_progress_data() from anon;
grant execute on function public.reset_user_progress_data() to authenticated;
