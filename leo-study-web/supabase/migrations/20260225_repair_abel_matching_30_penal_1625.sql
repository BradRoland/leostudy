-- One-time repair: remove bad Abel score (1625) from Matching 30s Penal leaderboard.
-- Behavior:
-- 1) Prefer the row owned by user "abel" (if public.profiles exists).
-- 2) If not resolvable, fallback to latest matching row with score=1625 for this mode.
-- 3) Restore prior attempt from game_attempt_history when available; otherwise delete row.

do $$
declare
  v_target_id uuid;
  v_target_user_id uuid;
begin
  if to_regclass('public.leaderboard') is null then
    raise exception 'public.leaderboard table not found';
  end if;

  -- Preferred lookup: Abel by username (if profiles table exists).
  if to_regclass('public.profiles') is not null then
    select l.id, l.user_id
    into v_target_id, v_target_user_id
    from public.leaderboard l
    join public.profiles p on p.user_id = l.user_id
    where l.game = 'Matching'
      and l.match_duration = 30
      and l.match_filter = 'penal'
      and l.score = 1625
      and lower(coalesce(p.username, '')) = 'abel'
    order by l.created_at desc
    limit 1;
  end if;

  -- Fallback lookup if profile table missing / username row not found.
  if v_target_id is null then
    select l.id, l.user_id
    into v_target_id, v_target_user_id
    from public.leaderboard l
    where l.game = 'Matching'
      and l.match_duration = 30
      and l.match_filter = 'penal'
      and l.score = 1625
    order by l.created_at desc
    limit 1;
  end if;

  if v_target_id is null then
    raise notice 'No Matching 30s Penal row with score 1625 found. No changes made.';
    return;
  end if;

  if to_regclass('public.game_attempt_history') is not null then
    with target_row as (
      select l.id, l.user_id, l.score, l.created_at
      from public.leaderboard l
      where l.id = v_target_id
      limit 1
    ),
    prior_attempt as (
      select
        a.user_id,
        a.score,
        greatest(1, coalesce(nullif(a.correct, 0), floor(a.score / 10)))::int as round,
        a.created_at
      from public.game_attempt_history a
      join target_row t on t.user_id = a.user_id
      where a.mode = 'matching'
        and a.duration = 30
        and a.filter = 'penal'
        and a.score < t.score
        and a.created_at < t.created_at
      order by a.score desc, a.created_at desc
      limit 1
    ),
    restored as (
      update public.leaderboard l
      set
        score = p.score,
        round = p.round,
        created_at = least(l.created_at, p.created_at)
      from prior_attempt p
      where l.id = v_target_id
      returning l.id
    )
    delete from public.leaderboard l
    where l.id = v_target_id
      and not exists (select 1 from restored);
  else
    -- If game_attempt_history does not exist, just remove the bad row.
    delete from public.leaderboard where id = v_target_id;
  end if;

  raise notice 'Repair complete for leaderboard row % (user %).', v_target_id, v_target_user_id;
end $$;
