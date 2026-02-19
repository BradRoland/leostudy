-- Function to get public room players (bypasses RLS)
-- Used for displaying public room listings

create or replace function public.get_public_room_players()
returns table (
  room_id uuid,
  user_id uuid,
  display_name text,
  agency text,
  slot_no integer,
  is_host boolean,
  is_ready boolean,
  score integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select 
    rp.room_id,
    rp.user_id,
    rp.display_name,
    rp.agency,
    rp.slot_no,
    rp.is_host,
    rp.ready,
    rp.score
  from public.room_players rp
  inner join public.rooms r on r.id = rp.room_id
  where r.is_public = true
  and r.status in ('waiting', 'in_progress');
end;
$$;

grant execute on function public.get_public_room_players() to authenticated;
