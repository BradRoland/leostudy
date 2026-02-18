-- Simplest fix: allow authenticated users to insert/update leaderboard
-- This works with Supabase's upsert

-- First drop old policies
drop policy if exists "leaderboard_insert_self" on public.leaderboard;
drop policy if exists "leaderboard_update_self" on public.leaderboard;

-- Allow authenticated users to insert
create policy "leaderboard_all_insert" on public.leaderboard
for insert with check (true);

-- Allow authenticated users to update  
create policy "leaderboard_all_update" on public.leaderboard
for update using (true);
