-- Scope 1v1 leaderboards and direct invites to the active class.
-- Existing Class 180 duel stats are preserved and attached to the Class 180 workspace.

alter table public.rooms
  add column if not exists class_id uuid references public.academy_classes(id) on delete set null;

alter table public.duel_invites
  add column if not exists class_id uuid references public.academy_classes(id) on delete cascade;

update public.duel_player_stats
set class_id = (select id from public.academy_classes where class_name = 'Class 180' limit 1)
where class_id is null
  and (select id from public.academy_classes where class_name = 'Class 180' limit 1) is not null;

update public.rooms
set class_id = coalesce(
  public.get_active_class_id(host_user_id),
  (select id from public.academy_classes where class_name = 'Class 180' limit 1)
)
where class_id is null;

update public.duel_invites di
set class_id = coalesce(
  (select r.class_id from public.rooms r where r.id = di.room_id),
  public.get_active_class_id(di.sender_user_id),
  (select id from public.academy_classes where class_name = 'Class 180' limit 1)
)
where di.class_id is null;

alter table public.duel_player_stats
  alter column class_id set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.duel_player_stats'::regclass
      and conname = 'duel_player_stats_pkey'
  ) then
    alter table public.duel_player_stats drop constraint duel_player_stats_pkey;
  end if;
end $$;

alter table public.duel_player_stats
  add constraint duel_player_stats_pkey primary key (class_id, user_id, game_type);

create index if not exists idx_rooms_class_status_public_created
  on public.rooms (class_id, status, is_public, created_at desc);

create index if not exists idx_duel_invites_class_recipient_pending
  on public.duel_invites (class_id, recipient_user_id, status, created_at desc);

