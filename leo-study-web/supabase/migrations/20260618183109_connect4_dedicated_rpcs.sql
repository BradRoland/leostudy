create or replace function public.create_connect4_room(
  p_is_public boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_join_code text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.connect4_feature_enabled() then
    raise exception 'Connect 4 is disabled';
  end if;

  v_join_code := case when coalesce(p_is_public, true) then null else public.generate_room_join_code() end;

  insert into public.rooms (
    host_user_id,
    game_type,
    category,
    is_public,
    join_code,
    rounds,
    question_set,
    settings,
    status,
    current_round
  ) values (
    v_uid,
    'connect4',
    'all',
    coalesce(p_is_public, true),
    v_join_code,
    42,
    '[]'::jsonb,
    jsonb_build_object('connect4', public.default_connect4_state()),
    'waiting',
    1
  ) returning id into v_room_id;

  insert into public.room_players (room_id, user_id, slot_no, is_ready)
  values (v_room_id, v_uid, 1, false);

  return v_room_id;
end;
$$;

revoke all on function public.create_connect4_room(boolean) from public, anon;
grant execute on function public.create_connect4_room(boolean) to authenticated, service_role;

create or replace function public.create_connect4_invite(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_invite_id uuid;
  v_target_online boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid invite target';
  end if;

  if not public.connect4_feature_enabled() then
    raise exception 'Connect 4 is disabled';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_target_user_id
      and p.last_active is not null
      and p.last_active > now() - interval '5 minutes'
  ) into v_target_online;

  if not coalesce(v_target_online, false) then
    raise exception 'User is not currently online';
  end if;

  update public.duel_invites
  set status = 'cancelled', responded_at = now()
  where sender_user_id = v_uid
    and recipient_user_id = p_target_user_id
    and status = 'pending';

  v_room_id := public.create_connect4_room(false);

  insert into public.duel_invites (sender_user_id, recipient_user_id, room_id, game_type, category, rounds, status, expires_at)
  values (v_uid, p_target_user_id, v_room_id, 'connect4', 'all', 42, 'pending', now() + interval '5 minutes')
  returning id into v_invite_id;

  return jsonb_build_object('invite_id', v_invite_id, 'room_id', v_room_id, 'status', 'pending');
end;
$$;

revoke all on function public.create_connect4_invite(uuid) from public, anon;
grant execute on function public.create_connect4_invite(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

do $$
begin
  if to_regprocedure('public.create_1v1_room_legacy(text,text,boolean,integer,boolean,integer,boolean,integer)') is null then
    alter function public.create_1v1_room(text, text, boolean, integer, boolean, integer, boolean, integer)
      rename to create_1v1_room_legacy;
  end if;
end;
$$;

create or replace function public.create_1v1_room(
  p_game_type text,
  p_category text,
  p_is_public boolean default true,
  p_rounds integer default 10,
  p_powerups_enabled boolean default false,
  p_blaster_duration_seconds integer default 30,
  p_blaster_sudden_death boolean default false,
  p_blaster_rope_limit integer default 900
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_type text := lower(trim(coalesce(p_game_type, '')));
begin
  if v_game_type = 'connect4' then
    return public.create_connect4_room(p_is_public);
  end if;

  return public.create_1v1_room_legacy(
    p_game_type,
    p_category,
    p_is_public,
    p_rounds,
    p_powerups_enabled,
    p_blaster_duration_seconds,
    p_blaster_sudden_death,
    p_blaster_rope_limit
  );
end;
$$;

revoke all on function public.create_1v1_room(text, text, boolean, integer, boolean, integer, boolean, integer) from public, anon;
grant execute on function public.create_1v1_room(text, text, boolean, integer, boolean, integer, boolean, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
