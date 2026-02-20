-- Fix 1v1 rematch readiness bug:
-- - players were staying is_ready=true after a match started
-- - completed matches then showed immediate "2/2 agreed" and "Cancel"
-- This migration guarantees readiness is always reset whenever a room starts.

-- One-time cleanup for existing active/completed rooms.
update public.room_players rp
set is_ready = false
from public.rooms r
where rp.room_id = r.id
  and r.status in ('in_progress', 'completed')
  and rp.is_ready = true;

create or replace function public.clear_1v1_ready_on_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'in_progress' and old.status is distinct from new.status then
    update public.room_players
    set is_ready = false
    where room_id = new.id
      and is_ready = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rooms_clear_1v1_ready_on_start on public.rooms;
create trigger trg_rooms_clear_1v1_ready_on_start
after update of status on public.rooms
for each row
when (new.status = 'in_progress' and old.status is distinct from new.status)
execute function public.clear_1v1_ready_on_start();
