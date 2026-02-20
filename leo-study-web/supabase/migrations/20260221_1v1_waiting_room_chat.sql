-- Private room chat for 1v1 waiting room (participants only).

create table if not exists public.duel_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_duel_room_messages_room_created
  on public.duel_room_messages (room_id, created_at desc);

alter table public.duel_room_messages enable row level security;

drop policy if exists duel_room_messages_select_participants on public.duel_room_messages;
create policy duel_room_messages_select_participants
on public.duel_room_messages
for select
using (public.is_room_participant(room_id, auth.uid()));

drop policy if exists duel_room_messages_insert_waiting_participants on public.duel_room_messages;
create policy duel_room_messages_insert_waiting_participants
on public.duel_room_messages
for insert
with check (
  auth.uid() = user_id
  and public.is_room_participant(room_id, auth.uid())
  and exists (
    select 1
    from public.rooms r
    where r.id = room_id
      and r.status = 'waiting'
  )
  and nullif(trim(message), '') is not null
  and char_length(trim(message)) between 1 and 240
);

create or replace function public.list_1v1_waiting_chat_messages(
  p_room_id uuid,
  p_limit integer default 60
)
returns table (
  id uuid,
  room_id uuid,
  user_id uuid,
  display_name text,
  message text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 60), 200));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_room_participant(p_room_id, v_uid) then
    raise exception 'Only room participants can view waiting-room chat';
  end if;

  return query
  with recent as (
    select
      m.id,
      m.room_id,
      m.user_id,
      m.display_name,
      m.message,
      m.created_at
    from public.duel_room_messages m
    where m.room_id = p_room_id
    order by m.created_at desc
    limit v_limit
  )
  select
    recent.id,
    recent.room_id,
    recent.user_id,
    recent.display_name,
    recent.message,
    recent.created_at
  from recent
  order by recent.created_at asc;
end;
$$;

create or replace function public.send_1v1_waiting_chat_message(
  p_room_id uuid,
  p_message text
)
returns table (
  id uuid,
  room_id uuid,
  user_id uuid,
  display_name text,
  message text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_message text := left(trim(coalesce(p_message, '')), 240);
  v_name text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_room_participant(p_room_id, v_uid) then
    raise exception 'Only room participants can send waiting-room chat messages';
  end if;

  if not exists (
    select 1
    from public.rooms r
    where r.id = p_room_id
      and r.status = 'waiting'
  ) then
    raise exception 'Chat is only available while waiting for the match to start';
  end if;

  if v_clean_message = '' then
    raise exception 'Message cannot be empty';
  end if;

  select coalesce(nullif(trim(p.username), ''), 'User ' || left(v_uid::text, 8))
  into v_name
  from public.profiles p
  where p.user_id = v_uid;

  if v_name is null then
    v_name := 'User ' || left(v_uid::text, 8);
  end if;

  return query
  insert into public.duel_room_messages (
    room_id,
    user_id,
    display_name,
    message
  ) values (
    p_room_id,
    v_uid,
    v_name,
    v_clean_message
  )
  returning
    duel_room_messages.id,
    duel_room_messages.room_id,
    duel_room_messages.user_id,
    duel_room_messages.display_name,
    duel_room_messages.message,
    duel_room_messages.created_at;
end;
$$;

grant select, insert on public.duel_room_messages to authenticated;
grant execute on function public.list_1v1_waiting_chat_messages(uuid, integer) to authenticated;
grant execute on function public.send_1v1_waiting_chat_message(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'duel_room_messages'
  ) then
    alter publication supabase_realtime add table public.duel_room_messages;
  end if;
end $$;
