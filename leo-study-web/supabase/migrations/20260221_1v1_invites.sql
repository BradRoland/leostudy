-- 1v1 direct invites:
-- - sender can invite an online user into a private room
-- - recipient gets a pending invite notification and can join/decline

create table if not exists public.duel_invites (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  game_type text not null check (game_type in ('quiz', 'matching')),
  category text not null check (category in ('all', 'pc', 'vc', 'hs', 'scenarios')),
  rounds integer not null check (rounds between 5 and 50),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

create index if not exists idx_duel_invites_recipient_pending
  on public.duel_invites (recipient_user_id, status, created_at desc);

create index if not exists idx_duel_invites_sender_pending
  on public.duel_invites (sender_user_id, status, created_at desc);

create unique index if not exists idx_duel_invites_one_pending_pair
  on public.duel_invites (sender_user_id, recipient_user_id)
  where status = 'pending';

alter table public.duel_invites enable row level security;

drop policy if exists duel_invites_select_participants on public.duel_invites;
create policy duel_invites_select_participants
on public.duel_invites
for select
using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

drop policy if exists duel_invites_insert_sender_only on public.duel_invites;
create policy duel_invites_insert_sender_only
on public.duel_invites
for insert
with check (auth.uid() = sender_user_id);

drop policy if exists duel_invites_update_participants on public.duel_invites;
create policy duel_invites_update_participants
on public.duel_invites
for update
using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id)
with check (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

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
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    p.user_id,
    p.username,
    p.avatar_path,
    p.supporter_tier,
    p.last_active
  from public.profiles p
  where p.user_id <> v_uid
    and p.last_active is not null
    and p.last_active > now() - (greatest(1, least(coalesce(p_minutes_interval, 5), 60))::text || ' minutes')::interval
  order by p.last_active desc, p.username asc;
end;
$$;

create or replace function public.create_1v1_invite(
  p_target_user_id uuid,
  p_game_type text,
  p_category text,
  p_rounds integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
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

  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid invite target';
  end if;

  if v_game_type not in ('quiz', 'matching') then
    raise exception 'Invalid game type';
  end if;

  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_game_type = 'matching' and v_category = 'scenarios' then
    v_category := 'all';
  end if;

  if v_game_type = 'matching' then
    v_rounds := 5;
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_target_user_id
      and p.last_active is not null
      and p.last_active > now() - interval '5 minutes'
  ) into v_target_online;

  if not v_target_online then
    raise exception 'User is not currently online';
  end if;

  update public.duel_invites
  set status = 'cancelled',
      responded_at = now()
  where sender_user_id = v_uid
    and recipient_user_id = p_target_user_id
    and status = 'pending';

  v_room_id := public.create_1v1_room(v_game_type, v_category, false, v_rounds);

  insert into public.duel_invites (
    sender_user_id,
    recipient_user_id,
    room_id,
    game_type,
    category,
    rounds,
    status,
    expires_at
  ) values (
    v_uid,
    p_target_user_id,
    v_room_id,
    v_game_type,
    v_category,
    v_rounds,
    'pending',
    now() + interval '5 minutes'
  )
  returning id into v_invite_id;

  return jsonb_build_object(
    'invite_id', v_invite_id,
    'room_id', v_room_id,
    'status', 'pending'
  );
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
begin
  if v_uid is null then
    raise exception 'Authentication required';
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
  where di.recipient_user_id = v_uid
    and di.status = 'pending'
    and di.expires_at > now()
    and r.status in ('waiting', 'in_progress')
  order by di.created_at desc
  limit 12;
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

    return jsonb_build_object(
      'accepted', false,
      'room_id', null,
      'status', 'declined'
    );
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

  return jsonb_build_object(
    'accepted', true,
    'room_id', v_room_id,
    'status', 'accepted'
  );
end;
$$;

grant select, insert, update on public.duel_invites to authenticated;

grant execute on function public.list_online_1v1_users(int) to authenticated;
grant execute on function public.create_1v1_invite(uuid, text, text, integer) to authenticated;
grant execute on function public.list_pending_1v1_invites() to authenticated;
grant execute on function public.respond_1v1_invite(uuid, boolean) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'duel_invites'
  ) then
    alter publication supabase_realtime add table public.duel_invites;
  end if;
end $$;
