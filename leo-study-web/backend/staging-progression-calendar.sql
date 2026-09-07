-- Run only on the development clone as the migration owner. All fixtures roll back.
begin;
do $$
declare u uuid:=gen_random_uuid(); a uuid; c uuid; status jsonb; result jsonb;
 d date:=(now() at time zone 'UTC')::date; w date:=date_trunc('week',now() at time zone 'UTC')::date;
begin
 if current_database()<>'codex_class180_ui_test_20260906' then raise exception 'Development clone required';end if;
 insert into auth.users(id,email) values(u,'calendar-'||u||'@example.test');
 insert into public.profiles(user_id,username) values(u,'Calendar '||u);
 insert into public.academies(name) values('Synthetic calendar '||u) returning id into a;
 insert into public.academy_classes(academy_id,class_name,status,visibility,join_mode) values(a,'Synthetic calendar','active','unlisted','open') returning id into c;
 insert into public.class_memberships(user_id,class_id,role,status,is_active) values(u,c,'cadet','active',true);
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
 select u,c,'study_test','calendar_'||i,'all',10,10,0,100 from generate_series(1,3) i;
 -- Simulate three days in one weekly window, then move that window into history.
 with ranked as(select attempt_id,row_number() over(order by attempt_id)-1 as n from academy_progression_private.events where user_id=u)
 update academy_progression_private.events e set recorded_at=(w+ranked.n::int)::timestamp at time zone 'UTC' from ranked where e.attempt_id=ranked.attempt_id;
 result:=public.claim_academy_challenge('weekly_days');
 if (result->>'awardedXp')::int<>200 then raise exception 'Three-day reward failed';end if;
 update academy_progression_private.events set recorded_at=recorded_at-interval '7 days' where user_id=u;
 update academy_progression_private.claims set period_start=period_start-7 where user_id=u;
 status:=public.get_academy_progression();
 if (status->>'totalXp')::int<>200 then raise exception 'Prior-week XP was lost';end if;
 if exists(select 1 from jsonb_array_elements(status->'challenges') x where (x->>'claimed')::boolean or (x->>'progress')::int<>0) then raise exception 'New weekly window did not reset';end if;
 -- An attempt immediately before UTC midnight is excluded; midnight itself counts.
 update academy_progression_private.events set recorded_at=(d::timestamp at time zone 'UTC')-interval '1 second' where user_id=u;
 update academy_progression_private.events set recorded_at=d::timestamp at time zone 'UTC' where attempt_id=(select min(attempt_id) from academy_progression_private.events where user_id=u);
 perform set_config('TimeZone','America/Los_Angeles',true);
 status:=public.get_academy_progression();
 if (select (x->>'progress')::int from jsonb_array_elements(status->'challenges') x where x->>'id'='daily_sessions')<>1 then raise exception 'UTC daily boundary failed';end if;
 if (status->>'totalXp')::int<>200 then raise exception 'Calendar reset changed earned XP';end if;
 raise notice 'PASS: three distinct days, weekly reset, retained claimed XP, UTC midnight boundary and database timezone independence';
end $$;
rollback;
