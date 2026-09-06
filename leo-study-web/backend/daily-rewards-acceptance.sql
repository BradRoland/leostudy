-- Run only on the isolated clone. All fixture records and date simulations roll back.
begin;
do $$ begin
  if current_database() <> 'codex_class180_ui_test_20260906' then
    raise exception 'Daily reward acceptance is restricted to the isolated clone';
  end if;
end; $$;
create function pg_temp.assert_true(ok boolean, description text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %', description; end if; end;
$$;
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,aud,role)
select ('e1a90000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
  'daily-reward-acceptance-' || i || '@example.invalid','{}','{}','authenticated','authenticated'
from generate_series(1,4) i;
insert into public.profiles(user_id,username)
select ('e1a90000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,'Reward synthetic ' || i
from generate_series(1,4) i on conflict(user_id) do update set username=excluded.username;
insert into public.academies(id,name,city,state)
values ('e1a90000-0000-4000-9000-000000000001','Daily reward acceptance academy','Synthetic','CA');
insert into public.academy_classes(id,academy_id,class_name,status,visibility,join_mode)
values ('e1a90000-0000-4000-9000-000000000002','e1a90000-0000-4000-9000-000000000001','Reward acceptance class','active','unlisted','open');
insert into public.class_memberships(class_id,user_id,role,status,is_active)
select 'e1a90000-0000-4000-9000-000000000002',('e1a90000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,'cadet','active',true
from unnest(array[1,2,4]) i;
insert into public.banned_users(user_id,reason) values ('e1a90000-0000-4000-8000-000000000004','Synthetic eligibility test');
insert into public.app_state(user_id,profile_details)
values ('e1a90000-0000-4000-8000-000000000001','{"firstName":"PRIVATE_NAME","dailyRewardXp":999999,"stats":{"achievementXp":17}}'),
('e1a90000-0000-4000-8000-000000000002','{}');

select pg_temp.assert_true(not has_function_privilege('anon','public.claim_daily_reward()','execute'),'anonymous claim denied');
select pg_temp.assert_true(not has_function_privilege('anon','public.get_daily_reward_status()','execute'),'anonymous status denied');
select pg_temp.assert_true(not has_function_privilege('authenticated','daily_reward_private.status_for(uuid,date)','execute'),'caller cannot select another user/date');
select pg_temp.assert_true(not has_function_privilege('authenticated','daily_reward_private.is_eligible(uuid)','execute'),'internal eligibility helper unavailable');
select pg_temp.assert_true(not exists(select 1 from pg_proc where oid in ('public.claim_daily_reward()'::regprocedure,'public.get_daily_reward_status()'::regprocedure) and (prosecdef or pronargs<>0)),'public wrappers are invoker-only and have no client parameters');
select pg_temp.assert_true((select count(*)=2 from pg_class where oid in ('daily_reward_private.progress'::regclass,'daily_reward_private.claims'::regclass) and relrowsecurity),'both private tables enable RLS');

set local role anon;
do $$ begin
  begin perform public.claim_daily_reward(); raise exception 'FAILED: anonymous claim executed'; exception when insufficient_privilege then null; end;
end; $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1a90000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare s jsonb; begin
  s := public.get_daily_reward_status();
  perform pg_temp.assert_true((s->>'canClaim')::boolean and (s->>'cycleDay')::int=1 and (s->>'totalClaims')::int=0 and (s->>'rewardXp')::int=25,'fresh eligible account starts with25 XP');
  perform pg_temp.assert_true(s->>'serverDate'=((statement_timestamp() at time zone 'UTC')::date)::text,'server chooses UTC day');
  perform pg_temp.assert_true(s->>'resetsAt'=(((statement_timestamp() at time zone 'UTC')::date)+1)::text || 'T00:00:00Z','server returns exact next UTC reset');
  s := public.claim_daily_reward();
  perform pg_temp.assert_true((s->>'claimed')::boolean and (s->>'claimedToday')::boolean and not (s->>'canClaim')::boolean and (s->>'awardedXp')::int=25 and (s->>'totalBonusXp')::int=25 and (s->>'totalClaims')::int=1,'claim response immediately reflects committed25 XP and claimed state');
  s := public.claim_daily_reward();
  perform pg_temp.assert_true(not (s->>'claimed')::boolean and (s->>'awardedXp')::int=0 and (s->>'totalBonusXp')::int=25 and (s->>'totalClaims')::int=1,'same-day replay never awards twice');
  begin perform * from daily_reward_private.progress; raise exception 'FAILED: private progress readable'; exception when insufficient_privilege then null; end;
  begin update daily_reward_private.progress set total_bonus_xp=999999; raise exception 'FAILED: private progress writable'; exception when insufficient_privilege then null; end;
  begin delete from daily_reward_private.claims; raise exception 'FAILED: private ledger deletable'; exception when insufficient_privilege then null; end;
  begin perform daily_reward_private.status_for('e1a90000-0000-4000-8000-000000000002',current_date+1); raise exception 'FAILED: user/date helper executable'; exception when insufficient_privilege then null; end;
  perform pg_temp.assert_true(not exists(select 1 from public.app_state where user_id='e1a90000-0000-4000-8000-000000000002'),'raw cross-user state still blocked');
end; $$;

select set_config('request.jwt.claims','{"sub":"e1a90000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true((public.get_daily_reward_status()->>'totalBonusXp')::int=0,'another user receives its own reward status');
select pg_temp.assert_true((select (profile_details->>'dailyRewardXp')::int=25 and profile_details#>>'{stats,achievementXp}'='17' and not profile_details ? 'firstName' from public.public_study_profiles where user_id='e1a90000-0000-4000-8000-000000000001'),'safe peer projection uses server ledger bonus, preserves achievement XP and hides private identity');
select set_config('request.jwt.claims','{"sub":"e1a90000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  perform pg_temp.assert_true(not (public.get_daily_reward_status()->>'eligible')::boolean,'unclassed account ineligible');
  begin perform public.claim_daily_reward(); raise exception 'FAILED: unclassed user claimed'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claims','{"sub":"e1a90000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
  perform pg_temp.assert_true(not (public.get_daily_reward_status()->>'eligible')::boolean,'banned account ineligible');
  begin perform public.claim_daily_reward(); raise exception 'FAILED: banned user claimed'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claims','{"sub":"e1a90000-0000-4000-8000-999999999999","role":"authenticated"}',true);
do $$ begin
  begin perform public.claim_daily_reward(); raise exception 'FAILED: nonexistent user claimed'; exception when insufficient_privilege then null; end;
end; $$;

-- Advance only this synthetic ledger's dates. Browser time and the DB clock stay untouched.
reset role;
select set_config('request.jwt.claims','{"sub":"e1a90000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare i integer; s jsonb; expected integer[] := array[25,30,35,40,50,60,100,25]; total integer := 25; today date := (clock_timestamp() at time zone 'UTC')::date; begin
  for i in 2..8 loop
    update daily_reward_private.claims set claim_date=today-(9-i) where user_id='e1a90000-0000-4000-8000-000000000001' and claim_date=today;
    update daily_reward_private.progress set last_claim_date=today-(9-i) where user_id='e1a90000-0000-4000-8000-000000000001';
    s := public.get_daily_reward_status();
    perform pg_temp.assert_true((s->>'canClaim')::boolean and (s->>'cycleDay')::int=((i-1)%7)+1,'missed dates preserve the next cycle reward');
    s := public.claim_daily_reward(); total := total+expected[i];
    perform pg_temp.assert_true((s->>'awardedXp')::int=expected[i] and (s->>'totalBonusXp')::int=total and (s->>'totalClaims')::int=i,'seven reward steps and next cycle return exact totals');
  end loop;
  perform pg_temp.assert_true((s->>'cycleDay')::int=1 and (s->>'completedInCycle')::int=1 and (s->>'nextRewardXp')::int=30,'eighth claim starts the next seven-claim cycle');
end; $$;
select pg_temp.assert_true((select count(*)=8 and sum(awarded_xp)=365 from daily_reward_private.claims where user_id='e1a90000-0000-4000-8000-000000000001'),'ledger stores all awards exactly once');
select pg_temp.assert_true((select profile_details->>'dailyRewardXp'='999999' and profile_details#>>'{stats,achievementXp}'='17' from public.app_state where user_id='e1a90000-0000-4000-8000-000000000001'),'reward claims never mutate client study state');
select pg_temp.assert_true(not exists(select 1 from daily_reward_private.progress where user_id in ('e1a90000-0000-4000-8000-000000000003','e1a90000-0000-4000-8000-000000000004')),'denied users do not create ledger rows');
rollback;
select 'PASS: daily reward eligibility, UTC day, immediate response, replay, cycle, private ledger, class-scoped projection and forged raw XP isolation' as result;
