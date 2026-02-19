-- Realtime 1v1 rooms, players, results, RLS, and server-side deck generation

create extension if not exists pgcrypto;

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  game_type text not null check (game_type in ('quiz', 'matching')),
  category text not null check (category in ('all', 'pc', 'vc', 'hs', 'scenarios')),
  is_public boolean not null default true,
  join_code text unique,
  rounds integer not null default 5 check (rounds between 5 and 50),
  question_set jsonb not null default '[]'::jsonb,
  status text not null default 'waiting' check (status in ('waiting', 'in_progress', 'completed', 'cancelled')),
  current_round integer not null default 1,
  winner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  constraint rooms_join_code_private_check check (
    (is_public = true and join_code is null)
    or (is_public = false and join_code ~ '^[0-9]{6}$')
  )
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_no integer not null check (slot_no between 1 and 2),
  is_ready boolean not null default false,
  score integer not null default 0,
  total_time_ms bigint not null default 0,
  current_round integer not null default 1,
  last_seen timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, slot_no)
);

create table if not exists public.room_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null default 0,
  total_time_ms bigint not null default 0,
  placement integer not null check (placement between 1 and 2),
  is_winner boolean not null default false,
  finished_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index if not exists idx_rooms_status_public_created on public.rooms (status, is_public, created_at desc);
create index if not exists idx_rooms_join_code on public.rooms (join_code);
create index if not exists idx_rooms_host on public.rooms (host_user_id);
create index if not exists idx_room_players_room on public.room_players (room_id);
create index if not exists idx_room_players_user on public.room_players (user_id);
create index if not exists idx_room_results_room on public.room_results (room_id);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_results enable row level security;

drop trigger if exists trg_rooms_updated_at on public.rooms;
create trigger trg_rooms_updated_at
before update on public.rooms
for each row
execute function public.set_timestamp_updated_at();

drop trigger if exists trg_room_players_updated_at on public.room_players;
create trigger trg_room_players_updated_at
before update on public.room_players
for each row
execute function public.set_timestamp_updated_at();

create or replace function public.is_room_participant(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = coalesce(p_user_id, auth.uid())
  );
$$;

grant execute on function public.is_room_participant(uuid, uuid) to authenticated;

-- Rooms: only participants can read room details.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rooms' and policyname = 'rooms_select_players_only'
  ) then
    create policy rooms_select_players_only
    on public.rooms
    for select
    using (
      exists (
        select 1
        from public.room_players rp
        where rp.room_id = rooms.id
          and rp.user_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rooms' and policyname = 'rooms_insert_host_only'
  ) then
    create policy rooms_insert_host_only
    on public.rooms
    for insert
    with check (auth.uid() = host_user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rooms' and policyname = 'rooms_update_players_only'
  ) then
    create policy rooms_update_players_only
    on public.rooms
    for update
    using (
      exists (
        select 1
        from public.room_players rp
        where rp.room_id = rooms.id
          and rp.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.room_players rp
        where rp.room_id = rooms.id
          and rp.user_id = auth.uid()
      )
    );
  end if;
end $$;

-- Room players: players can only manage their own row.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'room_players' and policyname = 'room_players_select_room_participants'
  ) then
    create policy room_players_select_room_participants
    on public.room_players
    for select
    using (public.is_room_participant(room_id, auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'room_players' and policyname = 'room_players_insert_self'
  ) then
    create policy room_players_insert_self
    on public.room_players
    for insert
    with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'room_players' and policyname = 'room_players_update_self'
  ) then
    create policy room_players_update_self
    on public.room_players
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

-- Results visible only to room participants.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'room_results' and policyname = 'room_results_select_room_participants'
  ) then
    create policy room_results_select_room_participants
    on public.room_results
    for select
    using (
      exists (
        select 1
        from public.room_players rp
        where rp.room_id = room_results.room_id
          and rp.user_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'room_results' and policyname = 'room_results_insert_self'
  ) then
    create policy room_results_insert_self
    on public.room_results
    for insert
    with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.generate_room_join_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.rooms where join_code = candidate);
  end loop;
  return candidate;
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
  player_count integer
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    r.game_type,
    r.category,
    r.rounds,
    r.created_at,
    r.host_user_id,
    count(rp.id)::int as player_count
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  where r.is_public = true
    and r.status = 'waiting'
  group by r.id
  having count(rp.id) < 2
  order by r.created_at desc
  limit 50;
$$;

