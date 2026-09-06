-- Applied to the isolated test database only during preview preparation.
-- Publish only explicit classmate display/stat fields; raw study state stays private.
begin;

create schema if not exists study_profile_private;
revoke all on schema study_profile_private from public, anon;
grant usage on schema study_profile_private to authenticated, service_role;

create or replace function study_profile_private.can_read_profile(p_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    p_subject = auth.uid()
    or public.is_owner(auth.uid())
    or exists (
      select 1 from public.class_memberships viewer
      join public.class_memberships subject on subject.class_id = viewer.class_id
      where viewer.user_id = auth.uid() and viewer.status = 'active' and viewer.is_active
        and subject.user_id = p_subject and subject.status = 'active'
    )
  );
$$;
revoke all on function study_profile_private.can_read_profile(uuid) from public, anon;
grant execute on function study_profile_private.can_read_profile(uuid) to authenticated, service_role;

-- Filter both keys and JSON types: unknown nested objects must never leak through.
create or replace function study_profile_private.pick_scalars(p_value jsonb, p_keys text[], p_types text[])
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(p_value) = 'object' then p_value else '{}'::jsonb end) e
  where e.key = any(p_keys) and jsonb_typeof(e.value) = any(p_types);
$$;
revoke all on function study_profile_private.pick_scalars(jsonb,text[],text[]) from public, anon, authenticated;

create or replace function study_profile_private.nonnegative_number(p_value jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'number' then greatest(0, floor(p_value::text::numeric)) else 0 end;
$$;
revoke all on function study_profile_private.nonnegative_number(jsonb) from public, anon, authenticated;

create or replace function study_profile_private.mastered_count(p_details jsonb, p_performance jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select greatest(
    study_profile_private.nonnegative_number(p_details #> '{stats,lifetimeMasteredCodes}'),
    case when jsonb_typeof(p_details->'algorithmSnapshot') = 'object' then (
      select count(*) from jsonb_each(p_details->'algorithmSnapshot') item
      where item.value->>'status' = 'Mastered'
        or study_profile_private.nonnegative_number(item.value->'correctStreak') >= 20
    ) else (
      select count(*) from jsonb_each(case when jsonb_typeof(p_performance) = 'object' then p_performance else '{}'::jsonb end) item
      where study_profile_private.nonnegative_number(item.value->'correctStreak') >= 20
        and study_profile_private.nonnegative_number(item.value->'correctCount')
          + study_profile_private.nonnegative_number(item.value->'incorrectCount') > 0
    ) end
  );
$$;
revoke all on function study_profile_private.mastered_count(jsonb,jsonb) from public, anon, authenticated;

create or replace function study_profile_private.read_public_study_profiles()
returns table(user_id uuid, profile_details jsonb, high_scores jsonb, best_streak integer, mastered_codes numeric)
language sql stable security definer set search_path = '' as $$
  select s.user_id,
    study_profile_private.pick_scalars(s.profile_details,
      array['bio','agency','themeId','profileDecorationKey'], array['string'])
    || jsonb_build_object(
      'publicMasteredCodes', study_profile_private.mastered_count(s.profile_details, s.performance),
      'nameStyle', study_profile_private.pick_scalars(s.profile_details->'nameStyle',
        array['color','fontFamily','fontWeight','fontStyle','glowEnabled','glowIntensity'], array['string','number','boolean']),
      'levelSnapshot', study_profile_private.pick_scalars(s.profile_details->'levelSnapshot',
        array['level','tierName','totalXp','haloClass','autoDecorationKey'], array['string','number']),
      'currentActivity', study_profile_private.pick_scalars(s.profile_details->'currentActivity',
        array['key','label','updatedAt'], array['string']),
      'stats', study_profile_private.pick_scalars(s.profile_details->'stats',
        array['studySeconds','studyDayStreak','bestStudyDayStreak','flashcardsReviewed','scenariosReviewed','achievementXp'], array['number'])
        || jsonb_build_object(
          'gamePlays', study_profile_private.pick_scalars(s.profile_details #> '{stats,gamePlays}', array['matching','speed','blaster'], array['number']),
          'studyModeCounts', study_profile_private.pick_scalars(s.profile_details #> '{stats,studyModeCounts}', array['all','penal','hs','vehicle'], array['number'])
        )
    ),
    study_profile_private.pick_scalars(s.high_scores, array['matching','blaster','caseFile','rapidFire','gravity'], array['number']),
    s.best_streak,
    study_profile_private.mastered_count(s.profile_details, s.performance)
  from public.app_state s
  where study_profile_private.can_read_profile(s.user_id);
$$;
revoke all on function study_profile_private.read_public_study_profiles() from public, anon;
grant execute on function study_profile_private.read_public_study_profiles() to authenticated, service_role;

-- The invoker view exposes only the authorized, sanitized function result.
-- It has no raw-table foreign keys that can be used for embedded private selects.
create or replace view public.public_study_profiles
with (security_invoker = true, security_barrier = true) as
select * from study_profile_private.read_public_study_profiles();
revoke all on public.public_study_profiles from public, anon, authenticated;
grant select on public.public_study_profiles to authenticated, service_role;

drop policy if exists app_state_read_all on public.app_state;
drop policy if exists app_state_read_self on public.app_state;
create policy app_state_read_self on public.app_state for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists profiles_read_all on public.profiles;
drop policy if exists profiles_read_classmates on public.profiles;
create policy profiles_read_classmates on public.profiles for select to authenticated
using (study_profile_private.can_read_profile(user_id));

drop policy if exists user_roles_read_owner_or_self on public.user_roles;
drop policy if exists user_roles_read_classmates_or_self on public.user_roles;
create policy user_roles_read_classmates_or_self on public.user_roles for select to authenticated
using (user_id = (select auth.uid()) or public.is_owner((select auth.uid()))
  or (role = 'owner' and study_profile_private.can_read_profile(user_id)));

comment on view public.public_study_profiles is 'Authenticated classmate display and aggregate study statistics only. Private settings, per-code history, names, goals, session traces, and saved presets are excluded.';

-- This inherited admin utility checks current_user inside SECURITY DEFINER,
-- where it always sees the function owner. It must never be a browser RPC.
revoke all on function public.reset_global_leaderboard_only() from public, anon, authenticated;
grant execute on function public.reset_global_leaderboard_only() to service_role;

-- Internal maintenance/completion helpers have no browser caller. Authorized
-- definer RPCs and triggers retain their owner rights when invoking them.
revoke all on function public.finish_1v1_room_by_score(uuid),
  public.notify_streak_loss(uuid,text,uuid,text,integer,text),
  public.process_1v1_room_completion(), public.clear_1v1_ready_on_start(),
  public.cleanup_inactive_1v1_rooms(), public.cleanup_public_messages_48h()
  from public, anon, authenticated;
grant execute on function public.finish_1v1_room_by_score(uuid),
  public.notify_streak_loss(uuid,text,uuid,text,integer,text),
  public.process_1v1_room_completion(), public.clear_1v1_ready_on_start(),
  public.cleanup_inactive_1v1_rooms(), public.cleanup_public_messages_48h()
  to service_role;
notify pgrst, 'reload schema';
commit;
