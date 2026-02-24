-- Owner account moderation:
-- - Ban account (removes from all leaderboards + blocks future score/progress writes)
-- - Delete account (hard delete from auth.users with cascading data removal)

-- Ensure owner-role table exists (for environments that haven't run the owner-role migration yet).
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'user_roles_select_own'
  ) then
    create policy user_roles_select_own
    on public.user_roles
    for select
    using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'user_roles_read_owner_only'
  ) then
    create policy user_roles_read_owner_only
    on public.user_roles
    for select
    using (role = 'owner');
  end if;
end $$;

create table if not exists public.banned_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_banned_users_created_at on public.banned_users (created_at desc);

alter table public.banned_users enable row level security;

drop policy if exists banned_users_select_self_or_owner on public.banned_users;
create policy banned_users_select_self_or_owner
on public.banned_users
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
);

drop policy if exists banned_users_insert_owner_only on public.banned_users;
create policy banned_users_insert_owner_only
on public.banned_users
for insert
with check (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
);

drop policy if exists banned_users_update_owner_only on public.banned_users;
create policy banned_users_update_owner_only
on public.banned_users
for update
using (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
);

drop policy if exists banned_users_delete_owner_only on public.banned_users;
create policy banned_users_delete_owner_only
on public.banned_users
for delete
using (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
);

grant select on public.banned_users to authenticated;
grant insert, update, delete on public.banned_users to authenticated;
revoke all on public.banned_users from anon;

create or replace function public.is_owner_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = p_user_id
      and r.role = 'owner'
  );
$$;

create or replace function public.is_user_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.banned_users b
    where b.user_id = p_user_id
  );
$$;

create or replace function public.owner_manage_account(
  p_target_user_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_deleted integer := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_owner_user(v_actor) then
    raise exception 'Owner role required';
  end if;

  if p_target_user_id is null then
    raise exception 'Target account is required';
  end if;

  if p_target_user_id = v_actor then
    raise exception 'You cannot moderate your own account';
  end if;

  if public.is_owner_user(p_target_user_id) then
    raise exception 'Owner accounts cannot be moderated from this action';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_target_user_id) then
    raise exception 'Target account not found';
  end if;

  if v_action not in ('ban', 'delete') then
    raise exception 'Unsupported moderation action: %', p_action;
  end if;

  if v_action = 'ban' then
    insert into public.banned_users (user_id, reason, created_at, created_by)
    values (p_target_user_id, nullif(trim(coalesce(p_reason, '')), ''), now(), v_actor)
    on conflict (user_id)
    do update
      set reason = excluded.reason,
          created_at = now(),
          created_by = v_actor;

    if to_regclass('public.app_state') is not null then
      delete from public.app_state where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('app_state', v_deleted);
    end if;

    if to_regclass('public.leaderboard') is not null then
      delete from public.leaderboard where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('leaderboard', v_deleted);
    end if;

    if to_regclass('public.duel_player_stats') is not null then
      delete from public.duel_player_stats where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_player_stats', v_deleted);
    end if;

    if to_regclass('public.game_attempt_history') is not null then
      delete from public.game_attempt_history where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('game_attempt_history', v_deleted);
    end if;

    if to_regclass('public.rooms') is not null then
      delete from public.rooms where host_user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('rooms_hosted', v_deleted);
    end if;

    if to_regclass('public.room_players') is not null then
      delete from public.room_players where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('room_players', v_deleted);
    end if;

    if to_regclass('public.room_results') is not null then
      delete from public.room_results where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('room_results', v_deleted);
    end if;

    if to_regclass('public.duel_invites') is not null then
      delete from public.duel_invites where sender_user_id = p_target_user_id or recipient_user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_invites', v_deleted);
    end if;

    if to_regclass('public.duel_room_messages') is not null then
      delete from public.duel_room_messages where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_room_messages', v_deleted);
    end if;

    if to_regclass('public.public_messages') is not null then
      delete from public.public_messages where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('public_messages', v_deleted);
    end if;

    return jsonb_build_object(
      'ok', true,
      'action', 'ban',
      'target_user_id', p_target_user_id,
      'summary', v_summary
    );
  end if;

  -- delete
  delete from auth.users
  where id = p_target_user_id;

  if not found then
    raise exception 'Target account not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'delete',
    'target_user_id', p_target_user_id
  );
