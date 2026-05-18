-- Add 1v1 Tug-of-War Code Blaster mode with optional power-ups.

alter table public.rooms
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public.rooms drop constraint if exists rooms_game_type_check;
alter table public.rooms
  add constraint rooms_game_type_check check (game_type in ('quiz', 'matching', 'blaster'));

alter table public.duel_invites drop constraint if exists duel_invites_game_type_check;
alter table public.duel_invites
  add constraint duel_invites_game_type_check check (game_type in ('quiz', 'matching', 'blaster'));

alter table public.duel_player_stats drop constraint if exists duel_player_stats_game_type_check;
alter table public.duel_player_stats
  add constraint duel_player_stats_game_type_check check (game_type in ('all', 'quiz', 'matching', 'blaster'));

create or replace function public.create_1v1_room(
  p_game_type text,
  p_category text,
  p_is_public boolean default true,
  p_rounds integer default 10,
  p_powerups_enabled boolean default false
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
            or (v_category = 'pc' and (lower(c.category) in ('pc', 'penal', 'penal code', 'pc code', 'penal codes') or upper(trim(c.code_section)) like 'PC%'))
            or (v_category = 'vc' and (lower(c.category) in ('vc', 'vehicle', 'vehicle code', 'vehicle codes', 'vc code') or upper(trim(c.code_section)) like 'VC%'))
            or (v_category = 'hs' and (lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety', 'hs code', 'h&s code', 'health and safety code') or upper(trim(c.code_section)) like 'HS%' or upper(trim(c.code_section)) like 'H&S%'))
          )
        order by random()
        limit 220
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    end if;

    if v_pool_count < 1 then
      raise exception 'Not enough content to generate quiz rounds for category %', v_category;
    end if;

    for v_round in 1..v_rounds loop
      v_item := v_pool -> ((v_round - 1) % v_pool_count);

      if v_category = 'scenarios' then
        v_choices := array[]::text[];
        for v_choice in select value::text from jsonb_array_elements_text(coalesce(v_item->'scenario_questions', '[]'::jsonb)) loop
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

        v_choices := (
          select array_agg(value)
          from (select distinct unnest(v_choices) as value) dedup
          where length(trim(value)) > 0
        );

        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (select value from unnest(v_choices) as value order by random() limit 4) randomized
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

        v_question_set := v_question_set || jsonb_build_array(jsonb_build_object(
          'round', v_round,
          'prompt', v_item->>'prompt',
          'choices', v_choice_json,
          'correctIndex', v_correct_index,
          'explanation', v_item->>'explanation'
        ));
      else
        v_choices := array[(v_item->>'title')];
        for v_choice in
          select elem->>'title'
          from jsonb_array_elements(v_pool) as elem
          where (elem->>'id') <> (v_item->>'id')
            and nullif(trim(elem->>'title'), '') is not null
          order by random()
          limit 3
        loop
          v_choices := array_append(v_choices, v_choice);
        end loop;

        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (select value from unnest(v_choices) as value where length(trim(value)) > 0 order by random() limit 4) randomized
        );

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'title') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(jsonb_build_object(
          'round', v_round,
          'prompt', concat('What best matches ', coalesce(v_item->>'code_section', 'this code section'), '?'),
          'choices', v_choice_json,
          'correctIndex', v_correct_index,
          'explanation', v_item->>'explanation',
          'sourceLabel', v_item->>'code_section'
        ));
      end if;
    end loop;
  else
    with base as (
      select
        c.id,
        trim(c.code_section) as code_section,
        trim(c.title) as title,
        coalesce(nullif(trim(c.explanation), ''), trim(c.question), trim(c.answer), '') as explanation
      from public.content_items c
      where c.is_published = true
        and c.type in ('code', 'question')
        and nullif(trim(c.title), '') is not null
        and nullif(trim(c.code_section), '') is not null
        and (
          v_category = 'all'
          or (v_category = 'pc' and (lower(c.category) in ('pc', 'penal', 'penal code', 'pc code', 'penal codes') or upper(trim(c.code_section)) like 'PC%'))
          or (v_category = 'vc' and (lower(c.category) in ('vc', 'vehicle', 'vehicle code', 'vehicle codes', 'vc code') or upper(trim(c.code_section)) like 'VC%'))
          or (v_category = 'hs' and (lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety', 'hs code', 'h&s code', 'health and safety code') or upper(trim(c.code_section)) like 'HS%' or upper(trim(c.code_section)) like 'H&S%'))
        )
      order by random()
      limit 220
    )
    select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
    into v_pool, v_pool_count
    from base;

    if v_pool_count < 1 then
      raise exception 'Not enough content to generate rounds for category %', v_category;
    end if;

    v_records := '[]'::jsonb;
    for v_round in 1..v_rounds loop
      if v_game_type = 'matching' then
        v_round_pairs := '[]'::jsonb;
        for v_idx in 0..2 loop
          v_item := v_pool -> ((((v_round - 1) * 3) + v_idx) % v_pool_count);
          v_left := v_item->>'code_section';
          v_right := v_item->>'title';
          v_round_pairs := v_round_pairs || jsonb_build_array(jsonb_build_object('pairId', gen_random_uuid(), 'left', v_left, 'right', v_right));
        end loop;
        v_records := v_records || jsonb_build_array(jsonb_build_object('round', v_round, 'pairs', v_round_pairs));
      else
        v_item := v_pool -> ((v_round - 1) % v_pool_count);
        v_choices := array[(v_item->>'code_section')];
        for v_choice in
          select elem->>'code_section'
          from jsonb_array_elements(v_pool) as elem
          where (elem->>'id') <> (v_item->>'id')
            and nullif(trim(elem->>'code_section'), '') is not null
          order by random()
          limit 5
        loop
          v_choices := array_append(v_choices, v_choice);
        end loop;

        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (select distinct value from unnest(v_choices) as value where length(trim(value)) > 0 order by value limit 6) deduped
        );
        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (select value from jsonb_array_elements_text(v_choice_json) as value order by random() limit 6) randomized
        );

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'code_section') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_records := v_records || jsonb_build_array(jsonb_build_object(
          'round', v_round,
          'prompt', coalesce(nullif(v_item->>'title', ''), 'Identify the matching code section'),
          'targets', v_choice_json,
          'correctIndex', v_correct_index,
          'correctCode', v_item->>'code_section',
          'sourceLabel', v_item->>'code_section',
          'explanation', coalesce(nullif(v_item->>'explanation', ''), v_item->>'title')
        ));
      end if;
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
    settings,
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
    jsonb_build_object('powerups_enabled', coalesce(p_powerups_enabled, false)),
    'waiting',
    1
  ) returning id into v_room_id;

  insert into public.room_players (room_id, user_id, slot_no, is_ready)
  values (v_room_id, v_uid, 1, false);

  return v_room_id;
