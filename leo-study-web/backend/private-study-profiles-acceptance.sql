-- Read/write acceptance on synthetic rows only. Everything rolls back.
begin;
do $$ begin
  if current_database() <> 'codex_class180_ui_test_20260906' then
    raise exception 'This acceptance test is restricted to the isolated clone';
  end if;
end; $$;
create function pg_temp.assert_true(ok boolean, description text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %', description; end if; end;
$$;
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,aud,role)
select ('e1900000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
  'privacy-test-' || i || '@example.test','{}','{}','authenticated','authenticated'
from generate_series(1,5) i;
insert into public.profiles(user_id,username)
select ('e1900000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,'Privacy synthetic ' || i
from generate_series(1,5) i on conflict(user_id) do update set username=excluded.username;
insert into public.user_roles(user_id,role) values ('e1900000-0000-4000-8000-000000000005','owner');
insert into public.academies(id,name,city,state) values ('e1900000-0000-4000-9000-000000000001','Privacy acceptance academy','Synthetic','CA');
insert into public.academy_classes(id,academy_id,class_name,status,visibility,join_mode)
values ('e1900000-0000-4000-9000-000000000002','e1900000-0000-4000-9000-000000000001','Privacy class A','active','unlisted','open'),
('e1900000-0000-4000-9000-000000000003','e1900000-0000-4000-9000-000000000001','Privacy class B','active','unlisted','open');
insert into public.class_memberships(class_id,user_id,role,status,is_active)
values ('e1900000-0000-4000-9000-000000000002','e1900000-0000-4000-8000-000000000001','cadet','active',true),
('e1900000-0000-4000-9000-000000000002','e1900000-0000-4000-8000-000000000002','cadet','active',true),
('e1900000-0000-4000-9000-000000000003','e1900000-0000-4000-8000-000000000003','cadet','active',true);
insert into public.app_state(user_id,performance,high_scores,best_streak,profile_details)
values
('e1900000-0000-4000-8000-000000000001','{"PRIVATE_CODE":{"correctCount":20,"incorrectCount":0,"correctStreak":20}}','{"matching":200}',4,'{"firstName":"SECRET_OWN","stats":{"studySeconds":120}}'),
('e1900000-0000-4000-8000-000000000002','{"SECRET_PERFORMANCE":{"correctCount":20,"incorrectCount":0,"correctStreak":20}}','{"matching":700,"blaster":350,"privateField":"SECRET_SCORE"}',7,
'{"firstName":"SECRET_FIRST","lastName":"SECRET_LAST","dailyGoalMinutes":60,"studyFocus":["SECRET_FOCUS"],"namePresets":["SECRET_PRESET"],"systemNoticesSeen":["SECRET_NOTICE"],"themeId":"pastel-rose","profileDecorationKey":"auto","bio":"Public biography","agency":"Public department","nameStyle":{"color":"#123456","fontWeight":700,"privateField":"SECRET_STYLE"},"levelSnapshot":{"level":12,"totalXp":4000,"tierName":"Cadet","haloClass":"level-halo-blue","autoDecorationKey":"auto","privateField":"SECRET_LEVEL"},"currentActivity":{"key":"study","label":"Studying","updatedAt":"2026-09-06T00:00:00Z","privateField":"SECRET_ACTIVITY"},"algorithmSnapshot":{"SECRET_CODE_A":{"status":"Mastered"},"SECRET_CODE_B":{"correctStreak":20}},"stats":{"studySeconds":12345,"studyDayStreak":5,"bestStudyDayStreak":9,"lifetimeMasteredCodes":1,"achievementXp":50,"flashcardsReviewed":40,"sessionTracks":{"SECRET_TRACK":1},"sessionTimeline":["SECRET_TIMELINE"],"achievementAwardLedger":{"SECRET_LEDGER":1},"gamePlays":{"matching":10,"speed":8,"blaster":6,"privateField":"SECRET_GAME"},"studyModeCounts":{"penal":20,"all":4,"privateField":"SECRET_MODE"}}}'),
('e1900000-0000-4000-8000-000000000003','{}','{}',1,'{"firstName":"SECRET_OTHER_CLASS"}'),
('e1900000-0000-4000-8000-000000000004','{}','{}',1,'{"firstName":"SECRET_NEW_USER"}')
on conflict(user_id) do update set performance=excluded.performance,high_scores=excluded.high_scores,best_streak=excluded.best_streak,profile_details=excluded.profile_details;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.assert_true(not exists(select 1 from public.app_state),'anonymous raw study state denied');
select pg_temp.assert_true(not exists(select 1 from public.profiles),'anonymous profiles denied');
select pg_temp.assert_true(not exists(select 1 from public.user_roles),'anonymous roles denied');
do $$ begin
  begin perform * from public.public_study_profiles; raise exception 'FAILED: anonymous projection allowed';
  exception when insufficient_privilege then null; end;
end; $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1900000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=1 from public.app_state),'new unclassed user reads only own private row');
select pg_temp.assert_true((select count(*)=1 from public.public_study_profiles),'new unclassed user reads only own public row');
select pg_temp.assert_true((select count(*)=1 from public.profiles),'new unclassed user reads only own profile');
select pg_temp.assert_true(not exists(select 1 from public.user_roles),'new unclassed user cannot enumerate owner roles');

