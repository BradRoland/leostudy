-- Reduce Supabase database advisor noise without changing user-facing workflows.
-- These fixes address enabled RLS, mutable function search paths, missing FK
-- indexes, overly broad leaderboard writes, and row-by-row auth.uid() policy
-- evaluation.

alter table public.app_state enable row level security;

alter function public.generate_room_join_code() set search_path = public;
alter function public.get_online_users_count(minutes_interval integer) set search_path = public;
alter function public.set_timestamp_updated_at() set search_path = public;
alter function public.upsert_leaderboard(
  p_user_id uuid,
  p_game text,
  p_match_duration integer,
  p_match_filter text,
  p_score integer,
  p_round integer
) set search_path = public;

create index if not exists idx_banned_users_created_by on public.banned_users (created_by);
create index if not exists idx_duel_invites_room_id on public.duel_invites (room_id);
create index if not exists idx_duel_room_messages_user_id on public.duel_room_messages (user_id);
create index if not exists idx_public_message_reactions_user_id on public.public_message_reactions (user_id);
create index if not exists idx_public_message_reports_message_id on public.public_message_reports (message_id);
create index if not exists idx_public_message_reports_reporter_user_id on public.public_message_reports (reporter_user_id);
create index if not exists idx_public_messages_deleted_by on public.public_messages (deleted_by);
create index if not exists idx_public_messages_user_id on public.public_messages (user_id);
create index if not exists idx_room_results_user_id on public.room_results (user_id);
create index if not exists idx_rooms_rematch_room_id on public.rooms (rematch_room_id);
create index if not exists idx_rooms_winner_user_id on public.rooms (winner_user_id);

drop policy if exists app_settings_owner_delete on public.app_settings;
drop policy if exists app_settings_owner_insert on public.app_settings;
drop policy if exists app_settings_owner_update on public.app_settings;

create policy app_settings_owner_delete
on public.app_settings
for delete
to public
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = (select auth.uid())
      and user_roles.role = 'owner'
  )
);

create policy app_settings_owner_insert
on public.app_settings
for insert
to public
with check (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = (select auth.uid())
      and user_roles.role = 'owner'
  )
);

create policy app_settings_owner_update
on public.app_settings
for update
to public
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = (select auth.uid())
      and user_roles.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = (select auth.uid())
      and user_roles.role = 'owner'
  )
);

drop policy if exists app_state_upsert_self on public.app_state;
drop policy if exists app_state_update_self on public.app_state;

create policy app_state_upsert_self
on public.app_state
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy app_state_update_self
on public.app_state
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists banned_users_delete_owner_only on public.banned_users;
drop policy if exists banned_users_insert_owner_only on public.banned_users;
drop policy if exists banned_users_select_self_or_owner on public.banned_users;
drop policy if exists banned_users_update_owner_only on public.banned_users;

create policy banned_users_delete_owner_only
on public.banned_users
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
);

create policy banned_users_insert_owner_only
on public.banned_users
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
);

create policy banned_users_select_self_or_owner
on public.banned_users
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
);

create policy banned_users_update_owner_only
on public.banned_users
for update
to authenticated
using (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
);

drop policy if exists bug_reports_delete_owner_only on public.bug_reports;
drop policy if exists bug_reports_insert_own on public.bug_reports;
drop policy if exists bug_reports_select_own_or_owner on public.bug_reports;
drop policy if exists bug_reports_update_owner_only on public.bug_reports;

create policy bug_reports_delete_owner_only
on public.bug_reports
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
);

create policy bug_reports_insert_own
on public.bug_reports
for insert
to authenticated
with check (reporter_user_id = (select auth.uid()));

create policy bug_reports_select_own_or_owner
on public.bug_reports
for select
to authenticated
using (
  reporter_user_id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
);

create policy bug_reports_update_owner_only
on public.bug_reports
for update
to authenticated
using (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
);

drop policy if exists content_items_read_all on public.content_items;
drop policy if exists content_items_select_published_or_owner on public.content_items;
drop policy if exists content_items_owner_delete on public.content_items;
drop policy if exists content_items_owner_insert on public.content_items;
drop policy if exists content_items_owner_update on public.content_items;

create policy content_items_select_published_or_owner
on public.content_items
for select
to public
using (
  is_published = true
  or exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
);

create policy content_items_owner_delete
on public.content_items
for delete
to public
using (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
);

create policy content_items_owner_insert
on public.content_items
for insert
to public
with check (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
);

create policy content_items_owner_update
on public.content_items
for update
to public
using (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
);

drop policy if exists duel_invites_insert_sender_only on public.duel_invites;
drop policy if exists duel_invites_select_participants on public.duel_invites;
drop policy if exists duel_invites_update_participants on public.duel_invites;

create policy duel_invites_insert_sender_only
on public.duel_invites
for insert
to public
with check ((select auth.uid()) = sender_user_id);

create policy duel_invites_select_participants
on public.duel_invites
for select
to public
using (
  (select auth.uid()) = sender_user_id
  or (select auth.uid()) = recipient_user_id
);

create policy duel_invites_update_participants
on public.duel_invites
for update
to public
using (
  (select auth.uid()) = sender_user_id
  or (select auth.uid()) = recipient_user_id
)
with check (
  (select auth.uid()) = sender_user_id
  or (select auth.uid()) = recipient_user_id
);

drop policy if exists duel_room_messages_insert_waiting_participants on public.duel_room_messages;
drop policy if exists duel_room_messages_select_participants on public.duel_room_messages;

