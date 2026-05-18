-- Make 1v1 Code Blaster time-based by default with an optional sudden-death mode.
-- Matches now end when the timer expires, both players exhaust the round pool, or one
-- player pulls the tug-of-war rope all the way to their side.

alter table public.rooms
  add column if not exists settings jsonb not null default '{}'::jsonb;

drop function if exists public.create_1v1_invite(uuid, text, text, integer, boolean);
drop function if exists public.create_1v1_room(text, text, boolean, integer, boolean);

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
  v_blaster_duration_seconds integer := greatest(15, least(coalesce(p_blaster_duration_seconds, 30), 300));
  v_blaster_rope_limit integer := greatest(300, least(coalesce(p_blaster_rope_limit, 900), 3000));
  v_blaster_win_condition text := case when coalesce(p_blaster_sudden_death, false) then 'death' else 'timed' end;
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
  elsif v_game_type = 'blaster' then
    v_rounds := 50;
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
    jsonb_build_object(
      'powerups_enabled', case when v_game_type = 'blaster' then coalesce(p_powerups_enabled, false) else false end,
      'blaster_duration_seconds', v_blaster_duration_seconds,
      'blaster_win_condition', v_blaster_win_condition,
      'blaster_rope_limit', v_blaster_rope_limit
    ),
    'waiting',
    1
  ) returning id into v_room_id;

  insert into public.room_players (room_id, user_id, slot_no, is_ready)
  values (v_room_id, v_uid, 1, false);

  return v_room_id;
end;
$$;

revoke all on function public.create_1v1_room(text, text, boolean, integer, boolean, integer, boolean, integer) from public, anon;
grant execute on function public.create_1v1_room(text, text, boolean, integer, boolean, integer, boolean, integer) to authenticated, service_role;

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
  elsif v_game_type = 'blaster' then
    v_rounds := 50;
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

  insert into public.duel_invites (sender_user_id, recipient_user_id, room_id, game_type, category, rounds, status, expires_at)
  values (v_uid, p_target_user_id, v_room_id, v_game_type, v_category, v_rounds, 'pending', now() + interval '5 minutes')
  returning id into v_invite_id;

  return jsonb_build_object('invite_id', v_invite_id, 'room_id', v_room_id, 'status', 'pending');
end;
$$;

revoke all on function public.create_1v1_invite(uuid, text, text, integer, boolean, integer, boolean, integer) from public, anon;
grant execute on function public.create_1v1_invite(uuid, text, text, integer, boolean, integer, boolean, integer) to authenticated, service_role;

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
  v_blaster_duration_seconds integer;
  v_blaster_rope_limit integer;
  v_blaster_win_condition text;
  v_score_gap integer;
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

  if not exists (select 1 from public.room_players where room_id = p_room_id and user_id = v_uid) then
    raise exception 'Player not in room';
  end if;

  v_blaster_duration_seconds := greatest(15, least(coalesce((v_room.settings->>'blaster_duration_seconds')::integer, 30), 300));
  v_blaster_rope_limit := greatest(300, least(coalesce((v_room.settings->>'blaster_rope_limit')::integer, 900), 3000));
  v_blaster_win_condition := coalesce(nullif(v_room.settings->>'blaster_win_condition', ''), 'timed');

  if v_room.game_type = 'blaster'
    and v_blaster_win_condition <> 'death'
    and now() >= v_room.started_at + make_interval(secs => v_blaster_duration_seconds) then
    update public.room_players
    set current_round = greatest(current_round, coalesce(v_room.rounds, current_round) + 1),
        finished_at = coalesce(finished_at, now()),
        last_seen = now()
    where room_id = p_room_id;

    return public.finish_1v1_room_by_score(p_room_id);
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

  if v_room.game_type = 'blaster' then
    select coalesce(max(score), 0) - coalesce(min(score), 0)
    into v_score_gap
    from public.room_players
    where room_id = p_room_id;

    if coalesce(v_score_gap, 0) >= v_blaster_rope_limit then
      update public.room_players
      set current_round = greatest(current_round, v_rounds + 1),
          finished_at = coalesce(finished_at, now()),
          last_seen = now()
      where room_id = p_room_id;

      return public.finish_1v1_room_by_score(p_room_id);
    end if;
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

