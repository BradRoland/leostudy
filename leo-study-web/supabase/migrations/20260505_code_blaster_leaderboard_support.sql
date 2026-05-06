-- Let Code Blaster use the same attempt history and weekly leaderboard pipes
-- as Matching and Speed Test. Safe to re-run.

do $$
declare
  v_constraint_name text;
begin
  if to_regclass('public.game_attempt_history') is not null then
    select c.conname
    into v_constraint_name
    from pg_constraint c
    where c.conrelid = 'public.game_attempt_history'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%mode%'
      and pg_get_constraintdef(c.oid) like '%study_test%'
      and pg_get_constraintdef(c.oid) like '%matching%'
      and pg_get_constraintdef(c.oid) like '%speed%'
    limit 1;

    if v_constraint_name is not null then
      execute format('alter table public.game_attempt_history drop constraint %I', v_constraint_name);
    end if;

    alter table public.game_attempt_history
      add constraint game_attempt_history_mode_check
      check (mode in ('study_test', 'matching', 'speed', 'blaster'));
  end if;

  if to_regclass('public.weekly_leaderboard') is not null then
    select c.conname
    into v_constraint_name
    from pg_constraint c
    where c.conrelid = 'public.weekly_leaderboard'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%game%'
      and pg_get_constraintdef(c.oid) like '%Matching%'
      and pg_get_constraintdef(c.oid) like '%Speed Test%'
    limit 1;

    if v_constraint_name is not null then
      execute format('alter table public.weekly_leaderboard drop constraint %I', v_constraint_name);
    end if;

    alter table public.weekly_leaderboard
      add constraint weekly_leaderboard_game_check
      check (game in ('Matching', 'Speed Test', 'Code Blaster'));
  end if;
end $$;

with weekly_candidates as (
  select
    gah.user_id,
    case
      when gah.mode = 'matching' then 'Matching'
      when gah.mode = 'speed' then 'Speed Test'
      when gah.mode = 'blaster' then 'Code Blaster'
      else null
    end as game,
    (date_trunc('week', gah.created_at at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles') as week_start,
    coalesce(gah.duration, 0) as match_duration,
    gah.filter as match_filter,
    greatest(0, coalesce(gah.score, 0)) as score,
    greatest(0, coalesce(gah.correct, 0) + coalesce(gah.incorrect, 0)) as round,
    gah.created_at
  from public.game_attempt_history gah
  where gah.mode in ('matching', 'speed', 'blaster')
    and gah.filter in ('all', 'penal', 'hs', 'vehicle')
    and gah.duration is not null
),
ranked as (
  select
    weekly_candidates.*,
    row_number() over (
      partition by user_id, game, week_start, match_duration, match_filter
      order by score desc, round desc, created_at desc
    ) as row_num
  from weekly_candidates
  where game is not null
)
insert into public.weekly_leaderboard (
  user_id,
  game,
  week_start,
  match_duration,
  match_filter,
  score,
  round,
  created_at,
  updated_at
)
select
  ranked.user_id,
  ranked.game,
  ranked.week_start,
  ranked.match_duration,
  ranked.match_filter,
  ranked.score,
  ranked.round,
  ranked.created_at,
  ranked.created_at
from ranked
where ranked.row_num = 1
on conflict (user_id, game, week_start, match_duration, match_filter)
do update set
  score = greatest(public.weekly_leaderboard.score, excluded.score),
  round = case
    when excluded.score > public.weekly_leaderboard.score then excluded.round
    when excluded.score = public.weekly_leaderboard.score then greatest(public.weekly_leaderboard.round, excluded.round)
    else public.weekly_leaderboard.round
  end,
  updated_at = greatest(public.weekly_leaderboard.updated_at, excluded.updated_at);

select pg_notify('pgrst', 'reload schema');