select set_config('request.jwt.claims','{"sub":"e1900000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=1 from public.app_state),'classmate cannot read another private row');
select pg_temp.assert_true((select profile_details->>'firstName'='SECRET_OWN' from public.app_state),'own private settings remain intact');
select pg_temp.assert_true((select count(*)=2 from public.public_study_profiles),'public summary limited to active class');
select pg_temp.assert_true((select count(*)=2 from public.profiles),'profile display limited to active class');
select pg_temp.assert_true(not exists(select 1 from public.public_study_profiles where user_id='e1900000-0000-4000-8000-000000000003'),'cross-class public summary denied');
select pg_temp.assert_true((select profile_details::text not like '%SECRET%' and high_scores::text not like '%SECRET%' from public.public_study_profiles where user_id='e1900000-0000-4000-8000-000000000002'),'private nested keys, per-code history, names, goals and sessions excluded');
select pg_temp.assert_true((select profile_details #>> '{stats,studySeconds}'='12345' and profile_details #>> '{stats,gamePlays,matching}'='10' and profile_details #>> '{levelSnapshot,level}'='12' and high_scores->>'matching'='700' and best_streak=7 and mastered_codes=2 and profile_details->>'publicMasteredCodes'='2' from public.public_study_profiles where user_id='e1900000-0000-4000-8000-000000000002'),'peer totals, scores, streak, level, appearance and aggregate mastery preserved');
select pg_temp.assert_true((select mastered_codes=1 from public.public_study_profiles where user_id='e1900000-0000-4000-8000-000000000001'),'legacy mastery derives from private performance without exposing it');
update public.app_state set best_streak=11 where user_id='e1900000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select best_streak=11 from public.app_state),'own state update remains allowed');
do $$ declare n integer; begin
  update public.app_state set best_streak=99 where user_id='e1900000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  perform pg_temp.assert_true(n=0,'peer state update denied');
  begin perform performance from public.public_study_profiles; raise exception 'FAILED: raw performance exposed by projection';
  exception when undefined_column then null; end;
end; $$;

select set_config('request.jwt.claims','{"sub":"e1900000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select pg_temp.assert_true(not exists(select 1 from public.app_state where user_id='e1900000-0000-4000-8000-000000000002'),'owner uses sanitized peer summaries too');
select pg_temp.assert_true(exists(select 1 from public.public_study_profiles where user_id='e1900000-0000-4000-8000-000000000003'),'owner can review safe summaries across classes');
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','study_profile_private.read_public_study_profiles()','execute'),'anonymous cannot call private definer');
select pg_temp.assert_true(not has_function_privilege('anon','public.reset_global_leaderboard_only()','execute'),'anonymous global reset execution denied without invoking it');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.reset_global_leaderboard_only()','execute'),'authenticated global reset execution denied without invoking it');
select pg_temp.assert_true(has_function_privilege('service_role','public.reset_global_leaderboard_only()','execute'),'global reset remains a privileged administrative operation');
select pg_temp.assert_true(not has_function_privilege('authenticated',f,'execute') and not has_function_privilege('anon',f,'execute') and has_function_privilege('service_role',f,'execute'),'internal helper restricted: ' || f)
from unnest(array['public.finish_1v1_room_by_score(uuid)','public.notify_streak_loss(uuid,text,uuid,text,integer,text)',
  'public.process_1v1_room_completion()','public.clear_1v1_ready_on_start()',
  'public.cleanup_inactive_1v1_rooms()','public.cleanup_public_messages_48h()']) f;
select pg_temp.assert_true((select reloptions @> array['security_invoker=true','security_barrier=true'] from pg_class where oid='public.public_study_profiles'::regclass),'public view has invoker and barrier protections');
rollback;
select 'PASS: anonymous, new-account, classmate, cross-class, owner, private JSON and own-save protections' as result;
