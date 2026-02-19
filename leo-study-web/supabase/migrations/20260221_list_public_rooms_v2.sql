-- Updated list_public_1v1_rooms to include player details and work with RLS
-- Uses security definer to bypass RLS and return all public room players

create or replace function public.list_public_1v1_rooms()
returns table (
  id uuid,
  game_type text,
  category text,
  rounds integer,
  created_at timestamptz,
  host_user_id uuid,
  status text,
  player_count integer,
  players jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_inactive_1v1_rooms();

  return query
  select
    r.id,
    r.game_type,
    r.category,
    r.rounds,
    r.created_at,
    r.host_user_id,
    r.status,
    count(rp.id)::int as player_count,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', rp.user_id,
        'display_name', rp.display_name,
        'agency', rp.agency,
        'is_host', rp.is_host,
        'ready', rp.ready,
        'score', rp.score
      )
    ) filter (where rp.user_id is not null), '[]'::jsonb) as players
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  where r.is_public = true
    and r.status in ('waiting', 'in_progress')
  group by r.id
  having count(rp.id) > 0
  or r.status = 'in_progress'
  order by 
    case r.status 
      when 'in_progress' then 0 
      when 'waiting' then 1 
      else 2 
    end,
    r.created_at desc
  limit 50;
end;
$$;

grant execute on function public.list_public_1v1_rooms() to authenticated;
