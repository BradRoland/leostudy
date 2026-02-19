-- Allow viewing all room_players for public rooms (for public room listing)
-- This supplements the existing participant-only policy

drop policy if exists room_players_select_public on public.room_players;

create policy room_players_select_public
on public.room_players
for select
using (
  exists (
    select 1 from public.rooms r
    where r.id = room_players.room_id
    and r.is_public = true
  )
);
