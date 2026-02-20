-- 1v1 rematch flow hardening:
-- - Both players vote rematch (1/2, 2/2)
-- - Server starts rematch automatically when both agree
-- - Rematch regenerates a fresh question set and resets room state

drop function if exists public.set_1v1_ready(uuid, boolean);
drop function if exists public.rematch_1v1_room(uuid, text);

create or replace function public.rematch_1v1_room(
  p_room_id uuid,
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_category text;
  v_rounds integer;
  v_player_count integer;
  v_ready_count integer;
  v_question_set jsonb := '[]'::jsonb;
  v_pool jsonb := '[]'::jsonb;
  v_pool_count integer := 0;
  v_round integer;
  v_idx integer;
  v_item jsonb;
  v_round_pairs jsonb;
  v_choices text[];
  v_choice text;
  v_choice_json jsonb;
  v_correct_index integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if not exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = v_uid
  ) then
    raise exception 'Only room participants can request a rematch';
  end if;

  if v_room.status <> 'completed' then
    raise exception 'Rematch is available only after match completion';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count <> 2 then
    raise exception 'Rematch requires exactly two players';
  end if;

  if v_ready_count <> 2 then
    raise exception 'Both players must agree to rematch';
  end if;

  v_category := lower(trim(coalesce(nullif(p_category, ''), v_room.category)));
  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_room.game_type = 'matching' and v_category = 'scenarios' then
    v_category := 'all';
  end if;

  v_rounds := case
    when v_room.game_type = 'matching' then 5
    else greatest(5, least(coalesce(v_room.rounds, 10), 50))
  end;

  if v_room.game_type = 'quiz' then
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
        limit greatest(v_rounds * 8, 120)
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
        limit greatest(v_rounds * 8, 220)
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    end if;

    if v_pool_count < v_rounds then
      raise exception 'Not enough content to generate % quiz rounds', v_rounds;
    end if;

    for v_round in 1..v_rounds loop
      v_item := v_pool -> (v_round - 1);

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

        v_choices := (
          select array_agg(value)
          from (
            select distinct unnest(v_choices) as value
          ) dedup
          where length(trim(value)) > 0
        );

        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (
            select value
            from unnest(v_choices) as value
            order by random()
            limit 4
          ) randomized
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
            and nullif(trim(elem->>'title'), '') is not null
          order by random()
          limit 3
        loop
          v_choices := array_append(v_choices, v_choice);
        end loop;

        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (
            select value
            from unnest(v_choices) as value
            where length(trim(value)) > 0
            order by random()
            limit 4
          ) randomized
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
      limit greatest(v_rounds * 8, 180)
    )
    select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
    into v_pool, v_pool_count
    from base;

    if v_pool_count < (v_rounds * 3) then
      raise exception 'Not enough content to generate matching rounds';
    end if;

    for v_round in 1..v_rounds loop
      v_round_pairs := '[]'::jsonb;
      for v_idx in 1..3 loop
        v_item := v_pool -> (((v_round - 1) * 3) + (v_idx - 1));
        v_round_pairs := v_round_pairs || jsonb_build_array(
          jsonb_build_object(
            'pairId', gen_random_uuid(),
            'left', v_item->>'code_section',
            'right', v_item->>'title'
          )
        );
      end loop;

      v_question_set := v_question_set || jsonb_build_array(
        jsonb_build_object(
          'round', v_round,
          'pairs', v_round_pairs
        )
      );
    end loop;
  end if;

  delete from public.room_results where room_id = p_room_id;

  update public.room_players
  set
    is_ready = true,
    score = 0,
    total_time_ms = 0,
    fastest_round_ms = 0,
    current_round = 1,
    last_seen = now()
  where room_id = p_room_id;

  update public.rooms
  set
    question_set = v_question_set,
    category = v_category,
    rounds = v_rounds,
    status = 'in_progress',
    current_round = 1,
    winner_user_id = null,
    started_at = now(),
    ended_at = null,
    rematch_room_id = null
  where id = p_room_id;

  return p_room_id;
end;
$$;

create or replace function public.set_1v1_ready(
  p_room_id uuid,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_ready_count integer := 0;
  v_player_count integer := 0;
  v_started_room_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  update public.room_players
  set
    is_ready = p_ready,
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

  if v_room.status = 'waiting' and v_player_count = 2 and v_ready_count = 2 then
    update public.rooms
    set
      status = 'in_progress',
      started_at = now(),
      current_round = 1
    where id = p_room_id
      and status = 'waiting';

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', v_ready_count,
      'player_count', v_player_count,
      'rematch_started', false,
      'room_id', p_room_id
    );
  end if;

  if v_room.status = 'completed' and v_player_count = 2 and v_ready_count = 2 then
    v_started_room_id := public.rematch_1v1_room(p_room_id, null);
    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', true,
      'room_id', v_started_room_id
    );
  end if;

  select status into v_status
  from public.rooms
  where id = p_room_id;

  return jsonb_build_object(
    'status', coalesce(v_status, v_room.status),
    'ready_count', v_ready_count,
    'player_count', v_player_count,
    'rematch_started', false,
    'room_id', p_room_id
  );
end;
$$;

grant execute on function public.rematch_1v1_room(uuid, text) to authenticated;
grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;
