-- One-time reset for 1v1 leaderboard standings.
-- Keeps existing room history and only clears aggregated leaderboard stats.

delete from public.duel_player_stats;
