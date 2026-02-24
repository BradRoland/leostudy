create table if not exists public.game_attempt_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('study_test', 'matching', 'speed')),
  track_key text not null,
  filter text not null check (filter in ('all', 'penal', 'hs', 'vehicle')),
  duration int4,
  score int4 not null default 0,
  correct int4 not null default 0,
  incorrect int4 not null default 0,
  accuracy int4 not null default 0 check (accuracy >= 0 and accuracy <= 100),
  rank int4,
  created_at timestamptz not null default now()
);

create index if not exists idx_game_attempt_history_user_created
  on public.game_attempt_history (user_id, created_at desc);

create index if not exists idx_game_attempt_history_track_created
  on public.game_attempt_history (user_id, track_key, created_at desc);

create unique index if not exists idx_game_attempt_history_unique_point
  on public.game_attempt_history (user_id, track_key, created_at, score);

alter table public.game_attempt_history enable row level security;

drop policy if exists game_attempt_history_select_self on public.game_attempt_history;
create policy game_attempt_history_select_self
on public.game_attempt_history
for select
using (auth.uid() = user_id);

drop policy if exists game_attempt_history_insert_self on public.game_attempt_history;
create policy game_attempt_history_insert_self
on public.game_attempt_history
for insert
with check (auth.uid() = user_id);

grant select, insert on public.game_attempt_history to authenticated;

with track_rows as (
  select
    a.user_id,
    coalesce(a.updated_at, now()) as updated_at,
    kv.key as track_key,
    kv.value as track_value
  from public.app_state a
  cross join lateral jsonb_each(coalesce(a.profile_details->'stats'->'sessionTracks', '{}'::jsonb)) as kv
),
parsed_tracks as (
  select
    tr.user_id,
    tr.updated_at,
    tr.track_key,
    tr.track_value,
    case
      when tr.track_key like 'study_test|%' then 'study_test'
      when tr.track_key like 'matching|%' then 'matching'
      when tr.track_key like 'speed|%' then 'speed'
      else null
    end as mode,
    coalesce(nullif(substring(tr.track_key from '\|f=([^|]+)'), ''), 'all') as filter,
    nullif(substring(tr.track_key from '\|d=([^|]+)'), '')::int as duration
  from track_rows tr
),
score_points as (
  select
    pt.user_id,
    pt.mode,
    pt.track_key,
    pt.filter,
    pt.duration,
    pt.updated_at,
    sp.ordinality as score_index,
    coalesce(jsonb_array_length(coalesce(pt.track_value->'scoreHistory', '[]'::jsonb)), 0) as score_total,
    greatest(0, (sp.value)::int) as score,
    case
      when coalesce(pt.track_value->'accuracyHistory'->>((sp.ordinality - 1)::int), '') ~ '^-?\d+$'
        then greatest(0, least(100, (pt.track_value->'accuracyHistory'->>((sp.ordinality - 1)::int))::int))
      else 0
    end as accuracy
  from parsed_tracks pt
  cross join lateral jsonb_array_elements_text(coalesce(pt.track_value->'scoreHistory', '[]'::jsonb)) with ordinality as sp(value, ordinality)
  where pt.mode is not null
    and pt.filter in ('all', 'penal', 'hs', 'vehicle')
),
inserted_history as (
  insert into public.game_attempt_history (
    user_id,
    mode,
    track_key,
    filter,
    duration,
    score,
    correct,
    incorrect,
    accuracy,
    rank,
    created_at
  )
  select
    sp.user_id,
    sp.mode,
    sp.track_key,
    sp.filter,
    sp.duration,
    sp.score,
    0,
    0,
    sp.accuracy,
    null,
    sp.updated_at - ((sp.score_total - sp.score_index) * interval '45 seconds')
  from score_points sp
  on conflict do nothing
  returning 1
)
insert into public.game_attempt_history (
  user_id,
  mode,
  track_key,
  filter,
  duration,
  score,
  correct,
  incorrect,
  accuracy,
  rank,
  created_at
)
select
  pt.user_id,
  pt.mode,
  pt.track_key,
  pt.filter,
  pt.duration,
  greatest(0, coalesce((pt.track_value->'lastAttempt'->>'score')::int, 0)) as score,
  greatest(0, coalesce((pt.track_value->'lastAttempt'->>'correct')::int, 0)) as correct,
  greatest(0, coalesce((pt.track_value->'lastAttempt'->>'incorrect')::int, 0)) as incorrect,
  greatest(0, least(100, coalesce((pt.track_value->'lastAttempt'->>'accuracy')::int, 0))) as accuracy,
  case
    when coalesce(pt.track_value->'lastAttempt'->>'rank', '') ~ '^-?\d+$'
      then nullif((pt.track_value->'lastAttempt'->>'rank')::int, 0)
    else null
  end as rank,
  pt.updated_at
from parsed_tracks pt
where pt.mode is not null
  and pt.filter in ('all', 'penal', 'hs', 'vehicle')
  and pt.track_value ? 'lastAttempt'
  and not exists (
    select 1
    from score_points sp
    where sp.user_id = pt.user_id
      and sp.track_key = pt.track_key
  )
on conflict do nothing;
