-- Development rollout: apply only to the retained isolated clone until approved.
-- Daily rewards are independent of client-writable study/achievement XP.
begin;

create schema if not exists daily_reward_private;
revoke all on schema daily_reward_private from public, anon;
grant usage on schema daily_reward_private to authenticated, service_role;

create table daily_reward_private.progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_claims bigint not null default 0 check (total_claims >= 0),
  total_bonus_xp bigint not null default 0 check (total_bonus_xp >= 0),
  last_claim_date date,
  check ((total_claims = 0 and total_bonus_xp = 0 and last_claim_date is null)
    or (total_claims > 0 and total_bonus_xp > 0 and last_claim_date is not null))
);
create table daily_reward_private.claims (
  user_id uuid not null references daily_reward_private.progress(user_id) on delete cascade,
  claim_date date not null,
  claim_number bigint not null check (claim_number > 0),
  cycle_day integer not null check (cycle_day between 1 and 7 and cycle_day = ((claim_number - 1) % 7) + 1),
  awarded_xp integer not null check (awarded_xp = (array[25,30,35,40,50,60,100])[cycle_day]),
  claimed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, claim_date),
  unique (user_id, claim_number)
);
alter table daily_reward_private.progress enable row level security;
alter table daily_reward_private.claims enable row level security;
create policy rewards_progress_self on daily_reward_private.progress for select to authenticated
  using (user_id = (select auth.uid()));
create policy rewards_claims_self on daily_reward_private.claims for select to authenticated
  using (user_id = (select auth.uid()));
-- Browser roles use the no-argument RPCs; they cannot edit or read the ledger.
revoke all on daily_reward_private.progress, daily_reward_private.claims from public, anon, authenticated;
grant all on daily_reward_private.progress, daily_reward_private.claims to service_role;

create function daily_reward_private.is_eligible(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.class_memberships m where m.user_id = p_user and m.status = 'active' and m.is_active)
    and not exists (select 1 from public.banned_users b where b.user_id = p_user);
$$;
revoke all on function daily_reward_private.is_eligible(uuid) from public, anon, authenticated;

