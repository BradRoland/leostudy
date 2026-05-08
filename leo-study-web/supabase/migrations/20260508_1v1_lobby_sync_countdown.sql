-- Make 1v1 match starts fair for both clients.
-- The ready/rematch RPCs now store started_at a few seconds in the future,
-- and round submission is blocked only until that shared server timestamp.

do $$
declare
  v_function_sql text;
  v_updated_sql text;
begin
  if to_regprocedure('public.set_1v1_ready(uuid, boolean)') is not null then
    v_function_sql := pg_get_functiondef('public.set_1v1_ready(uuid, boolean)'::regprocedure);
    v_updated_sql := replace(v_function_sql, 'started_at = now(),', 'started_at = now() + interval ''3 seconds'',');

    if v_updated_sql = v_function_sql then
      raise notice 'set_1v1_ready did not contain the expected started_at assignment.';
    else
      execute v_updated_sql;
    end if;
  end if;

  if to_regprocedure('public.rematch_1v1_room(uuid, text)') is not null then
    v_function_sql := pg_get_functiondef('public.rematch_1v1_room(uuid, text)'::regprocedure);
    v_updated_sql := replace(v_function_sql, 'started_at = now(),', 'started_at = now() + interval ''3 seconds'',');

    if v_updated_sql = v_function_sql then
      raise notice 'rematch_1v1_room did not contain the expected started_at assignment.';
    else
      execute v_updated_sql;
    end if;
  end if;

  if to_regprocedure('public.submit_1v1_round(uuid, integer, boolean, integer, integer)') is not null then
    v_function_sql := pg_get_functiondef('public.submit_1v1_round(uuid, integer, boolean, integer, integer)'::regprocedure);
    v_updated_sql := replace(
      v_function_sql,
      'if v_room.started_at is null or now() < (v_room.started_at + interval ''3 seconds'') then',
      'if v_room.started_at is null or now() < v_room.started_at then'
    );

    if v_updated_sql = v_function_sql then
      raise notice 'submit_1v1_round did not contain the expected countdown guard.';
    else
      execute v_updated_sql;
    end if;
  end if;
end $$;

grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;
grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;

select pg_notify('pgrst', 'reload schema');
