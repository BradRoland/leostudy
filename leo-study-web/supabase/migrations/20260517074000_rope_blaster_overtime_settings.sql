-- Add configurable Rope Blaster overtime settings without disturbing existing 1v1 RPC callers.

create or replace function public.create_1v1_room_v2(
  p_game_type text,
  p_category text,
  p_is_public boolean default true,
  p_rounds integer default 10,
  p_powerups_enabled boolean default false,
  p_blaster_duration_seconds integer default 30,
  p_blaster_sudden_death boolean default false,
  p_blaster_rope_limit integer default 900,
  p_blaster_overtime_enabled boolean default true,
  p_blaster_overtime_after_seconds integer default 45
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_game_type text := lower(trim(p_game_type));
  v_overtime_after_seconds integer := greatest(45, least(coalesce(p_blaster_overtime_after_seconds, 45), 90));
begin
  v_room_id := public.create_1v1_room(
    p_game_type,
    p_category,
    p_is_public,
    p_rounds,
    p_powerups_enabled,
    p_blaster_duration_seconds,
    p_blaster_sudden_death,
    p_blaster_rope_limit
  );

  if v_game_type = 'blaster' then
    update public.rooms
    set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'blaster_overtime_enabled', coalesce(p_blaster_overtime_enabled, true),
      'blaster_overtime_after_seconds', v_overtime_after_seconds
    )
    where id = v_room_id;
  end if;

  return v_room_id;
end;
$$;

revoke all on function public.create_1v1_room_v2(text, text, boolean, integer, boolean, integer, boolean, integer, boolean, integer) from public, anon;
grant execute on function public.create_1v1_room_v2(text, text, boolean, integer, boolean, integer, boolean, integer, boolean, integer) to authenticated, service_role;

create or replace function public.create_1v1_invite_v2(
  p_target_user_id uuid,
  p_game_type text,
  p_category text,
  p_rounds integer default 10,
  p_powerups_enabled boolean default false,
  p_blaster_duration_seconds integer default 30,
  p_blaster_sudden_death boolean default false,
  p_blaster_rope_limit integer default 900,
  p_blaster_overtime_enabled boolean default true,
  p_blaster_overtime_after_seconds integer default 45
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_room_id uuid;
  v_game_type text := lower(trim(p_game_type));
  v_overtime_after_seconds integer := greatest(45, least(coalesce(p_blaster_overtime_after_seconds, 45), 90));
begin
  v_result := public.create_1v1_invite(
    p_target_user_id,
    p_game_type,
    p_category,
    p_rounds,
    p_powerups_enabled,
    p_blaster_duration_seconds,
    p_blaster_sudden_death,
    p_blaster_rope_limit
  );

  if v_game_type = 'blaster' then
    v_room_id := nullif(v_result->>'room_id', '')::uuid;
    update public.rooms
    set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'blaster_overtime_enabled', coalesce(p_blaster_overtime_enabled, true),
      'blaster_overtime_after_seconds', v_overtime_after_seconds
    )
    where id = v_room_id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.create_1v1_invite_v2(uuid, text, text, integer, boolean, integer, boolean, integer, boolean, integer) from public, anon;
grant execute on function public.create_1v1_invite_v2(uuid, text, text, integer, boolean, integer, boolean, integer, boolean, integer) to authenticated, service_role;

do $$
declare
  v_sql text;
  v_next text;
begin
  if to_regprocedure('public.submit_1v1_round(uuid, integer, boolean, integer, integer)') is null then
    return;
  end if;

  v_sql := pg_get_functiondef('public.submit_1v1_round(uuid, integer, boolean, integer, integer)'::regprocedure);
  if position('blaster_overtime_after_seconds' in v_sql) > 0 then
    return;
  end if;

  v_next := replace(v_sql, 'v_score_gap integer;', 'v_score_gap integer;
  v_blaster_overtime_enabled boolean;
  v_blaster_overtime_after_seconds integer;');
  v_next := replace(
    v_next,
    $needle$  v_blaster_sudden_death_active := v_room.game_type = 'blaster'
    and now() >= v_room.started_at + make_interval(secs => 45);$needle$,
    $replacement$  v_blaster_overtime_enabled := coalesce((v_room.settings->>'blaster_overtime_enabled')::boolean, true);
  v_blaster_overtime_after_seconds := greatest(45, least(coalesce((v_room.settings->>'blaster_overtime_after_seconds')::integer, 45), 90));
  v_blaster_sudden_death_active := v_room.game_type = 'blaster'
    and v_blaster_overtime_enabled
    and now() >= v_room.started_at + make_interval(secs => v_blaster_overtime_after_seconds);$replacement$
  );

  execute v_next;
end $$;

do $$
declare
  v_sql text;
  v_next text;
begin
  if to_regprocedure('public.finish_1v1_blaster_timeout(uuid)') is null then
    return;
  end if;

  v_sql := pg_get_functiondef('public.finish_1v1_blaster_timeout(uuid)'::regprocedure);
  if position('blaster_overtime_after_seconds' in v_sql) > 0 then
    return;
  end if;

  v_next := replace(v_sql, 'v_score_gap integer;', 'v_score_gap integer;
  v_blaster_overtime_enabled boolean;
  v_blaster_overtime_after_seconds integer;');
  v_next := replace(
    v_next,
    $needle$  v_blaster_sudden_death_active := now() >= v_room.started_at + make_interval(secs => 45);$needle$,
    $replacement$  v_blaster_overtime_enabled := coalesce((v_room.settings->>'blaster_overtime_enabled')::boolean, true);
  v_blaster_overtime_after_seconds := greatest(45, least(coalesce((v_room.settings->>'blaster_overtime_after_seconds')::integer, 45), 90));
  v_blaster_sudden_death_active := v_blaster_overtime_enabled
    and now() >= v_room.started_at + make_interval(secs => v_blaster_overtime_after_seconds);$replacement$
  );

  execute v_next;
end $$;
