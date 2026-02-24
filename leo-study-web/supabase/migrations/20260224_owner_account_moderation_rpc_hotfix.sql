-- Owner moderation RPC hotfix
-- Goal: provide one stable, non-overloaded RPC entrypoint that PostgREST can always resolve.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

create table if not exists public.banned_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.banned_users enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'banned_users'
      and policyname = 'banned_users_select_self_or_owner'
  ) then
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
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'banned_users'
      and policyname = 'banned_users_insert_owner_only'
  ) then
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
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'banned_users'
      and policyname = 'banned_users_update_owner_only'
  ) then
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
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'banned_users'
      and policyname = 'banned_users_delete_owner_only'
  ) then
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
  end if;
end $$;

grant select on public.banned_users to authenticated;
grant insert, update, delete on public.banned_users to authenticated;

-- Remove ambiguous legacy overload that causes PostgREST RPC resolution failures.
drop function if exists public.owner_manage_account(text, text, uuid);

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

create or replace function public.owner_cleanup_user_data_for_moderation(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int := 0;
  v_summary jsonb := '{}'::jsonb;
begin
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

  return v_summary;
end;
$$;

create or replace function public.owner_moderation_core_v1(
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
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
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
    values (p_target_user_id, v_reason, now(), v_actor)
    on conflict (user_id)
    do update
      set reason = excluded.reason,
          created_at = now(),
          created_by = excluded.created_by;

    v_summary := public.owner_cleanup_user_data_for_moderation(p_target_user_id);

    return jsonb_build_object(
      'ok', true,
      'action', 'ban',
      'target_user_id', p_target_user_id,
      'summary', v_summary
    );
  end if;

  v_summary := public.owner_cleanup_user_data_for_moderation(p_target_user_id);

  delete from auth.users where id = p_target_user_id;
  if not found then
    raise exception 'Target account not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'delete',
    'target_user_id', p_target_user_id,
    'summary', v_summary
  );
end;
$$;

-- Stable RPC endpoint with explicit parameter names used by the web app.
create or replace function public.owner_moderate_account_json(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_raw text := trim(coalesce(p_payload ->> 'target_user_id', ''));
  v_target_user_id uuid;
  v_action text := lower(trim(coalesce(p_payload ->> 'action', '')));
  v_reason text := nullif(trim(coalesce(p_payload ->> 'reason', '')), '');
begin
  if p_payload is null then
    raise exception 'Payload is required';
  end if;

  if v_target_raw = '' then
    raise exception 'target_user_id is required';
  end if;

  begin
    v_target_user_id := v_target_raw::uuid;
  exception
    when others then
      raise exception 'target_user_id must be a valid uuid';
  end;

  return public.owner_moderation_core_v1(
    p_target_user_id => v_target_user_id,
    p_action => v_action,
    p_reason => v_reason
  );
end;
$$;

-- Backward-compatible RPC names used in older frontend builds.
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
  return public.owner_moderation_core_v1(target_user_id, action, reason);
end;
$$;

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
begin
  return public.owner_moderation_core_v1(p_target_user_id, p_action, p_reason);
end;
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
begin
  return public.owner_moderation_core_v1(p_target_user_id, p_action, p_reason);
end;
$$;

revoke all on function public.owner_cleanup_user_data_for_moderation(uuid) from public;
revoke all on function public.owner_cleanup_user_data_for_moderation(uuid) from anon;
grant execute on function public.owner_cleanup_user_data_for_moderation(uuid) to authenticated;

revoke all on function public.owner_moderation_core_v1(uuid, text, text) from public;
revoke all on function public.owner_moderation_core_v1(uuid, text, text) from anon;
grant execute on function public.owner_moderation_core_v1(uuid, text, text) to authenticated;

revoke all on function public.owner_moderate_account_json(jsonb) from public;
revoke all on function public.owner_moderate_account_json(jsonb) from anon;
grant execute on function public.owner_moderate_account_json(jsonb) to authenticated;

revoke all on function public.owner_moderate_account_v1(text, text, uuid) from public;
revoke all on function public.owner_moderate_account_v1(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account_v1(text, text, uuid) to authenticated;

revoke all on function public.owner_moderate_account(text, text, uuid) from public;
revoke all on function public.owner_moderate_account(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account(text, text, uuid) to authenticated;

revoke all on function public.owner_manage_account(uuid, text, text) from public;
revoke all on function public.owner_manage_account(uuid, text, text) from anon;
grant execute on function public.owner_manage_account(uuid, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
