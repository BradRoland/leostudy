-- Add unique constraint to prevent duplicate leaderboard entries
-- First, delete duplicates keeping the highest score
DELETE FROM leaderboard WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, game, match_duration, match_filter) 
  id FROM leaderboard 
  ORDER BY user_id, game, match_duration, match_filter, score DESC, created_at DESC
);

-- Add unique constraint
ALTER TABLE public.leaderboard ADD CONSTRAINT unique_user_game_duration_filter UNIQUE (user_id, game, match_duration, match_filter);

-- Create function to upsert leaderboard scores
CREATE OR REPLACE FUNCTION public.upsert_leaderboard(
  p_user_id UUID,
  p_game TEXT,
  p_match_duration INT,
  p_match_filter TEXT,
  p_score INT,
  p_round INT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO leaderboard (user_id, game, match_duration, match_filter, score, round)
  VALUES (p_user_id, p_game, p_match_duration, p_match_filter, p_score, p_round)
  ON CONFLICT (user_id, game, match_duration, match_filter) 
  DO UPDATE SET score = GREATEST(leaderboard.score, EXCLUDED.score),
              round = EXCLUDED.round,
              created_at = NOW();
END;
$$ LANGUAGE plpgsql;
