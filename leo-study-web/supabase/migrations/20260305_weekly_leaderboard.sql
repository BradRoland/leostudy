create table if not exists public.weekly_leaderboard (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null check (game in ('Matching', 'Speed Test')),
  week_start timestamptz not null,
  match_duration int4 not null,
  match_filter text not null check (match_filter in ('all', 'penal', 'hs', 'vehicle')),
  score integer not null default 0,
  round integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists weekly_leaderboard_user_game_week_mode_key
  on public.weekly_leaderboard (user_id, game, week_start, match_duration, match_filter);

create index if not exists weekly_leaderboard_week_mode_rank_idx
  on public.weekly_leaderboard (week_start desc, game, match_duration, match_filter, score desc, round desc, updated_at desc);

alter table public.weekly_leaderboard enable row level security;

drop policy if exists weekly_leaderboard_select_all on public.weekly_leaderboard;
create policy weekly_leaderboard_select_all
on public.weekly_leaderboard
for select
using (true);

drop policy if exists weekly_leaderboard_insert_self on public.weekly_leaderboard;
create policy weekly_leaderboard_insert_self
on public.weekly_leaderboard
for insert
with check (auth.uid() = user_id);

drop policy if exists weekly_leaderboard_update_self on public.weekly_leaderboard;
create policy weekly_leaderboard_update_self
on public.weekly_leaderboard
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.weekly_leaderboard to authenticated;

create or replace function public.upsert_weekly_leaderboard(
  p_user_id uuid,
  p_game text,
  p_week_start timestamptz,
  p_match_duration int,
  p_match_filter text,
  p_score int,
  p_round int,
  p_attempted_at timestamptz default now()
)
returns void
language plpgsql
set search_path = public
as $$
begin
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
  values (
    p_user_id,
    p_game,
    p_week_start,
    p_match_duration,
    p_match_filter,
    greatest(0, coalesce(p_score, 0)),
    greatest(0, coalesce(p_round, 0)),
    coalesce(p_attempted_at, now()),
    coalesce(p_attempted_at, now())
  )
  on conflict (user_id, game, week_start, match_duration, match_filter)
  do update set
    score = greatest(public.weekly_leaderboard.score, excluded.score),
    round = case
      when excluded.score > public.weekly_leaderboard.score then excluded.round
      when excluded.score = public.weekly_leaderboard.score then greatest(public.weekly_leaderboard.round, excluded.round)
      else public.weekly_leaderboard.round
    end,
    updated_at = greatest(public.weekly_leaderboard.updated_at, excluded.updated_at);
end;
$$;

revoke all on function public.upsert_weekly_leaderboard(uuid, text, timestamptz, int, text, int, int, timestamptz) from public;
revoke all on function public.upsert_weekly_leaderboard(uuid, text, timestamptz, int, text, int, int, timestamptz) from anon;
grant execute on function public.upsert_weekly_leaderboard(uuid, text, timestamptz, int, text, int, int, timestamptz) to authenticated;

with weekly_candidates as (
  select
    gah.user_id,
    case
      when gah.mode = 'matching' then 'Matching'
      when gah.mode = 'speed' then 'Speed Test'
      else null
    end as game,
    (date_trunc('week', gah.created_at at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles') as week_start,
    coalesce(gah.duration, 0) as match_duration,
    gah.filter as match_filter,
    greatest(0, coalesce(gah.score, 0)) as score,
    greatest(0, coalesce(gah.correct, 0) + coalesce(gah.incorrect, 0)) as round,
    gah.created_at
  from public.game_attempt_history gah
  where gah.mode in ('matching', 'speed')
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

create or replace function public.reset_global_leaderboard_only()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_leaderboard integer := 0;
  v_deleted_weekly_leaderboard integer := 0;
  v_reset_high_scores integer := 0;
  v_is_owner boolean := false;
  v_uid uuid := auth.uid();
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_sql_editor boolean := current_user in ('postgres', 'supabase_admin');
  v_is_service_role boolean := v_jwt_role = 'service_role';
begin
  if not v_is_sql_editor and not v_is_service_role then
    if v_uid is null then
      raise exception 'Not authenticated';
    end if;

    if to_regclass('public.user_roles') is not null then
      select exists (
        select 1
        from public.user_roles
        where user_id = v_uid
          and role = 'owner'
      )
      into v_is_owner;
    end if;

    if not v_is_owner then
      raise exception 'Only owner can reset global leaderboard.';
    end if;
  end if;

  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard
    where true;
    get diagnostics v_deleted_leaderboard = row_count;
  end if;

  if to_regclass('public.weekly_leaderboard') is not null then
    delete from public.weekly_leaderboard
    where true;
    get diagnostics v_deleted_weekly_leaderboard = row_count;
  end if;

  if to_regclass('public.app_state') is not null then
    update public.app_state a
    set high_scores = (
      select coalesce(
        jsonb_object_agg(score_key, to_jsonb(0)),
        '{}'::jsonb
      )
      from jsonb_each(coalesce(a.high_scores, '{}'::jsonb)) as scores(score_key, score_value)
    ),
    updated_at = now();
    get diagnostics v_reset_high_scores = row_count;
  end if;

  return jsonb_build_object(
    'leaderboard_rows_deleted', v_deleted_leaderboard,
    'weekly_leaderboard_rows_deleted', v_deleted_weekly_leaderboard,
    'users_high_scores_reset', v_reset_high_scores,
    'performance_preserved', true,
    'profile_details_preserved', true,
    'best_streak_preserved', true,
    'duel_player_stats_preserved', true,
    'game_attempt_history_preserved', true
  );
end;
$$;

revoke all on function public.reset_global_leaderboard_only() from public;
revoke all on function public.reset_global_leaderboard_only() from anon;
grant execute on function public.reset_global_leaderboard_only() to authenticated;