create policy duel_room_messages_insert_waiting_participants
on public.duel_room_messages
for insert
to public
with check (
  (select auth.uid()) = user_id
  and public.is_room_participant(room_id, (select auth.uid()))
  and exists (
    select 1
    from public.rooms r
    where r.id = duel_room_messages.room_id
      and r.status = 'waiting'
  )
  and nullif(trim(message), '') is not null
  and char_length(trim(message)) between 1 and 240
);

create policy duel_room_messages_select_participants
on public.duel_room_messages
for select
to public
using (public.is_room_participant(room_id, (select auth.uid())));

drop policy if exists game_attempt_history_insert_self on public.game_attempt_history;
drop policy if exists game_attempt_history_select_self on public.game_attempt_history;

create policy game_attempt_history_insert_self
on public.game_attempt_history
for insert
to public
with check ((select auth.uid()) = user_id);

create policy game_attempt_history_select_self
on public.game_attempt_history
for select
to public
using ((select auth.uid()) = user_id);

drop policy if exists leaderboard_all_insert on public.leaderboard;
drop policy if exists leaderboard_insert_any_authed on public.leaderboard;
drop policy if exists leaderboard_all_update on public.leaderboard;
drop policy if exists leaderboard_insert_self on public.leaderboard;
drop policy if exists leaderboard_update_self on public.leaderboard;

create policy leaderboard_insert_self
on public.leaderboard
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy leaderboard_update_self
on public.leaderboard
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_select_all on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy profiles_update_self
on public.profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists public_message_reactions_delete_own on public.public_message_reactions;
drop policy if exists public_message_reactions_insert_own on public.public_message_reactions;

create policy public_message_reactions_delete_own
on public.public_message_reactions
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy public_message_reactions_insert_own
on public.public_message_reactions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists public_message_reports_insert_authenticated on public.public_message_reports;
drop policy if exists public_message_reports_select_admin_only on public.public_message_reports;

create policy public_message_reports_insert_authenticated
on public.public_message_reports
for insert
to public
with check ((select auth.uid()) = reporter_user_id);

create policy public_message_reports_select_admin_only
on public.public_message_reports
for select
to public
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = (select auth.uid())
      and user_roles.role = 'owner'
  )
);

drop policy if exists public_messages_insert_authenticated on public.public_messages;
drop policy if exists public_messages_delete_admin_only on public.public_messages;

create policy public_messages_insert_authenticated
on public.public_messages
for insert
to public
with check ((select auth.uid()) = user_id);

create policy public_messages_delete_admin_only
on public.public_messages
for update
to public
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles
    where user_roles.user_id = (select auth.uid())
      and user_roles.role = 'owner'
  )
)
with check (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles
    where user_roles.user_id = (select auth.uid())
      and user_roles.role = 'owner'
  )
);

drop policy if exists room_players_insert on public.room_players;
drop policy if exists room_players_select on public.room_players;
drop policy if exists room_players_select_room_participants on public.room_players;
drop policy if exists room_players_update on public.room_players;

create policy room_players_insert
on public.room_players
for insert
to public
with check ((select auth.uid()) = user_id);

create policy room_players_select_room_participants
on public.room_players
for select
to public
using (public.is_room_participant(room_id, (select auth.uid())));

create policy room_players_update
on public.room_players
for update
to public
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists room_results_insert_self on public.room_results;
drop policy if exists room_results_select_room_participants on public.room_results;

create policy room_results_insert_self
on public.room_results
for insert
to public
with check ((select auth.uid()) = user_id);

create policy room_results_select_room_participants
on public.room_results
for select
to public
using (
  exists (
    select 1
    from public.room_players rp
    where rp.room_id = room_results.room_id
      and rp.user_id = (select auth.uid())
  )
);

drop policy if exists rooms_insert_host_only on public.rooms;
drop policy if exists rooms_select on public.rooms;
drop policy if exists rooms_update on public.rooms;

create policy rooms_insert_host_only
on public.rooms
for insert
to public
with check ((select auth.uid()) = host_user_id);

create policy rooms_select
on public.rooms
for select
to public
using (
  host_user_id = (select auth.uid())
  or exists (
    select 1
    from public.room_players
    where room_players.room_id = rooms.id
      and room_players.user_id = (select auth.uid())
  )
);

create policy rooms_update
on public.rooms
for update
to public
using (
  host_user_id = (select auth.uid())
  or exists (
    select 1
    from public.room_players
    where room_players.room_id = rooms.id
      and room_players.user_id = (select auth.uid())
  )
)
with check (
  host_user_id = (select auth.uid())
  or exists (
    select 1
    from public.room_players
    where room_players.room_id = rooms.id
      and room_players.user_id = (select auth.uid())
  )
);

drop policy if exists user_roles_read_owner_only on public.user_roles;
drop policy if exists user_roles_select_own on public.user_roles;

create policy user_roles_read_owner_or_self
on public.user_roles
for select
to anon, authenticated
using (
  role = 'owner'
  or user_id = (select auth.uid())
);

drop policy if exists weekly_leaderboard_insert_self on public.weekly_leaderboard;
drop policy if exists weekly_leaderboard_update_self on public.weekly_leaderboard;

create policy weekly_leaderboard_insert_self
on public.weekly_leaderboard
for insert
to public
with check ((select auth.uid()) = user_id);

create policy weekly_leaderboard_update_self
on public.weekly_leaderboard
for update
to public
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
