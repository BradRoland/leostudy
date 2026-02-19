create or replace function public.is_room_participant(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = coalesce(p_user_id, auth.uid())
  );
$$;

grant execute on function public.is_room_participant(uuid, uuid) to authenticated;

drop policy if exists room_players_select_room_participants on public.room_players;
create policy room_players_select_room_participants
on public.room_players
for select
using (public.is_room_participant(room_id, auth.uid()));