end;
$$;

revoke all on function public.owner_manage_account(uuid, text, text) from public;
revoke all on function public.owner_manage_account(uuid, text, text) from anon;
grant execute on function public.owner_manage_account(uuid, text, text) to authenticated;

-- Compatibility wrapper for PostgREST/Supabase RPC argument ordering.
create or replace function public.owner_manage_account(
  p_action text,
  p_reason text,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regprocedure('public.owner_manage_account_impl(uuid,text,text)') is not null then
    return public.owner_manage_account_impl(p_target_user_id, p_action, p_reason);
  end if;

  if to_regprocedure('public.owner_manage_account(uuid,text,text)') is not null then
    return public.owner_manage_account(p_target_user_id, p_action, p_reason);
  end if;

  raise exception 'Base moderation function missing. Run migration 20260224_owner_account_moderation.sql';
end;
$$;

revoke all on function public.owner_manage_account(text, text, uuid) from public;
revoke all on function public.owner_manage_account(text, text, uuid) from anon;
grant execute on function public.owner_manage_account(text, text, uuid) to authenticated;

-- Stable single-signature RPC entrypoint (avoids overload/schema-cache ambiguity).
create or replace function public.owner_moderate_account(
  p_action text,
  p_reason text,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_deleted integer := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_owner_user(v_actor) then
    raise exception 'Owner role required';
  end if;

  if p_target_user_id is null then
    raise exception 'Target account is required';
  end if;

  if p_target_user_id = v_actor then
    raise exception 'You cannot moderate your own account';
  end if;

  if public.is_owner_user(p_target_user_id) then
    raise exception 'Owner accounts cannot be moderated from this action';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_target_user_id) then
    raise exception 'Target account not found';
  end if;

  if v_action not in ('ban', 'delete') then
    raise exception 'Unsupported moderation action: %', p_action;
  end if;

  if v_action = 'ban' then
    insert into public.banned_users (user_id, reason, created_at, created_by)
    values (p_target_user_id, nullif(trim(coalesce(p_reason, '')), ''), now(), v_actor)
    on conflict (user_id)
    do update
      set reason = excluded.reason,
          created_at = now(),
          created_by = v_actor;

    if to_regclass('public.app_state') is not null then
      delete from public.app_state where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('app_state', v_deleted);
    end if;

    if to_regclass('public.leaderboard') is not null then
      delete from public.leaderboard where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('leaderboard', v_deleted);
    end if;

    if to_regclass('public.duel_player_stats') is not null then
      delete from public.duel_player_stats where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_player_stats', v_deleted);
    end if;

    if to_regclass('public.game_attempt_history') is not null then
      delete from public.game_attempt_history where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('game_attempt_history', v_deleted);
    end if;

    if to_regclass('public.rooms') is not null then
      delete from public.rooms where host_user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('rooms_hosted', v_deleted);
    end if;

    if to_regclass('public.room_players') is not null then
      delete from public.room_players where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('room_players', v_deleted);
    end if;

    if to_regclass('public.room_results') is not null then
      delete from public.room_results where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('room_results', v_deleted);
    end if;

    if to_regclass('public.duel_invites') is not null then
      delete from public.duel_invites where sender_user_id = p_target_user_id or recipient_user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_invites', v_deleted);
    end if;

    if to_regclass('public.duel_room_messages') is not null then
      delete from public.duel_room_messages where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_room_messages', v_deleted);
    end if;

    if to_regclass('public.public_messages') is not null then
      delete from public.public_messages where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('public_messages', v_deleted);
    end if;

    return jsonb_build_object(
      'ok', true,
      'action', 'ban',
      'target_user_id', p_target_user_id,
      'summary', v_summary
    );
  end if;

  delete from auth.users
  where id = p_target_user_id;

  if not found then
    raise exception 'Target account not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'delete',
    'target_user_id', p_target_user_id
  );
