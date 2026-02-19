-- Fixed rematch function: generates NEW questions and resets state
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
  v_pool jsonb;
  v_pool_count int;
  v_round int;
  v_item jsonb;
  v_round_pairs jsonb;
  v_idx int;
  v_choices text[];
  v_choice text;
  v_choice_json jsonb;
  v_correct_index int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;

  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.room_players rp WHERE rp.room_id = p_room_id AND rp.user_id = v_uid) THEN
    RAISE EXCEPTION 'Only room participants can request a rematch';
  END IF;

  IF v_room.status <> 'completed' THEN
    RAISE EXCEPTION 'Rematch is available only after match completion';
  END IF;

  -- Get both players
  SELECT rp.user_id INTO v_player_one
  FROM public.room_players rp
  WHERE rp.room_id = p_room_id
  ORDER BY rp.slot_no ASC LIMIT 1;

  SELECT rp.user_id INTO v_player_two
  FROM public.room_players rp
  WHERE rp.room_id = p_room_id
  ORDER BY rp.slot_no ASC OFFSET 1 LIMIT 1;

  IF v_player_one IS NULL OR v_player_two IS NULL THEN
    RAISE EXCEPTION 'Rematch requires exactly two players';
  END IF;

  -- Set category
  v_category := COALESCE(NULLIF(LOWER(TRIM(p_category)), '');
  IF v_category = '' THEN
    v_category := LOWER(v_room.category);
  END IF;
  
  IF v_category NOT IN ('all', 'pc', 'vc', 'hs', 'scenarios') THEN
    v_category := 'all';
  END IF;

  IF v_room.game_type = 'matching' AND v_category = 'scenarios' THEN
    v_category := 'all';
  END IF;

  -- Set rounds
  v_rounds := CASE
    WHEN v_room.game_type = 'matching' THEN 5
    ELSE GREATEST(5, LEAST(COALESCE(v_room.rounds, 10), 50))
  END;

  -- Generate NEW question set
  IF v_room.game_type = 'matching' THEN
    -- Generate matching pairs
    WITH base AS (
      SELECT c.id, TRIM(c.code_section) AS code_section, TRIM(c.title) AS title
      FROM public.content_items c
      WHERE c.is_published = TRUE
        AND c.type IN ('code', 'question')
        AND NULLIF(TRIM(c.title), '') IS NOT NULL
        AND NULLIF(TRIM(c.code_section), '') IS NOT NULL
      ORDER BY random() LIMIT 180
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
    INTO v_pool, v_pool_count FROM base;

    IF v_pool_count < 3 THEN
      RAISE EXCEPTION 'Not enough content for matching';
    END IF;

    FOR v_round IN 1..v_rounds LOOP
      v_round_pairs := '[]'::jsonb;
      FOR v_idx IN 0..2 LOOP
        v_item := v_pool -> ((v_round * 3 + v_idx - 1) % v_pool_count);
        v_round_pairs := v_round_pairs || jsonb_build_array(
          jsonb_build_object('left', v_item->>'code_section', 'right', v_item->>'title', 'leftKind', 'code', 'rightKind', 'title')
        );
      END LOOP;
      v_question_set := v_question_set || jsonb_build_array(jsonb_build_object('round', v_round, 'pairs', v_round_pairs));
    END LOOP;
  ELSE
    -- Generate quiz questions
    WITH base AS (
      SELECT c.id, TRIM(c.title) AS title, TRIM(c.code_section) AS code_section,
             COALESCE(NULLIF(TRIM(c.explanation), ''), TRIM(c.question), TRIM(c.answer), '') AS explanation
      FROM public.content_items c
      WHERE c.is_published = TRUE
        AND c.type IN ('code', 'question')
        AND NULLIF(TRIM(c.title), '') IS NOT NULL
        AND NULLIF(TRIM(c.code_section), '') IS NOT NULL
      ORDER BY random() LIMIT 220
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
    INTO v_pool, v_pool_count FROM base;

    IF v_pool_count < v_rounds THEN
      RAISE EXCEPTION 'Not enough content for % rounds', v_rounds;
    END IF;

    FOR v_round IN 1..v_rounds LOOP
      v_item := v_pool -> ((v_round - 1) % v_pool_count);
      v_choices := ARRAY[(v_item->>'title')];
      
      FOR v_choice IN
        SELECT elem->>'title' FROM jsonb_array_elements(v_pool) AS elem
        WHERE (elem->>'id') <> (v_item->>'id') ORDER BY random() LIMIT 3
      LOOP
        v_choices := array_append(v_choices, v_choice);
      END LOOP;

      v_choice_json := (SELECT jsonb_agg(value) FROM (SELECT value FROM unnest(v_choices) AS value ORDER BY random()) s);
      v_correct_index := 0;
      FOR v_idx IN 0..jsonb_array_length(v_choice_json) - 1 LOOP
        IF (v_choice_json ->> v_idx) = (v_item->>'title') THEN
          v_correct_index := v_idx;
          EXIT;
        END IF;
      END LOOP;

      v_question_set := v_question_set || jsonb_build_array(
        jsonb_build_object('round', v_round, 'code', v_item->>'code_section', 'prompt', v_item->>'title',
                          'choices', v_choice_json, 'correctIndex', v_correct_index, 'explanation', v_item->>'explanation')
      );
    END LOOP;
  END IF;

  -- DELETE old results
  DELETE FROM public.room_results WHERE room_id = p_room_id;

  -- Reset ALL player state
  UPDATE public.room_players
  SET is_ready = FALSE, score = 0, total_time_ms = 0, fastest_round_ms = 0, current_round = 1, last_seen = NOW()
  WHERE room_id = p_room_id;

  -- Reset room to waiting
  UPDATE public.rooms
  SET question_set = v_question_set, category = v_category, rounds = v_rounds, 
      status = 'waiting', current_round = 1, winner_user_id = NULL, 
      started_at = NULL, ended_at = NULL, rematch_room_id = NULL
  WHERE id = p_room_id;

  RETURN p_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rematch_1v1_room(uuid, text) TO authenticated;
