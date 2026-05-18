-- Keep public 1v1 room listings compatible with the actual room_players schema.

create or replace function public.list_public_1v1_rooms()
returns table (
  id uuid,
  game_type text,
  category text,
  rounds integer,
  created_at timestamptz,
  host_user_id uuid,
  status text,
  settings jsonb,
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
    coalesce(r.settings, '{}'::jsonb) as settings,
    count(rp.id)::int as player_count,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', rp.user_id,
        'display_name', coalesce(nullif(trim(p.username), ''), concat('User ', left(rp.user_id::text, 8))),
        'agency', coalesce(p.agency, ''),
        'is_host', rp.user_id = r.host_user_id or rp.slot_no = 1,
        'ready', rp.is_ready,
        'score', rp.score
      )
      order by rp.slot_no
    ) filter (where rp.user_id is not null), '[]'::jsonb) as players
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  left join public.profiles p on p.user_id = rp.user_id
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

revoke all on function public.list_public_1v1_rooms() from public, anon;
grant execute on function public.list_public_1v1_rooms() to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
