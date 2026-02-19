-- Add streak loss notification to chat
-- Run this in Supabase SQL editor

-- Function to send streak loss message to public chat
CREATE OR REPLACE FUNCTION public.notify_streak_loss(
  p_loser_user_id uuid,
  p_loser_name text,
  p_winner_user_id uuid,
  p_winner_name text,
  p_streak_count int,
  p_game_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_streak_count > 0 THEN
    INSERT INTO public.public_messages (user_id, display_name, message)
    VALUES (
      p_loser_user_id,
      '🔔 System',
      FORMAT('%s lost their %s win streak of %s to %s! 💔', p_loser_name, 
        CASE WHEN p_game_type = 'all' THEN '' ELSE p_game_type END, 
        p_streak_count::text, p_winner_name)
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_streak_loss(uuid, text, uuid, text, int, text) TO authenticated;

-- Now update the trigger function to call notify_streak_loss
CREATE OR REPLACE FUNCTION public.process_1v1_room_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player RECORD;
  v_mode TEXT;
  v_modes TEXT[];
  v_is_winner BOOLEAN;
  v_loser_user_id UUID;
  v_loser_name TEXT;
  v_winner_user_id UUID;
  v_winner_name TEXT;
  v_game_type TEXT;
  v_old_streak INT;
BEGIN
  IF new.status <> 'completed' THEN
    RETURN new;
  END IF;

  IF old.status = 'completed' THEN
    RETURN new;
  END IF;

  IF new.winner_user_id IS NULL THEN
    RETURN new;
  END IF;

  v_modes := ARRAY['all', new.game_type];
  v_winner_user_id := new.winner_user_id;
  v_game_type := new.game_type;

  -- Get winner name
  SELECT COALESCE(p.username, 'Unknown') INTO v_winner_name
  FROM public.profiles p WHERE p.user_id = v_winner_user_id;

  FOR v_player IN
    SELECT rp.user_id
    FROM public.room_players rp
    WHERE rp.room_id = new.id
  LOOP
    v_is_winner := v_player.user_id = new.winner_user_id;
    
    -- Get loser info if this player lost
    IF NOT v_is_winner THEN
      v_loser_user_id := v_player.user_id;
      SELECT COALESCE(p.username, 'Unknown') INTO v_loser_name
      FROM public.profiles p WHERE p.user_id = v_loser_user_id;
    END IF;

    FOREACH v_mode IN ARRAY v_modes
    LOOP
      -- Get old streak before update
      SELECT current_win_streak INTO v_old_streak
      FROM public.duel_player_stats
      WHERE user_id = v_player.user_id AND game_type = v_mode;

      INSERT INTO public.duel_player_stats (
        user_id,
        game_type,
        wins,
        losses,
        matches_played,
        current_win_streak,
        best_win_streak
      ) VALUES (
        v_player.user_id,
        v_mode,
        CASE WHEN v_is_winner THEN 1 ELSE 0 END,
        CASE WHEN v_is_winner THEN 0 ELSE 1 END,
        1,
        CASE WHEN v_is_winner THEN 1 ELSE 0 END,
        CASE WHEN v_is_winner THEN 1 ELSE 0 END
      )
      ON CONFLICT (user_id, game_type)
      DO UPDATE SET
        wins = public.duel_player_stats.wins + excluded.wins,
        losses = public.duel_player_stats.losses + excluded.losses,
        matches_played = public.duel_player_stats.matches_played + 1,
        current_win_streak = CASE
          WHEN excluded.wins = 1 THEN public.duel_player_stats.current_win_streak + 1
          ELSE 0
        END,
        best_win_streak = GREATEST(
          public.duel_player_stats.best_win_streak,
          CASE
            WHEN excluded.wins = 1 THEN public.duel_player_stats.current_win_streak + 1
            ELSE public.duel_player_stats.best_win_streak
          END
        ),
        updated_at = now();

      -- Notify streak loss (only for 'all' game type to avoid duplicate messages)
      IF NOT v_is_winner AND v_mode = 'all' AND v_old_streak > 0 THEN
        PERFORM public.notify_streak_loss(v_loser_user_id, v_loser_name, v_winner_user_id, v_winner_name, v_old_streak, v_game_type);
      END IF;
    END LOOP;
  END LOOP;

  RETURN new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_1v1_room_completion() TO authenticated;