-- Internal date argument makes claim and response use the same locked UTC day.
-- It is never exposed as an API parameter or granted to a browser role.
create function daily_reward_private.status_for(p_user uuid, p_today date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_progress daily_reward_private.progress%rowtype;
  v_claimed boolean;
  v_eligible boolean;
  v_day integer;
  v_completed integer;
  v_schedule constant integer[] := array[25,30,35,40,50,60,100];
begin
  select * into v_progress from daily_reward_private.progress where user_id = p_user;
  v_progress.total_claims := coalesce(v_progress.total_claims, 0);
  v_progress.total_bonus_xp := coalesce(v_progress.total_bonus_xp, 0);
  v_claimed := coalesce(v_progress.last_claim_date = p_today, false);
  v_eligible := daily_reward_private.is_eligible(p_user);
  v_completed := case when v_claimed then ((v_progress.total_claims - 1) % 7)::integer + 1 else (v_progress.total_claims % 7)::integer end;
  v_day := case when v_claimed then v_completed else v_completed + 1 end;
  return jsonb_build_object(
    'serverDate', to_char(p_today, 'YYYY-MM-DD'),
    'resetsAt', to_char(p_today + 1, 'YYYY-MM-DD') || 'T00:00:00Z',
    'eligible', v_eligible, 'claimedToday', v_claimed, 'canClaim', v_eligible and not v_claimed,
    'totalClaims', v_progress.total_claims, 'totalBonusXp', v_progress.total_bonus_xp,
    'cycleDay', v_day, 'completedInCycle', v_completed,
    'rewardXp', v_schedule[v_day], 'nextRewardXp', v_schedule[(v_progress.total_claims % 7)::integer + 1]
  );
end;
$$;
revoke all on function daily_reward_private.status_for(uuid,date) from public, anon, authenticated;

create function daily_reward_private.read_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not exists (select 1 from auth.users where id = v_user) then
    raise exception 'Sign in to view your daily reward.' using errcode = '42501';
  end if;
  return daily_reward_private.status_for(v_user, (statement_timestamp() at time zone 'UTC')::date);
end;
$$;
revoke all on function daily_reward_private.read_status() from public, anon;
grant execute on function daily_reward_private.read_status() to authenticated, service_role;

create function daily_reward_private.claim()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_progress daily_reward_private.progress%rowtype;
  v_today date;
  v_day integer;
  v_xp integer;
  v_schedule constant integer[] := array[25,30,35,40,50,60,100];
begin
  if v_user is null or not exists (select 1 from auth.users where id = v_user) then
    raise exception 'Sign in to claim your daily reward.' using errcode = '42501';
  end if;
  if not daily_reward_private.is_eligible(v_user) then
    raise exception 'Join an active class before claiming a daily reward.' using errcode = '42501';
  end if;
  insert into daily_reward_private.progress(user_id) values (v_user) on conflict (user_id) do nothing;
  select * into v_progress from daily_reward_private.progress where user_id = v_user for update;
  -- Read the clock after acquiring the lock; a claim queued across midnight uses
  -- the day on which it can actually be awarded, independent of browser time.
  v_today := (clock_timestamp() at time zone 'UTC')::date;
  if v_progress.last_claim_date = v_today then
    return daily_reward_private.status_for(v_user, v_today) || jsonb_build_object('claimed', false, 'awardedXp', 0);
  end if;
  v_day := (v_progress.total_claims % 7)::integer + 1;
  v_xp := v_schedule[v_day];
  insert into daily_reward_private.claims(user_id, claim_date, claim_number, cycle_day, awarded_xp)
    values (v_user, v_today, v_progress.total_claims + 1, v_day, v_xp);
  update daily_reward_private.progress set total_claims = total_claims + 1,
    total_bonus_xp = total_bonus_xp + v_xp, last_claim_date = v_today where user_id = v_user;
  return daily_reward_private.status_for(v_user, v_today) || jsonb_build_object('claimed', true, 'awardedXp', v_xp);
end;
$$;
revoke all on function daily_reward_private.claim() from public, anon;
grant execute on function daily_reward_private.claim() to authenticated, service_role;

create function public.get_daily_reward_status()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select daily_reward_private.read_status();
$$;
create function public.claim_daily_reward()
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select daily_reward_private.claim();
$$;
revoke all on function public.get_daily_reward_status(), public.claim_daily_reward() from public, anon;
grant execute on function public.get_daily_reward_status(), public.claim_daily_reward() to authenticated, service_role;

-- Preserve the existing projection shape and class boundary. The only new
-- field is a server-owned scalar; raw client JSON cannot forge this bonus.
create or replace function study_profile_private.read_public_study_profiles()
returns table(user_id uuid, profile_details jsonb, high_scores jsonb, best_streak integer, mastered_codes numeric)
language sql stable security definer set search_path = '' as $$
  select s.user_id,
    study_profile_private.pick_scalars(s.profile_details,
      array['bio','agency','themeId','profileDecorationKey'], array['string'])
    || jsonb_build_object(
      'dailyRewardXp', coalesce(r.total_bonus_xp, 0),
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
  left join daily_reward_private.progress r on r.user_id = s.user_id
  where study_profile_private.can_read_profile(s.user_id);
$$;
revoke all on function study_profile_private.read_public_study_profiles() from public, anon;
grant execute on function study_profile_private.read_public_study_profiles() to authenticated, service_role;

comment on function public.claim_daily_reward() is 'Authenticated self-only claim once per server UTC day. Seven-claim cycle persists across missed days; no client XP or date accepted.';
comment on table daily_reward_private.claims is 'Append-only application reward ledger. Browser roles have no table privileges; unique user/date prevents duplicate awards.';
notify pgrst, 'reload schema';
commit;