end;
$$;

grant execute on function public.create_1v1_room(text, text, boolean, integer, boolean) to authenticated, service_role;

create or replace function public.create_1v1_invite(
  p_target_user_id uuid,
  p_game_type text,
  p_category text,
  p_rounds integer default 10,
  p_powerups_enabled boolean default false
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
  set status = 'cancelled', responded_at = now()
  where sender_user_id = v_uid
    and recipient_user_id = p_target_user_id
    and status = 'pending';

  v_room_id := public.create_1v1_room(v_game_type, v_category, false, v_rounds, case when v_game_type = 'blaster' then coalesce(p_powerups_enabled, false) else false end);

  insert into public.duel_invites (sender_user_id, recipient_user_id, room_id, game_type, category, rounds, status, expires_at)
  values (v_uid, p_target_user_id, v_room_id, v_game_type, v_category, v_rounds, 'pending', now() + interval '5 minutes')
  returning id into v_invite_id;

  return jsonb_build_object('invite_id', v_invite_id, 'room_id', v_room_id, 'status', 'pending');
end;
$$;

grant execute on function public.create_1v1_invite(uuid, text, text, integer, boolean) to authenticated, service_role;

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
  v_elapsed bigint;
  v_rounds integer;
  v_players_finished integer;
  v_total_players integer;
  v_results jsonb := '[]'::jsonb;
  v_row record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'completed' then
    for v_row in
      select user_id, score, total_time_ms, fastest_round_ms, current_round, finished_at
      from public.room_players
      where room_id = p_room_id
      order by slot_no
    loop
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'user_id', v_row.user_id,
        'score', v_row.score,
        'total_time_ms', v_row.total_time_ms,
        'fastest_round_ms', v_row.fastest_round_ms,
        'current_round', v_row.current_round,
        'finished_at', v_row.finished_at
      ));
    end loop;

    return jsonb_build_object('room_id', p_room_id, 'status', v_room.status, 'winner_user_id', v_room.winner_user_id, 'players', v_results);
  end if;

  if v_room.status <> 'in_progress' then
    raise exception 'Room is not active';
  end if;

  if v_room.started_at is null or now() < v_room.started_at then
    raise exception 'Match countdown active';
  end if;

  if p_round is null or p_round < 1 then
    raise exception 'Invalid round';
  end if;

  v_rounds := greatest(1, coalesce(v_room.rounds, 1));
  v_elapsed := greatest(0, least(coalesce(p_elapsed_ms, 0), 300000));

  if v_room.game_type in ('matching', 'blaster') and p_correct and p_points is not null then
    v_points := greatest(0, least(p_points, 1000));
  else
    v_points := case when p_correct then 100 else 0 end;
  end if;

  update public.room_players
  set score = score + v_points,
      total_time_ms = total_time_ms + v_elapsed,
      fastest_round_ms = case
        when v_elapsed <= 0 then fastest_round_ms
        when fastest_round_ms <= 0 then v_elapsed
        else least(fastest_round_ms, v_elapsed)
      end,
      current_round = least(p_round + 1, v_rounds + 1),
      finished_at = case when p_round >= v_rounds then coalesce(finished_at, now()) else finished_at end,
      last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round = p_round;

  if not found then
    raise exception 'Round already submitted or player not in room';
  end if;

  select count(*)::int, count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 then
    return public.finish_1v1_room_by_score(p_room_id);
  end if;

  update public.rooms
  set current_round = greatest(current_round, least(p_round + 1, v_rounds)), updated_at = now()
  where id = p_room_id and status = 'in_progress';

  for v_row in
    select user_id, score, total_time_ms, fastest_round_ms, current_round, finished_at
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'user_id', v_row.user_id,
      'score', v_row.score,
      'total_time_ms', v_row.total_time_ms,
      'fastest_round_ms', v_row.fastest_round_ms,
      'current_round', v_row.current_round,
      'finished_at', v_row.finished_at
    ));
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id),
    'players', v_results
  );
