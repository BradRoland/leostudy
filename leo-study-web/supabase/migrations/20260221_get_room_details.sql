-- Function to get room details for spectating (bypasses RLS)
-- Returns room, players, and results for a given room ID

create or replace function public.get_1v1_room_details(p_room_id uuid)
returns table (
  room jsonb,
  players jsonb,
  results jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    row_to_json(r)::jsonb as room,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', rp.id,
          'room_id', rp.room_id,
          'user_id', rp.user_id,
          'slot_no', rp.slot_no,
          'is_ready', rp.is_ready,
          'score', rp.score,
          'total_time_ms', rp.total_time_ms,
          'fastest_round_ms', rp.fastest_round_ms,
          'current_round', rp.current_round
        )
      ) filter (where rp.id is not null),
      '[]'::jsonb
    ) as players,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', rr.id,
          'room_id', rr.room_id,
          'user_id', rr.user_id,
          'score', rr.score,
          'total_time_ms', rr.total_time_ms,
          'placement', rr.placement,
          'is_winner', rr.is_winner
        )
      ) filter (where rr.id is not null),
      '[]'::jsonb
    ) as results
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  left join public.room_results rr on rr.room_id = r.id
  where r.id = p_room_id
  group by r.id;
end;
$$;

grant execute on function public.get_1v1_room_details(uuid) to authenticated;