create or replace function public.create_1v1_room_v2(
  p_game_type text,
  p_category text,
  p_is_public boolean default true,
  p_rounds integer default 10,
  p_powerups_enabled boolean default false,
  p_blaster_duration_seconds integer default 30,
  p_blaster_sudden_death boolean default false,
  p_blaster_rope_limit integer default 900,
  p_blaster_overtime_enabled boolean default true,
  p_blaster_overtime_after_seconds integer default 45
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_class_id uuid := public.get_active_class_id(auth.uid());
  v_room_id uuid;
  v_game_type text := lower(trim(coalesce(p_game_type, '')));
  v_join_code text;
  v_overtime_after_seconds integer := greatest(45, least(coalesce(p_blaster_overtime_after_seconds, 45), 90));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_class_id is null then
    raise exception 'Join a class before creating 1v1 rooms';
  end if;

  if v_game_type = 'connect4' then
    if not public.connect4_feature_enabled() then
      raise exception 'Connect 4 is disabled';
    end if;

    v_join_code := case when coalesce(p_is_public, true) then null else public.generate_room_join_code() end;

    insert into public.rooms (
      class_id,
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
      v_class_id,
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
  end if;

  v_room_id := public.create_1v1_room(
    p_game_type,
    p_category,
    p_is_public,
    p_rounds,
    p_powerups_enabled,
    p_blaster_duration_seconds,
    p_blaster_sudden_death,
    p_blaster_rope_limit
  );

  update public.rooms
  set
    class_id = v_class_id,
    settings = case
      when v_game_type = 'blaster' then coalesce(settings, '{}'::jsonb) || jsonb_build_object(
        'blaster_overtime_enabled', coalesce(p_blaster_overtime_enabled, true),
        'blaster_overtime_after_seconds', v_overtime_after_seconds
      )
      else settings
    end
  where id = v_room_id;

  return v_room_id;
end;
$$;

create or replace function public.join_1v1_room(
  p_room_id uuid default null,
  p_join_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_class_id uuid := public.get_active_class_id(auth.uid());
  v_room public.rooms%rowtype;
  v_slot integer;
  v_players integer;
  v_code text := trim(coalesce(p_join_code, ''));
  v_is_invite_room boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_class_id is null then
    raise exception 'Join a class before joining 1v1 rooms';
  end if;

  if p_room_id is not null then
    select * into v_room
    from public.rooms
    where id = p_room_id;
  elsif v_code <> '' then
    select * into v_room
    from public.rooms
    where join_code = v_code;
  else
    raise exception 'Room id or join code required';
  end if;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if coalesce(v_room.class_id, v_class_id) <> v_class_id then
    raise exception 'This room belongs to another class';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Room is not joinable';
  end if;

  if exists (
    select 1 from public.room_players rp
    where rp.room_id = v_room.id and rp.user_id = v_uid
  ) then
    return v_room.id;
  end if;

  if to_regclass('public.duel_invites') is not null then
    select exists (
      select 1
      from public.duel_invites di
      where di.room_id = v_room.id
    )
    into v_is_invite_room;
  end if;

  if v_is_invite_room then
    if not exists (
      select 1
      from public.duel_invites di
      where di.room_id = v_room.id
        and di.class_id = v_class_id
        and (di.sender_user_id = v_uid or di.recipient_user_id = v_uid)
    ) then
      raise exception 'This room is invite-only';
    end if;
  elsif not v_room.is_public and v_code = '' then
    raise exception 'Private rooms require a join code';
  end if;

  select count(*)::int into v_players
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_players >= 2 then
    raise exception 'Room is full';
  end if;

  if not exists (select 1 from public.room_players rp where rp.room_id = v_room.id and rp.slot_no = 1) then
    v_slot := 1;
  else
    v_slot := 2;
  end if;

  insert into public.room_players (room_id, user_id, slot_no, is_ready)
  values (v_room.id, v_uid, v_slot, false);

  return v_room.id;
end;
$$;

create or replace function public.create_1v1_invite(
  p_target_user_id uuid,
  p_game_type text,
  p_category text,
  p_rounds integer default 10,
  p_powerups_enabled boolean default false,
  p_blaster_duration_seconds integer default 30,
  p_blaster_sudden_death boolean default false,
  p_blaster_rope_limit integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_class_id uuid := public.get_active_class_id(auth.uid());
  v_target_online boolean := false;
  v_room_id uuid;
  v_invite_id uuid;
  v_game_type text := lower(trim(p_game_type));
  v_category text := lower(trim(p_category));
  v_rounds integer := greatest(5, least(coalesce(p_rounds, 10), 50));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_class_id is null then
    raise exception 'Join a class before sending 1v1 invites';
  end if;

  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid invite target';
  end if;

  if not public.is_class_member(v_class_id, p_target_user_id) then
    raise exception 'You can only invite classmates';
  end if;

  if v_game_type not in ('quiz', 'matching', 'blaster') then
    raise exception 'Invalid game type';
  end if;

  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_game_type in ('matching', 'blaster') and v_category = 'scenarios' then
    v_category := 'all';
  end if;

  if v_game_type = 'matching' then
    v_rounds := 5;
  elsif v_game_type = 'blaster' then
    v_rounds := 50;
  end if;

  select exists (
    select 1
    from public.profiles p
    join public.class_memberships cm
      on cm.user_id = p.user_id
     and cm.class_id = v_class_id
     and cm.status = 'active'
    where p.user_id = p_target_user_id
      and p.last_active is not null
      and p.last_active > now() - interval '5 minutes'
  ) into v_target_online;

  if not v_target_online then
    raise exception 'Classmate is not currently online';
  end if;

  update public.duel_invites
  set status = 'cancelled', responded_at = now()
  where class_id = v_class_id
    and sender_user_id = v_uid
    and recipient_user_id = p_target_user_id
    and status = 'pending';

  v_room_id := public.create_1v1_room(
    v_game_type,
    v_category,
    false,
    v_rounds,
    case when v_game_type = 'blaster' then coalesce(p_powerups_enabled, false) else false end,
    coalesce(p_blaster_duration_seconds, 30),
    case when v_game_type = 'blaster' then coalesce(p_blaster_sudden_death, false) else false end,
    coalesce(p_blaster_rope_limit, 900)
  );

  update public.rooms
  set class_id = v_class_id
  where id = v_room_id;

  insert into public.duel_invites (class_id, sender_user_id, recipient_user_id, room_id, game_type, category, rounds, status, expires_at)
  values (v_class_id, v_uid, p_target_user_id, v_room_id, v_game_type, v_category, v_rounds, 'pending', now() + interval '5 minutes')
  returning id into v_invite_id;

  return jsonb_build_object('invite_id', v_invite_id, 'room_id', v_room_id, 'status', 'pending');
end;
$$;

create or replace function public.create_1v1_invite_v2(
  p_target_user_id uuid,
  p_game_type text,
  p_category text,
  p_rounds integer default 10,
  p_powerups_enabled boolean default false,
  p_blaster_duration_seconds integer default 30,
  p_blaster_sudden_death boolean default false,
  p_blaster_rope_limit integer default 900,
  p_blaster_overtime_enabled boolean default true,
  p_blaster_overtime_after_seconds integer default 45
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_class_id uuid := public.get_active_class_id(auth.uid());
  v_result jsonb;
  v_room_id uuid;
  v_invite_id uuid;
  v_target_online boolean := false;
  v_game_type text := lower(trim(coalesce(p_game_type, '')));
  v_category text := lower(trim(coalesce(p_category, 'all')));
  v_overtime_after_seconds integer := greatest(45, least(coalesce(p_blaster_overtime_after_seconds, 45), 90));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_class_id is null then
    raise exception 'Join a class before sending 1v1 invites';
  end if;

  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid invite target';
  end if;

  if not public.is_class_member(v_class_id, p_target_user_id) then
    raise exception 'You can only invite classmates';
  end if;

  if v_game_type = 'connect4' then
    if not public.connect4_feature_enabled() then
      raise exception 'Connect 4 is disabled';
    end if;

    select exists (
      select 1
      from public.profiles p
      join public.class_memberships cm
        on cm.user_id = p.user_id
       and cm.class_id = v_class_id
       and cm.status = 'active'
      where p.user_id = p_target_user_id
        and p.last_active is not null
        and p.last_active > now() - interval '5 minutes'
    ) into v_target_online;

    if not v_target_online then
      raise exception 'Classmate is not currently online';
    end if;

    update public.duel_invites
    set status = 'cancelled', responded_at = now()
    where class_id = v_class_id
      and sender_user_id = v_uid
      and recipient_user_id = p_target_user_id
      and status = 'pending';

    v_room_id := public.create_1v1_room_v2('connect4', 'all', false, 42);

    update public.rooms
    set class_id = v_class_id
    where id = v_room_id;

    insert into public.duel_invites (class_id, sender_user_id, recipient_user_id, room_id, game_type, category, rounds, status, expires_at)
    values (v_class_id, v_uid, p_target_user_id, v_room_id, 'connect4', 'all', 42, 'pending', now() + interval '5 minutes')
    returning id into v_invite_id;

    return jsonb_build_object('invite_id', v_invite_id, 'room_id', v_room_id, 'status', 'pending');
  end if;

  v_result := public.create_1v1_invite(
    p_target_user_id,
    p_game_type,
    p_category,
    p_rounds,
    p_powerups_enabled,
    p_blaster_duration_seconds,
    p_blaster_sudden_death,
    p_blaster_rope_limit
  );

  if v_game_type = 'blaster' then
    v_room_id := nullif(v_result->>'room_id', '')::uuid;
    update public.rooms
    set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'blaster_overtime_enabled', coalesce(p_blaster_overtime_enabled, true),
      'blaster_overtime_after_seconds', v_overtime_after_seconds
    )
    where id = v_room_id;
  end if;

  return v_result;
end;
$$;

create or replace function public.list_pending_1v1_invites()
returns table (
  invite_id uuid,
  room_id uuid,
  sender_user_id uuid,
  sender_username text,
  sender_avatar_path text,
  game_type text,
  category text,
  rounds integer,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_class_id uuid := public.get_active_class_id(auth.uid());
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_class_id is null then
    return;
  end if;

  update public.duel_invites di
  set status = 'expired',
      responded_at = now()
  where di.recipient_user_id = v_uid
    and di.status = 'pending'
    and di.expires_at <= now();

  return query
  select
    di.id as invite_id,
    di.room_id,
    di.sender_user_id,
    coalesce(p.username, 'User ' || left(di.sender_user_id::text, 8)) as sender_username,
    coalesce(p.avatar_path, '') as sender_avatar_path,
    di.game_type,
    di.category,
    di.rounds,
    di.created_at,
    di.expires_at
  from public.duel_invites di
  left join public.profiles p on p.user_id = di.sender_user_id
  join public.rooms r on r.id = di.room_id
  where di.class_id = v_class_id
    and di.recipient_user_id = v_uid
    and di.status = 'pending'
    and di.expires_at > now()
    and r.status in ('waiting', 'in_progress')
  order by di.created_at desc
  limit 12;
end;
$$;

create or replace function public.list_public_1v1_rooms()
returns table (
  id uuid,
  game_type text,
  category text,
  rounds integer,
  created_at timestamptz,
  host_user_id uuid,
  status text,
  settings jsonb,
  player_count integer,
  players jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid := public.get_active_class_id(auth.uid());
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_class_id is null then
    return;
  end if;

  perform public.cleanup_inactive_1v1_rooms();

  return query
  select
    r.id,
    r.game_type,
    r.category,
    r.rounds,
    r.created_at,
    r.host_user_id,
    r.status,
    coalesce(r.settings, '{}'::jsonb) as settings,
    count(rp.id)::int as player_count,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', rp.user_id,
        'display_name', coalesce(nullif(trim(p.username), ''), concat('User ', left(rp.user_id::text, 8))),
        'agency', coalesce(p.agency, ''),
        'is_host', rp.user_id = r.host_user_id or rp.slot_no = 1,
        'ready', rp.is_ready,
        'score', rp.score
      )
      order by rp.slot_no
    ) filter (where rp.user_id is not null), '[]'::jsonb) as players
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  left join public.profiles p on p.user_id = rp.user_id
  where r.class_id = v_class_id
    and r.is_public = true
    and r.status in ('waiting', 'in_progress')
  group by r.id
  having count(rp.id) > 0
  or r.status = 'in_progress'
  order by
    case r.status
      when 'in_progress' then 0
      when 'waiting' then 1
      else 2
    end,
    r.created_at desc
  limit 50;
end;
$$;

create or replace function public.respond_1v1_invite(
  p_invite_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.duel_invites%rowtype;
  v_room public.rooms%rowtype;
  v_room_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_invite
  from public.duel_invites
  where id = p_invite_id
    and recipient_user_id = v_uid
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;

  if v_invite.class_id is not null and not public.is_class_member(v_invite.class_id, v_uid) then
    raise exception 'Invite is not for your class';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Invite already handled';
  end if;

  if v_invite.expires_at <= now() then
    update public.duel_invites
    set status = 'expired',
        responded_at = now()
    where id = v_invite.id;
    raise exception 'Invite expired';
  end if;

  if not p_accept then
    update public.duel_invites
    set status = 'declined',
        responded_at = now()
    where id = v_invite.id;

    return jsonb_build_object('accepted', false, 'room_id', null, 'status', 'declined');
  end if;

  select *
  into v_room
  from public.rooms
  where id = v_invite.room_id
  for update;

  if v_room.id is null then
    update public.duel_invites
    set status = 'expired',
        responded_at = now()
    where id = v_invite.id;
    raise exception 'Invite room no longer exists';
  end if;

  if v_room.status not in ('waiting', 'in_progress') then
    update public.duel_invites
    set status = 'expired',
        responded_at = now()
    where id = v_invite.id;
    raise exception 'Invite room is no longer joinable';
  end if;

  begin
    v_room_id := public.join_1v1_room(v_invite.room_id, null);
  exception
    when others then
      update public.duel_invites
      set status = 'expired',
          responded_at = now()
      where id = v_invite.id;
      raise;
  end;

  update public.duel_invites
  set status = 'accepted',
      responded_at = now()
  where id = v_invite.id;

  return jsonb_build_object('accepted', true, 'room_id', v_room_id, 'status', 'accepted');
end;
$$;

create or replace function public.process_1v1_room_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player record;
  v_mode text;
  v_modes text[];
  v_is_winner boolean;
  v_old_streak integer := 0;
  v_winner_user_id uuid;
  v_loser_user_id uuid;
  v_winner_name text;
  v_loser_name text;
  v_game_type text := new.game_type;
  v_room_class_id uuid := coalesce(new.class_id, public.get_active_class_id(new.host_user_id));
begin
  if new.status <> 'completed' then
    return new;
  end if;

  if old.status = 'completed' then
    return new;
  end if;

  if new.winner_user_id is null then
    return new;
  end if;

  if v_room_class_id is null then
    select id into v_room_class_id from public.academy_classes where class_name = 'Class 180' limit 1;
  end if;

  v_winner_user_id := new.winner_user_id;
  select coalesce(p.username, 'Unknown') into v_winner_name
  from public.profiles p
  where p.user_id = v_winner_user_id;

  v_modes := array['all', new.game_type];

  for v_player in
    select rp.user_id
    from public.room_players rp
    where rp.room_id = new.id
  loop
    v_is_winner := v_player.user_id = new.winner_user_id;

    if not v_is_winner then
      v_loser_user_id := v_player.user_id;
      select coalesce(p.username, 'Unknown') into v_loser_name
      from public.profiles p
      where p.user_id = v_loser_user_id;
    end if;

    foreach v_mode in array v_modes
    loop
      select current_win_streak into v_old_streak
      from public.duel_player_stats
      where class_id = v_room_class_id
        and user_id = v_player.user_id
        and game_type = v_mode;

      insert into public.duel_player_stats (
        class_id,
        user_id,
        game_type,
        wins,
        losses,
        matches_played,
        current_win_streak,
        best_win_streak
      ) values (
        v_room_class_id,
        v_player.user_id,
        v_mode,
        case when v_is_winner then 1 else 0 end,
        case when v_is_winner then 0 else 1 end,
        1,
        case when v_is_winner then 1 else 0 end,
        case when v_is_winner then 1 else 0 end
      )
      on conflict (class_id, user_id, game_type)
      do update set
        wins = public.duel_player_stats.wins + excluded.wins,
        losses = public.duel_player_stats.losses + excluded.losses,
        matches_played = public.duel_player_stats.matches_played + 1,
        current_win_streak = case
          when excluded.wins = 1 then public.duel_player_stats.current_win_streak + 1
          else 0
        end,
        best_win_streak = greatest(
          public.duel_player_stats.best_win_streak,
          case
            when excluded.wins = 1 then public.duel_player_stats.current_win_streak + 1
            else public.duel_player_stats.best_win_streak
          end
        ),
        updated_at = now();

      if not v_is_winner and v_mode = 'all' and coalesce(v_old_streak, 0) > 0 then
        perform public.notify_streak_loss(v_loser_user_id, v_loser_name, v_winner_user_id, v_winner_name, v_old_streak, v_game_type);
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_rooms_process_1v1_stats on public.rooms;
create trigger trg_rooms_process_1v1_stats
after update of status on public.rooms
for each row
execute function public.process_1v1_room_completion();

revoke all on function public.create_1v1_invite(uuid, text, text, integer, boolean, integer, boolean, integer) from public, anon;
grant execute on function public.create_1v1_invite(uuid, text, text, integer, boolean, integer, boolean, integer) to authenticated, service_role;
revoke all on function public.create_1v1_room_v2(text, text, boolean, integer, boolean, integer, boolean, integer, boolean, integer) from public, anon;
grant execute on function public.create_1v1_room_v2(text, text, boolean, integer, boolean, integer, boolean, integer, boolean, integer) to authenticated, service_role;
revoke all on function public.create_1v1_invite_v2(uuid, text, text, integer, boolean, integer, boolean, integer, boolean, integer) from public, anon;
grant execute on function public.create_1v1_invite_v2(uuid, text, text, integer, boolean, integer, boolean, integer, boolean, integer) to authenticated, service_role;
revoke all on function public.join_1v1_room(uuid, text) from public, anon;
grant execute on function public.join_1v1_room(uuid, text) to authenticated, service_role;
revoke all on function public.list_pending_1v1_invites() from public, anon;
grant execute on function public.list_pending_1v1_invites() to authenticated, service_role;
revoke all on function public.list_public_1v1_rooms() from public, anon;
grant execute on function public.list_public_1v1_rooms() to authenticated, service_role;
revoke all on function public.respond_1v1_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_1v1_invite(uuid, boolean) to authenticated, service_role;