end;
$$;

revoke all on function public.owner_moderate_account(text, text, uuid) from public;
revoke all on function public.owner_moderate_account(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account(text, text, uuid) to authenticated;

-- Versioned stable RPC name for client calls (prevents schema-cache collisions with overloaded names).
create or replace function public.owner_moderate_account_v1(
  action text,
  reason text,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account(action, reason, target_user_id);
end;
$$;

revoke all on function public.owner_moderate_account_v1(text, text, uuid) from public;
revoke all on function public.owner_moderate_account_v1(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account_v1(text, text, uuid) to authenticated;

-- Restrictive "not banned" policies so banned users cannot write progress/scores.
do $$
begin
  if to_regclass('public.app_state') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_state' and policyname = 'app_state_block_banned_insert'
  ) then
    execute 'create policy app_state_block_banned_insert on public.app_state as restrictive for insert to authenticated with check (not public.is_user_banned(auth.uid()))';
  end if;

  if to_regclass('public.app_state') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_state' and policyname = 'app_state_block_banned_update'
  ) then
    execute 'create policy app_state_block_banned_update on public.app_state as restrictive for update to authenticated using (not public.is_user_banned(auth.uid())) with check (not public.is_user_banned(auth.uid()))';
  end if;

  if to_regclass('public.leaderboard') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leaderboard' and policyname = 'leaderboard_block_banned_insert'
  ) then
    execute 'create policy leaderboard_block_banned_insert on public.leaderboard as restrictive for insert to authenticated with check (not public.is_user_banned(auth.uid()))';
  end if;

  if to_regclass('public.leaderboard') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leaderboard' and policyname = 'leaderboard_block_banned_update'
  ) then
    execute 'create policy leaderboard_block_banned_update on public.leaderboard as restrictive for update to authenticated using (not public.is_user_banned(auth.uid())) with check (not public.is_user_banned(auth.uid()))';
  end if;

  if to_regclass('public.profiles') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_block_banned_update'
  ) then
    execute 'create policy profiles_block_banned_update on public.profiles as restrictive for update to authenticated using (not public.is_user_banned(auth.uid())) with check (not public.is_user_banned(auth.uid()))';
  end if;

  if to_regclass('public.public_messages') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'public_messages' and policyname = 'public_messages_block_banned_insert'
  ) then
    execute 'create policy public_messages_block_banned_insert on public.public_messages as restrictive for insert to authenticated with check (not public.is_user_banned(auth.uid()))';
  end if;
end $$;

-- Keep banned users out of "online now" lists and counters.
create or replace function public.get_online_users_count(minutes_interval int default 5)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_minutes int := greatest(1, least(coalesce(minutes_interval, 5), 60));
begin
  if to_regclass('public.profiles') is null then
    return 0;
  end if;

  execute
    'select count(*)::int
       from public.profiles p
      where p.last_active is not null
        and p.last_active > now() - ($1 || '' minutes'')::interval
        and not public.is_user_banned(p.user_id)'
  into v_count
  using v_minutes;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.list_online_1v1_users(
  p_minutes_interval int default 5
)
returns table (
  user_id uuid,
  username text,
  avatar_path text,
  supporter_tier text,
  last_active timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_minutes int := greatest(1, least(coalesce(p_minutes_interval, 5), 60));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if to_regclass('public.profiles') is null then
    return;
  end if;

  return query
  execute
    'select
        p.user_id,
        p.username,
        p.avatar_path,
        p.supporter_tier,
        p.last_active
      from public.profiles p
      where p.user_id <> $1
        and p.last_active is not null
        and p.last_active > now() - ($2 || '' minutes'')::interval
        and not public.is_user_banned(p.user_id)
      order by p.last_active desc, p.username asc'
  using v_uid, v_minutes;
end;
$$;
