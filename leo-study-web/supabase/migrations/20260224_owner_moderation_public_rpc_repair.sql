-- PUBLIC RPC REPAIR (owner-gated internally)
-- Purpose:
-- 1) Ensure owner moderation RPC always appears in PostgREST schema cache.
-- 2) Avoid "Could not find the function ... in the schema cache" failures.
--
-- Security model:
-- - Function execute is granted broadly so PostgREST can resolve it for every role.
-- - Function itself enforces owner check before any mutation.

create table if not exists public.user_roles (
  user_id uuid primary key,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.banned_users (
  user_id uuid primary key,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid
);

alter table public.user_roles enable row level security;
alter table public.banned_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_roles' and policyname='user_roles_select_own'
  ) then
    create policy user_roles_select_own
    on public.user_roles
    for select
    using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='banned_users' and policyname='banned_users_select_self_or_owner'
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
          and lower(r.role) = 'owner'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='banned_users' and policyname='banned_users_write_owner_only'
  ) then
    create policy banned_users_write_owner_only
    on public.banned_users
    for all
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and lower(r.role) = 'owner'
      )
    )
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and lower(r.role) = 'owner'
      )
    );
  end if;
end $$;

grant select on public.user_roles to anon, authenticated;
grant select, insert, update, delete on public.banned_users to anon, authenticated;

create or replace function public.owner_moderate_account_json(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_target_user_id uuid := (p_payload ->> 'target_user_id')::uuid;
  v_action text := lower(trim(coalesce(p_payload ->> 'action', '')));
  v_reason text := nullif(trim(coalesce(p_payload ->> 'reason', '')), '');
  v_deleted integer := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.user_roles r
    where r.user_id = v_actor
      and lower(r.role) = 'owner'
  ) then
    raise exception 'Owner role required';
  end if;

  if v_target_user_id is null then
    raise exception 'Target account is required';
  end if;

  if v_target_user_id = v_actor then
    raise exception 'You cannot moderate your own account';
  end if;

  if v_action not in ('ban', 'delete') then
    raise exception 'Unsupported moderation action: %', v_action;
  end if;

  insert into public.banned_users (user_id, reason, created_at, created_by)
  values (v_target_user_id, v_reason, now(), v_actor)
  on conflict (user_id)
  do update
    set reason = excluded.reason,
        created_at = now(),
        created_by = excluded.created_by;

  if to_regclass('public.app_state') is not null then
    delete from public.app_state where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('app_state', v_deleted);
  end if;

  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('leaderboard', v_deleted);
  end if;

  if to_regclass('public.duel_player_stats') is not null then
    delete from public.duel_player_stats where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_player_stats', v_deleted);
  end if;

  if to_regclass('public.game_attempt_history') is not null then
    delete from public.game_attempt_history where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('game_attempt_history', v_deleted);
  end if;

  if to_regclass('public.rooms') is not null then
    delete from public.rooms where host_user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('rooms_hosted', v_deleted);
  end if;

  if to_regclass('public.room_players') is not null then
    delete from public.room_players where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('room_players', v_deleted);
  end if;

  if to_regclass('public.room_results') is not null then
    delete from public.room_results where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('room_results', v_deleted);
  end if;

  if to_regclass('public.duel_invites') is not null then
    delete from public.duel_invites where sender_user_id = v_target_user_id or recipient_user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_invites', v_deleted);
  end if;

  if to_regclass('public.duel_room_messages') is not null then
    delete from public.duel_room_messages where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_room_messages', v_deleted);
  end if;

  if to_regclass('public.public_messages') is not null then
    delete from public.public_messages where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('public_messages', v_deleted);
  end if;

  if v_action = 'delete' then
    begin
      delete from auth.users where id = v_target_user_id;
    exception
      when others then
        null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'target_user_id', v_target_user_id,
    'summary', v_summary
  );
end;
$$;

create or replace function public.owner_moderate_account_rpc(
  target_user_id uuid,
  action text,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_json(
    jsonb_build_object(
      'target_user_id', target_user_id::text,
      'action', action,
      'reason', reason
    )
  );
end;
$$;

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
  return public.owner_moderate_account_rpc(target_user_id, action, reason);
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
  return public.owner_moderate_account_rpc(p_target_user_id, p_action, p_reason);
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
  return public.owner_moderate_account_rpc(p_target_user_id, p_action, p_reason);
end;
$$;

grant execute on function public.owner_moderate_account_json(jsonb) to public, anon, authenticated;
grant execute on function public.owner_moderate_account_rpc(uuid, text, text) to public, anon, authenticated;
grant execute on function public.owner_moderate_account_v1(text, text, uuid) to public, anon, authenticated;
grant execute on function public.owner_moderate_account(text, text, uuid) to public, anon, authenticated;
grant execute on function public.owner_manage_account(uuid, text, text) to public, anon, authenticated;

select pg_notify('pgrst', 'reload schema');