grant execute on function public.list_public_1v1_rooms() to authenticated;

create or replace function public.create_1v1_room(
  p_game_type text,
  p_category text,
  p_is_public boolean default true,
  p_rounds integer default 10
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
  v_question_set jsonb := '[]'::jsonb;
  v_round integer;
  v_pool_count integer;
  v_pool jsonb := '[]'::jsonb;
  v_item jsonb;
  v_choices text[];
  v_choice text;
  v_choice_json jsonb;
  v_correct_index integer;
  v_records jsonb := '[]'::jsonb;
  v_round_pairs jsonb;
  v_idx integer;
  v_left text;
  v_right text;
  v_rounds integer := greatest(5, least(coalesce(p_rounds, 10), 50));
  v_category text := lower(trim(p_category));
  v_game_type text := lower(trim(p_game_type));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_game_type not in ('quiz', 'matching') then
    raise exception 'Invalid game type';
  end if;

  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_game_type = 'matching' and v_category = 'scenarios' then
    raise exception 'Matching does not support SCENARIOS';
  end if;

  if v_game_type = 'matching' then
    v_rounds := 5;
  end if;

  if v_game_type = 'quiz' then
    if v_category = 'scenarios' then
      with base as (
        select
          c.id,
          coalesce(nullif(trim(c.scenario), ''), trim(c.title)) as prompt,
          coalesce(nullif(trim(c.answer), ''), 'Use the most lawful option based on facts.') as correct_answer,
          coalesce(c.scenario_questions, '[]'::jsonb) as scenario_questions,
          coalesce(nullif(trim(c.explanation), ''), 'Use lawful authority and articulable facts.') as explanation
        from public.content_items c
        where c.is_published = true
          and c.type = 'scenario'
          and nullif(trim(coalesce(c.scenario, c.title)), '') is not null
        order by random()
        limit 120
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    else
      with base as (
        select
          c.id,
          trim(c.title) as title,
          trim(c.code_section) as code_section,
          coalesce(nullif(trim(c.explanation), ''), trim(c.question), trim(c.answer), '') as explanation
        from public.content_items c
        where c.is_published = true
          and c.type in ('code', 'question')
          and nullif(trim(c.title), '') is not null
          and nullif(trim(c.code_section), '') is not null
          and (
            v_category = 'all'
            or (v_category = 'pc' and lower(c.category) in ('pc', 'penal', 'penal code'))
            or (v_category = 'vc' and lower(c.category) in ('vc', 'vehicle', 'vehicle code'))
            or (v_category = 'hs' and lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety'))
        )
        order by random()
        limit 220
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    end if;

    if v_pool_count < v_rounds then
      raise exception 'Not enough content to generate % quiz rounds', v_rounds;
    end if;

    for v_round in 1..v_rounds loop
      v_item := v_pool -> ((v_round - 1) % v_pool_count);

      if v_category = 'scenarios' then
        v_choices := array[]::text[];
        for v_choice in
          select value::text
          from jsonb_array_elements_text(coalesce(v_item->'scenario_questions', '[]'::jsonb))
        loop
          if length(trim(v_choice)) > 0 then
            v_choices := array_append(v_choices, trim(v_choice));
          end if;
        end loop;

        if coalesce(array_length(v_choices, 1), 0) < 2 then
          v_choices := array[
            (v_item->>'correct_answer'),
            'Document observations and seek corroborating evidence.',
            'Delay enforcement action until legal elements are established.',
            'Prioritize scene safety and gather witness statements.'
          ];
        end if;

        if not ((v_item->>'correct_answer') = any(v_choices)) then
          v_choices := array_append(v_choices, (v_item->>'correct_answer'));
        end if;

        v_choices := (select array_agg(value) from (select distinct unnest(v_choices) as value) t where length(trim(value)) > 0);
        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (
            select value
            from unnest(v_choices) as value
            order by random()
            limit 4
          ) s
        );

        if jsonb_array_length(v_choice_json) < 2 then
          raise exception 'Unable to generate scenario choices';
        end if;

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'correct_answer') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', v_item->>'prompt',
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation'
          )
        );
      else
        v_choices := array[(v_item->>'title')];

        for v_choice in
          select elem->>'title'
          from jsonb_array_elements(v_pool) as elem
          where (elem->>'id') <> (v_item->>'id')
          order by random()
          limit 3
        loop
          v_choices := array_append(v_choices, v_choice);
        end loop;

        v_choice_json := (
          select jsonb_agg(value)
          from (
            select value
            from unnest(v_choices) as value
            order by random()
          ) s
        );

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'title') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', concat('What best matches ', coalesce(v_item->>'code_section', 'this code section'), '?'),
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation',
            'sourceLabel', v_item->>'code_section'
          )
        );
      end if;
    end loop;
  else
    with base as (
      select
        c.id,
        trim(c.code_section) as code_section,
        trim(c.title) as title
      from public.content_items c
      where c.is_published = true
        and c.type in ('code', 'question')
        and nullif(trim(c.title), '') is not null
        and nullif(trim(c.code_section), '') is not null
        and (
          v_category = 'all'
          or (v_category = 'pc' and lower(c.category) in ('pc', 'penal', 'penal code'))
          or (v_category = 'vc' and lower(c.category) in ('vc', 'vehicle', 'vehicle code'))
          or (v_category = 'hs' and lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety'))
        )
      order by random()
      limit 180
    )
    select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
    into v_pool, v_pool_count
    from base;

    if v_pool_count < 3 then
      raise exception 'Not enough content to generate matching rounds';
    end if;

    v_records := '[]'::jsonb;
    for v_round in 1..v_rounds loop
      v_round_pairs := '[]'::jsonb;
      for v_idx in 0..2 loop
        v_item := v_pool -> ((v_round * 3 + v_idx - 1) % v_pool_count);
        v_left := v_item->>'code_section';
        v_right := v_item->>'title';
        v_round_pairs := v_round_pairs || jsonb_build_array(
          jsonb_build_object(
            'pairId', gen_random_uuid(),
            'left', v_left,
            'right', v_right
          )
        );
      end loop;
      v_records := v_records || jsonb_build_array(
        jsonb_build_object(
          'round', v_round,
          'pairs', v_round_pairs
        )
      );
    end loop;
    v_question_set := v_records;
  end if;

  v_join_code := case when p_is_public then null else public.generate_room_join_code() end;

  insert into public.rooms (
    host_user_id,
    game_type,
    category,
    is_public,
    join_code,
    rounds,
    question_set,
    status,
    current_round
  ) values (
    v_uid,
    v_game_type,
    v_category,
    p_is_public,
    v_join_code,
    v_rounds,
    v_question_set,
    'waiting',
    1
  )
  returning id into v_room_id;

  insert into public.room_players (room_id, user_id, slot_no, is_ready)
  values (v_room_id, v_uid, 1, false);

  return v_room_id;
end;
$$;

grant execute on function public.create_1v1_room(text, text, boolean, integer) to authenticated;

create or replace function public.create_1v1_room(
  p_game_type text,
  p_category text,
  p_is_public boolean default true
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.create_1v1_room(p_game_type, p_category, p_is_public, 10);
$$;

grant execute on function public.create_1v1_room(text, text, boolean) to authenticated;

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
  v_room public.rooms%rowtype;
  v_slot integer;
  v_players integer;
  v_code text := trim(coalesce(p_join_code, ''));
begin
  if v_uid is null then
    raise exception 'Authentication required';
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

  if v_room.status <> 'waiting' then
    raise exception 'Room is not joinable';
  end if;

  if exists (
    select 1 from public.room_players rp
    where rp.room_id = v_room.id and rp.user_id = v_uid
  ) then
    return v_room.id;
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

grant execute on function public.join_1v1_room(uuid, text) to authenticated;

create or replace function public.set_1v1_ready(
  p_room_id uuid,
  p_ready boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ready_count integer;
  v_player_count integer;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update public.room_players
  set is_ready = p_ready,
      last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid;

  if not found then
    raise exception 'Not in room';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  select status into v_status from public.rooms where id = p_room_id;

  if v_status = 'waiting' and v_player_count = 2 and v_ready_count = 2 then
    update public.rooms
    set status = 'in_progress',
        started_at = coalesce(started_at, now()),
        current_round = 1
    where id = p_room_id
      and status = 'waiting';
    v_status := 'in_progress';
  end if;

  return coalesce(v_status, 'waiting');
end;
$$;

grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;

create or replace function public.submit_1v1_round(
  p_room_id uuid,
  p_round integer,
  p_correct boolean,
  p_elapsed_ms integer,
  p_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_points integer;
  v_elapsed integer;
  v_rounds integer;
  v_players_finished integer;
  v_total_players integer;
  v_winner uuid;
  v_results jsonb := '[]'::jsonb;
  v_row record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'Room not found';
  end if;
  if v_room.status not in ('in_progress', 'completed') then
    raise exception 'Room is not active';
  end if;

  v_rounds := v_room.rounds;
  v_elapsed := greatest(0, least(coalesce(p_elapsed_ms, 0), 300000));

  if v_room.game_type = 'quiz' then
    v_points := case when p_correct then 100 else 0 end;
  else
    v_points := case when p_correct then 100 else 0 end;
  end if;

  update public.room_players
  set
    score = score + v_points,
    total_time_ms = total_time_ms + v_elapsed,
    current_round = greatest(current_round, least(p_round + 1, v_rounds + 1)),
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round <= p_round;

  select count(*)::int,
         count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 and v_room.status <> 'completed' then
    select rp.user_id
    into v_winner
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, rp.total_time_ms asc, rp.joined_at asc
    limit 1;

    for v_row in
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        row_number() over (order by rp.score desc, rp.total_time_ms asc, rp.joined_at asc) as placement
      from public.room_players rp
      where rp.room_id = p_room_id
      order by placement
    loop
      insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
      values (p_room_id, v_row.user_id, v_row.score, v_row.total_time_ms, v_row.placement, v_row.user_id = v_winner)
      on conflict (room_id, user_id)
      do update set
        score = excluded.score,
        total_time_ms = excluded.total_time_ms,
        placement = excluded.placement,
        is_winner = excluded.is_winner,
        finished_at = now();
    end loop;

    update public.rooms
    set status = 'completed',
        winner_user_id = v_winner,
        ended_at = now(),
        current_round = v_rounds
    where id = p_room_id;
  else
    update public.rooms
    set current_round = greatest(current_round, least(p_round + 1, v_rounds))
    where id = p_room_id
      and status = 'in_progress';
  end if;

  for v_row in
    select user_id, score, total_time_ms, current_round
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'user_id', v_row.user_id,
        'score', v_row.score,
        'total_time_ms', v_row.total_time_ms,
        'current_round', v_row.current_round
      )
    );
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id),
    'players', v_results
  );