end;
$$;

grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated, service_role;

create or replace function public.recompute_duel_player_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise notice 'recompute_duel_player_stats is disabled to preserve live 1v1 leaderboard aggregates.';
end;
$$;

select pg_notify('pgrst', 'reload schema');

do $$
declare
  v_sql text;
  v_next_sql text;
begin
  v_sql := pg_get_functiondef('public.set_1v1_ready(uuid, boolean)'::regprocedure);
  v_next_sql := replace(
    v_sql,
$old$
    v_started_room_id := public.create_1v1_room(
      v_room.game_type,
      v_room.category,
      coalesce(v_room.is_public, false) or v_publish_for_spectators,
      v_rounds
    );
$old$,
$new$
    v_started_room_id := public.create_1v1_room(
      v_room.game_type,
      v_room.category,
      coalesce(v_room.is_public, false) or v_publish_for_spectators,
      v_rounds,
      coalesce((v_room.settings->>'powerups_enabled')::boolean, false)
    );
$new$
  );
  if v_next_sql <> v_sql then
    execute v_next_sql;
  end if;

  v_sql := pg_get_functiondef('public.rematch_1v1_room(uuid, text)'::regprocedure);
  v_next_sql := replace(
    v_sql,
$old$
  v_new_room_id := public.create_1v1_room(v_room.game_type, v_category, coalesce(v_room.is_public, false), v_rounds);
$old$,
$new$
  v_new_room_id := public.create_1v1_room(
    v_room.game_type,
    v_category,
    coalesce(v_room.is_public, false),
    v_rounds,
    coalesce((v_room.settings->>'powerups_enabled')::boolean, false)
  );
$new$
  );
  if v_next_sql <> v_sql then
    execute v_next_sql;
  end if;
end $$;

grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated, service_role;
grant execute on function public.rematch_1v1_room(uuid, text) to authenticated, service_role;
select pg_notify('pgrst', 'reload schema');
