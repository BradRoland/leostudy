create or replace function public.rematch_1v1_room(
  p_room_id uuid,
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Rematch is disabled. Start a new 1v1 game instead.';
end;
$$;

revoke all on function public.rematch_1v1_room(uuid, text) from public, anon;
grant execute on function public.rematch_1v1_room(uuid, text) to authenticated, service_role;