end;
$$;

grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;

create or replace function public.forfeit_1v1_match(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_self public.room_players%rowtype;
  v_opponent public.room_players%rowtype;
  v_remaining_players integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select * into v_self
  from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  if v_self.id is null then
    raise exception 'Not in room';
  end if;

  if v_room.status = 'waiting' then
    delete from public.room_players
    where room_id = p_room_id
      and user_id = v_uid;

    select count(*)::int
    into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    if v_remaining_players = 0 then
      update public.rooms
      set status = 'cancelled',
          ended_at = now()
      where id = p_room_id;
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', (select status from public.rooms where id = p_room_id),
      'winner_user_id', null
    );
  end if;

  if v_room.status <> 'in_progress' then
    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id
    );
  end if;

  select * into v_opponent
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_uid
  order by slot_no
  limit 1;

  update public.room_players
  set current_round = greatest(current_round, v_room.rounds + 1),
      last_seen = now()
  where id = v_self.id;

  if v_opponent.id is not null then
    update public.room_players
    set current_round = greatest(current_round, v_room.rounds + 1),
        last_seen = now()
    where id = v_opponent.id;

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_opponent.user_id, v_opponent.score, v_opponent.total_time_ms, 1, true)
    on conflict (room_id, user_id)
    do update set
      score = excluded.score,
      total_time_ms = excluded.total_time_ms,
      placement = excluded.placement,
      is_winner = excluded.is_winner,
      finished_at = now();

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_self.user_id, v_self.score, v_self.total_time_ms, 2, false)
    on conflict (room_id, user_id)
    do update set
      score = excluded.score,
      total_time_ms = excluded.total_time_ms,
      placement = excluded.placement,
      is_winner = excluded.is_winner,
      finished_at = now();

    update public.rooms
    set status = 'completed',
        winner_user_id = v_opponent.user_id,
        ended_at = now(),
        current_round = v_room.rounds
    where id = p_room_id;
  else
    update public.rooms
    set status = 'cancelled',
        ended_at = now(),
        current_round = v_room.rounds
    where id = p_room_id;
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id)
  );
end;
$$;

grant execute on function public.forfeit_1v1_match(uuid) to authenticated;

-- Realtime publication (safe idempotent blocks)
do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.room_players;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.room_results;
exception when duplicate_object then null;
end $$;
