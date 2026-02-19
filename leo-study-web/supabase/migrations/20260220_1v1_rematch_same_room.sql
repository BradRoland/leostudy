-- Updated rematch function: reuses same room with NEW questions
-- Run this in Supabase SQL editor to fix rematch flow

DROP FUNCTION IF EXISTS public.rematch_1v1_room(uuid, text);

CREATE OR REPLACE FUNCTION public.rematch_1v1_room(
  p_room_id uuid,
  p_category text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.rooms%ROWTYPE;
  v_category text;
  v_rounds integer;
  v_question_set jsonb := '[]'::jsonb;
  v_player_one uuid;
  v_player_two uuid;
  v_is_participant boolean := FALSE;
  v_pool jsonb;
  v_pool_count int;
  v_round int;
  v_item jsonb;
  v_choices text[];
  v_choice text;
  v_choice_json jsonb;
  v_correct_index int;
  v_idx int;
  v_category_text text;
  v_game_type text;
BEGIN
  -- Auth check
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get room
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id;

  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Check participant
  SELECT EXISTS (
    SELECT 1 FROM public.room_players rp
    WHERE rp.room_id = p_room_id AND rp.user_id = v_uid
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RAISE EXCEPTION 'Only room participants can request a rematch';
  END IF;

  -- Must be completed
  IF v_room.status <> 'completed' THEN
    RAISE EXCEPTION 'Rematch is available only after match completion';
  END IF;

  -- Get both players
  SELECT rp.user_id INTO v_player_one
  FROM public.room_players rp
  WHERE rp.room_id = p_room_id
  ORDER BY rp.slot_no ASC
  LIMIT 1;

  SELECT rp.user_id INTO v_player_two
  FROM public.room_players rp
  WHERE rp.room_id = p_room_id
  ORDER BY rp.slot_no ASC
  OFFSET 1
  LIMIT 1;

  IF v_player_one IS NULL OR v_player_two IS NULL THEN
    RAISE EXCEPTION 'Rematch requires exactly two players';
  END IF;

  -- Validate category
  v_category := lower(trim(coalesce(NULLIF(p_category, ''), v_room.category)));
  IF v_category NOT IN ('all', 'pc', 'vc', 'hs', 'scenarios') THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;

  IF v_room.game_type = 'matching' AND v_category = 'scenarios' THEN
    v_category := 'all';
  END IF;

  -- Set rounds
  v_rounds := CASE
    WHEN v_room.game_type = 'matching' THEN 5
    ELSE greatest(5, least(coalesce(v_room.rounds, 10), 50))
  END;

  v_category_text := v_category;
  v_game_type := v_room.game_type;

  -- Generate NEW question set
  IF v_game_type = 'matching' THEN
    -- For matching, generate pairs
    v_question_set := '[]'::jsonb;
  ELSE
    -- Generate quiz questions
    IF v_category_text = 'scenarios' THEN
      WITH base AS (
        SELECT
          c.id,
          COALESCE(NULLIF(TRIM(c.scenario), ''), TRIM(c.title)) AS prompt,
          COALESCE(NULLIF(TRIM(c.answer), ''), 'Use the most lawful option based on facts.') AS correct_answer,
          COALESCE(c.scenario_questions, '[]'::jsonb) AS scenario_questions,
          COALESCE(NULLIF(TRIM(c.explanation), ''), 'Use lawful authority and articulable facts.') AS explanation
        FROM public.content_items c
        WHERE c.is_published = TRUE
          AND c.type = 'scenario'
          AND NULLIF(TRIM(COALESCE(c.scenario, c.title)), '') IS NOT NULL
        ORDER BY random()
        LIMIT 120
      )
      SELECT COALESCE(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      INTO v_pool, v_pool_count
      FROM base;
    ELSE
      WITH base AS (
        SELECT
          c.id,
          TRIM(c.title) AS title,
          TRIM(c.code_section) AS code_section,
          COALESCE(NULLIF(TRIM(c.explanation), ''), TRIM(c.question), TRIM(c.answer), '') AS explanation
        FROM public.content_items c
        WHERE c.is_published = TRUE
          AND c.type IN ('code', 'question')
          AND NULLIF(TRIM(c.title), '') IS NOT NULL
          AND NULLIF(TRIM(c.code_section), '') IS NOT NULL
          AND (
            v_category_text = 'all'
            OR (v_category_text = 'pc' AND lower(c.category) IN ('pc', 'penal', 'penal code'))
            OR (v_category_text = 'vc' AND lower(c.category) IN ('vc', 'vehicle', 'vehicle code'))
            OR (v_category_text = 'hs' AND lower(c.category) IN ('hs', 'h&s', 'health', 'health & safety', 'health and safety'))
          )
        ORDER BY random()
        LIMIT 220
      )
      SELECT COALESCE(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      INTO v_pool, v_pool_count
      FROM base;
    END IF;

    IF v_pool_count < v_rounds THEN
      RAISE EXCEPTION 'Not enough content to generate % quiz rounds', v_rounds;
    END IF;

    -- Build question set
    FOR v_round IN 1..v_rounds LOOP
      v_item := v_pool -> ((v_round - 1) % v_pool_count);

      IF v_category_text = 'scenarios' THEN
        v_choices := array[]::text[];
        FOR v_choice IN
          SELECT value::text
          FROM jsonb_array_elements_text(COALESCE(v_item->'scenario_questions', '[]'::jsonb))
        LOOP
          IF LENGTH(TRIM(v_choice)) > 0 THEN
            v_choices := array_append(v_choices, TRIM(v_choice));
          END IF;
        END LOOP;

        IF COALESCE(array_length(v_choices, 1), 0) < 2 THEN
          v_choices := ARRAY[
            (v_item->>'correct_answer'),
            'Document observations and seek corroborating evidence.',
            'Delay enforcement action until legal elements are established.',
            'Prioritize scene safety and gather witness statements.'
          ];
        END IF;

        IF NOT ((v_item->>'correct_answer') = ANY(v_choices)) THEN
          v_choices := array_append(v_choices, (v_item->>'correct_answer'));
        END IF;

        v_choices := (SELECT array_agg(value) FROM (SELECT DISTINCT unnest(v_choices) AS value) t WHERE LENGTH(TRIM(value)) > 0);
        
        v_choice_json := (
          SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
          FROM (
            SELECT value
            FROM unnest(v_choices) AS value
            ORDER BY random()
            LIMIT 4
          ) s
        );

        IF jsonb_array_length(v_choice_json) < 2 THEN
          RAISE EXCEPTION 'Unable to generate scenario choices';
        END IF;

        v_correct_index := 0;
        FOR v_idx IN 0..jsonb_array_length(v_choice_json) - 1 LOOP
          IF (v_choice_json ->> v_idx) = (v_item->>'correct_answer') THEN
            v_correct_index := v_idx;
            EXIT;
          END IF;
        END LOOP;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', v_item->>'prompt',
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation'
          )
        );
      ELSE
        -- Regular quiz question
        v_choices := ARRAY[(v_item->>'title')];

        FOR v_choice IN
          SELECT elem->>'title'
          FROM jsonb_array_elements(v_pool) AS elem
          WHERE (elem->>'id') <> (v_item->>'id')
          ORDER BY random()
          LIMIT 3
        LOOP
          v_choices := array_append(v_choices, v_choice);
        END LOOP;

        v_choice_json := (
          SELECT jsonb_agg(value)
          FROM (
            SELECT value
            FROM unnest(v_choices) AS value
            ORDER BY random()
          ) s
        );

        v_correct_index := 0;
        FOR v_idx IN 0..jsonb_array_length(v_choice_json) - 1 LOOP
          IF (v_choice_json ->> v_idx) = (v_item->>'title') THEN
            v_correct_index := v_idx;
            EXIT;
          END IF;
        END LOOP;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'code', v_item->>'code_section',
            'prompt', v_item->>'title',
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation'
          )
        );
      END IF;
    END LOOP;
  END IF;

  -- Reset player scores and state for the NEW match
  UPDATE public.room_players
  SET is_ready = FALSE,
      score = 0,
      total_time_ms = 0,
      fastest_round_ms = 0,
      current_round = 1,
      last_seen = now()
  WHERE room_id = p_room_id
    AND user_id IN (v_player_one, v_player_two);

  -- Update room with NEW question set and reset for fresh start
  UPDATE public.rooms
  SET question_set = v_question_set,
      category = v_category,
      rounds = v_rounds,
      status = 'waiting',
      current_round = 1,
      winner_user_id = NULL,
      started_at = NULL,
      ended_at = NULL,
      rematch_room_id = NULL
  WHERE id = p_room_id;

  RETURN p_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rematch_1v1_room(uuid, text) TO authenticated;
