-- Add UPDATE policy for leaderboard (needed for upsert)
create policy if not exists "leaderboard_update_self" on public.leaderboard
for update using (auth.uid() = user_id);
