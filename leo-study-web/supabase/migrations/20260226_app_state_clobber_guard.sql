-- Guard against accidental app_state clobbering where non-empty progress
-- gets overwritten by default/empty client state.

create or replace function public.guard_app_state_progress_clobber()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_perf_count integer := coalesce(jsonb_object_length(coalesce(old.performance, '{}'::jsonb)), 0);
  new_perf_count integer := coalesce(jsonb_object_length(coalesce(new.performance, '{}'::jsonb)), 0);
  old_best_streak integer := coalesce(old.best_streak, 0);
  new_best_streak integer := coalesce(new.best_streak, 0);
  old_stats jsonb := coalesce(old.profile_details -> 'stats', '{}'::jsonb);
  new_stats jsonb := coalesce(new.profile_details -> 'stats', '{}'::jsonb);
  old_study_seconds integer := coalesce((old_stats ->> 'studySeconds')::integer, 0);
  new_study_seconds integer := coalesce((new_stats ->> 'studySeconds')::integer, 0);
  old_study_day_streak integer := coalesce((old_stats ->> 'studyDayStreak')::integer, 0);
  new_study_day_streak integer := coalesce((new_stats ->> 'studyDayStreak')::integer, 0);
  old_flashcards integer := coalesce((old_stats ->> 'flashcardsReviewed')::integer, 0);
  new_flashcards integer := coalesce((new_stats ->> 'flashcardsReviewed')::integer, 0);
  old_scenarios integer := coalesce((old_stats ->> 'scenariosReviewed')::integer, 0);
  new_scenarios integer := coalesce((new_stats ->> 'scenariosReviewed')::integer, 0);
begin
  if old_perf_count > 0 and new_perf_count = 0 then
    new.performance := old.performance;
  end if;

  if old_best_streak > 0 and new_best_streak = 0 then
    new.best_streak := old.best_streak;
  end if;

  if (
    (old_study_seconds > 0 and new_study_seconds = 0) or
    (old_study_day_streak > 0 and new_study_day_streak = 0) or
    (old_flashcards > 0 and new_flashcards = 0) or
    (old_scenarios > 0 and new_scenarios = 0)
  ) then
    new.profile_details := jsonb_set(
      coalesce(new.profile_details, '{}'::jsonb),
      '{stats}',
      old_stats,
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_app_state_progress_clobber on public.app_state;
create trigger trg_guard_app_state_progress_clobber
before update on public.app_state
for each row
execute function public.guard_app_state_progress_clobber();
