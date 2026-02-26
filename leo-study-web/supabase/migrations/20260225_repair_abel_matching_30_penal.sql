-- One-time hard repair for the known bad row:
-- Matching + 30s + penal with erroneous score 1720.
-- Finds the same user's best prior attempt in game_attempt_history and restores it.
-- If no prior attempt exists, deletes the bad leaderboard row.

with bad_row as (
  select l.id, l.user_id, l.score, l.created_at
  from public.leaderboard l
  where l.game = 'Matching'
    and l.match_duration = 30
    and l.match_filter = 'penal'
    and l.score = 1720
  order by l.created_at desc
  limit 1
),
prior_attempt as (
  select
    a.user_id,
    a.score,
    greatest(1, coalesce(nullif(a.correct, 0), floor(a.score / 10)))::int as round,
    a.created_at
  from public.game_attempt_history a
  join bad_row b on b.user_id = a.user_id
  where a.mode = 'matching'
    and a.duration = 30
    and a.filter = 'penal'
    and a.score < b.score
    and a.created_at < b.created_at
  order by a.score desc, a.created_at desc
  limit 1
),
updated as (
  update public.leaderboard l
  set
    score = p.score,
    round = p.round,
    created_at = least(l.created_at, p.created_at)
  from bad_row b
  join prior_attempt p on true
  where l.id = b.id
  returning l.id
)
delete from public.leaderboard l
using bad_row b
where l.id = b.id
  and not exists (select 1 from updated);