revoke all on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) from public, anon;
grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated, service_role;

create or replace function public.finish_1v1_blaster_timeout(
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
  v_blaster_duration_seconds integer;
  v_blaster_win_condition text;
  v_remaining_ms integer;
  v_results jsonb := '[]'::jsonb;
  v_row record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if not exists (select 1 from public.room_players where room_id = p_room_id and user_id = v_uid) then
    raise exception 'Player not in room';
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

  if v_room.status <> 'in_progress' or v_room.game_type <> 'blaster' then
    return jsonb_build_object('room_id', p_room_id, 'status', v_room.status, 'winner_user_id', v_room.winner_user_id, 'players', v_results);
  end if;

  if v_room.started_at is null or now() < v_room.started_at then
    raise exception 'Match countdown active';
  end if;

  v_blaster_duration_seconds := greatest(15, least(coalesce((v_room.settings->>'blaster_duration_seconds')::integer, 30), 300));
  v_blaster_win_condition := coalesce(nullif(v_room.settings->>'blaster_win_condition', ''), 'timed');

  if v_blaster_win_condition = 'death' then
    return jsonb_build_object('room_id', p_room_id, 'status', v_room.status, 'winner_user_id', v_room.winner_user_id, 'remaining_ms', null);
  end if;

  v_remaining_ms := floor(greatest(0, extract(epoch from ((v_room.started_at + make_interval(secs => v_blaster_duration_seconds)) - now())) * 1000))::integer;
  if v_remaining_ms > 0 then
    return jsonb_build_object('room_id', p_room_id, 'status', v_room.status, 'winner_user_id', v_room.winner_user_id, 'remaining_ms', v_remaining_ms);
  end if;

  update public.room_players
  set current_round = greatest(current_round, coalesce(v_room.rounds, current_round) + 1),
      finished_at = coalesce(finished_at, now()),
      last_seen = now()
  where room_id = p_room_id;

  return public.finish_1v1_room_by_score(p_room_id);
end;
$$;

revoke all on function public.finish_1v1_blaster_timeout(uuid) from public, anon;
grant execute on function public.finish_1v1_blaster_timeout(uuid) to authenticated, service_role;

drop function if exists public.list_public_1v1_rooms();
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
begin
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
  where r.is_public = true
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

revoke all on function public.list_public_1v1_rooms() from public, anon;
grant execute on function public.list_public_1v1_rooms() to authenticated, service_role;

do $$
declare
  v_sql text;
  v_next_sql text;
begin
  v_sql := pg_get_functiondef('public.set_1v1_ready(uuid, boolean)'::regprocedure);
  v_next_sql := replace(
    v_sql,
$old$
      coalesce((v_room.settings->>'powerups_enabled')::boolean, false)
$old$,
$new$
      coalesce((v_room.settings->>'powerups_enabled')::boolean, false),
      coalesce((v_room.settings->>'blaster_duration_seconds')::integer, 30),
      coalesce((v_room.settings->>'blaster_win_condition') = 'death', false),
      coalesce((v_room.settings->>'blaster_rope_limit')::integer, 900)
$new$
  );
  if v_next_sql <> v_sql then
    execute v_next_sql;
  end if;

  v_sql := pg_get_functiondef('public.rematch_1v1_room(uuid, text)'::regprocedure);
  v_next_sql := replace(
    v_sql,
$old$
    coalesce((v_room.settings->>'powerups_enabled')::boolean, false)
$old$,
$new$
    coalesce((v_room.settings->>'powerups_enabled')::boolean, false),
    coalesce((v_room.settings->>'blaster_duration_seconds')::integer, 30),
    coalesce((v_room.settings->>'blaster_win_condition') = 'death', false),
    coalesce((v_room.settings->>'blaster_rope_limit')::integer, 900)
$new$
  );
  if v_next_sql <> v_sql then
    execute v_next_sql;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
