-- Development clone only. Real Postgres regression; every fixture and schedule edit rolls back.
-- Run as the migration owner. Public RPCs always keep their real UTC clock.
begin;
do $$
declare
 u uuid:=gen_random_uuid(); a uuid; c uuid;
 d date:=(now() at time zone 'UTC')::date;
 w date:=date_trunc('week',now() at time zone 'UTC')::date;
 first_week date; original_daily_start date; seen text[]:='{}';
 selected jsonb; item jsonb; result jsonb; challenge record;
 offset_weeks int; i int; j int; attempts int; mode_name text; code_name text;
 correct_count int; incorrect_count int; attempt bigint;
 before_xp bigint; awarded_total bigint:=0; publicly_claimed int:=0; day_goals int:=0;
 unknown_id text; day_goal_id text; day_goal_position int; old_timezone text:=current_setting('TimeZone');
begin
 if current_database()<>'codex_class180_ui_test_20260906' then
  raise exception 'Development clone required';
 end if;
 if (select count(*) from academy_progression_private.weekly_catalog)<>100 then
  raise exception 'Expected exactly 100 weekly challenges';
 end if;
 select weekly_starts_on,starts_on into first_week,original_daily_start
 from academy_progression_private.rotation_config;
 if extract(isodow from first_week)<>1 then raise exception 'Weekly epoch must be a Monday';end if;

 for i in 0..49 loop
  selected:=academy_progression_private.weekly_for_date(first_week+i*7);
  if jsonb_array_length(selected)<>2 then raise exception 'Weekly slot count failed';end if;
  for j in 1..6 loop
   if selected<>academy_progression_private.weekly_for_date(first_week+i*7+j) then
    raise exception 'Goals changed before the next Monday: week %, day %',i,j;
   end if;
  end loop;
  for item in select value from jsonb_array_elements(selected) loop
   if item->>'id'=any(seen) then raise exception 'Repeated weekly goal within the 50-week cycle';end if;
   seen:=array_append(seen,item->>'id');
  end loop;
 end loop;
 if cardinality(seen)<>100
 or academy_progression_private.weekly_for_date(first_week)<>academy_progression_private.weekly_for_date(first_week+350)
 or academy_progression_private.weekly_for_date(first_week)=academy_progression_private.weekly_for_date(first_week+7) then
  raise exception 'Weekly rotation coverage, Monday change, or cycle wrap failed';
 end if;
 selected:=academy_progression_private.weekly_for_date(first_week-1);
 if jsonb_array_length(selected)<>2
 or not exists(select 1 from jsonb_array_elements(selected) x where x->>'id'='weekly_sessions' and (x->>'xp')::int=250)
 or not exists(select 1 from jsonb_array_elements(selected) x where x->>'id'='weekly_days' and (x->>'xp')::int=200)
 or selected<>academy_progression_private.weekly_for_date(first_week-7) then
  raise exception 'Existing weekly goals and rewards were not preserved';
 end if;

 insert into auth.users(id,email) values(u,'weekly-rotation-'||u||'@example.test');
 insert into public.profiles(user_id,username) values(u,'Weekly rotation '||u);
 insert into public.academies(name) values('Synthetic weekly rotation '||u) returning id into a;
 insert into public.academy_classes(academy_id,class_name,status,visibility,join_mode)
 values(a,'Synthetic weekly rotation','active','unlisted','open') returning id into c;
 insert into public.class_memberships(user_id,class_id,role,status,is_active)
 values(u,c,'cadet','active',true);
 perform set_config('request.jwt.claim.sub',u::text,true);

 for challenge in select * from academy_progression_private.weekly_catalog order by position loop
  -- Only this uncommitted transaction sees each test goal assigned to the actual current week.
  select n into offset_weeks from generate_series(0,49) n
  where challenge.position in ((n*2*37)%100,((n*2+1)*37)%100) limit 1;
  update academy_progression_private.rotation_config set weekly_starts_on=w-offset_weeks*7;
  delete from public.game_attempt_history where user_id=u;
  selected:=public.get_academy_progression();
  select value into item from jsonb_array_elements(selected->'challenges') where value->>'id'=challenge.id;
  if item is null or item->>'cadence'<>'weekly' or (item->>'progress')::int<>0
  or (item->>'claimed')::boolean then raise exception 'Fresh weekly goal not empty: %',challenge.id;end if;
  if (item->>'resetsAt')::timestamptz<>((w+7)::timestamp at time zone 'UTC') then
   raise exception 'Weekly reset is not next Monday UTC: %',challenge.id;
  end if;
  begin
   perform public.claim_academy_challenge(challenge.id);
   raise exception 'Premature weekly reward accepted: %',challenge.id;
  exception when others then if sqlerrm not like 'Complete the challenge%' then raise;end if;end;

  insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
  values(u,c,coalesce(challenge.game_mode,'study_test'),'short_'||challenge.id,coalesce(challenge.code_filter,'all'),4,4,0,100);
  if exists(select 1 from academy_progression_private.events where user_id=u) then raise exception 'Four-answer attempt counted';end if;

  if challenge.game_mode is not null or challenge.code_filter is not null then
   if challenge.game_mode is not null then
    insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
    values(u,c,case when challenge.game_mode='matching' then 'speed' else 'matching' end,
     'wrong_mode_'||challenge.id,coalesce(challenge.code_filter,'all'),100,100,0,100);
   end if;
   if challenge.code_filter is not null then
    insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
    values(u,c,coalesce(challenge.game_mode,'study_test'),'wrong_code_'||challenge.id,'all',100,100,0,100);
   end if;
   select value into item from jsonb_array_elements(public.get_academy_progression()->'challenges') where value->>'id'=challenge.id;
   if (item->>'progress')::int<>0 then raise exception 'Wrong mode or code set counted: %',challenge.id;end if;
   delete from public.game_attempt_history where user_id=u;
  end if;

  if challenge.metric in ('accurate','perfect','accurate_correct') then
   insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
   values(u,c,coalesce(challenge.game_mode,'study_test'),'fake_accuracy_'||challenge.id,coalesce(challenge.code_filter,'all'),3,3,2,100);
   select value into item from jsonb_array_elements(public.get_academy_progression()->'challenges') where value->>'id'=challenge.id;
   if (item->>'progress')::int<>0 then raise exception 'Client accuracy bypassed correctness: %',challenge.id;end if;
   delete from public.game_attempt_history where user_id=u;
  end if;

  if challenge.metric in ('filters','balanced') then
   insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
   values(u,c,'study_test','mixed_'||challenge.id,'all',100,100,0,100);
   select value into item from jsonb_array_elements(public.get_academy_progression()->'challenges') where value->>'id'=challenge.id;
   if (item->>'progress')::int<>0 or item->>'codeFilter'<>'penal' then raise exception 'Mixed codes counted as a specific set';end if;
   delete from public.game_attempt_history where user_id=u;
  end if;

  if challenge.metric='balanced' then
   insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
   select u,c,'study_test','below_balance_'||code,code,challenge.balanced_correct-1,challenge.balanced_correct-1,0,100
   from unnest(array['penal','hs','vehicle']) code;
   select value into item from jsonb_array_elements(public.get_academy_progression()->'challenges') where value->>'id'=challenge.id;
   if (item->>'progress')::int<>0 then raise exception 'Balanced threshold counted too early: %',challenge.id;end if;
   delete from public.game_attempt_history where user_id=u;
  end if;

  if challenge.metric='modes' then
   for i in 1..4 loop
    insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
    values(u,c,'study_test','repeat_mode_'||i,'all',20,20,0,100);
   end loop;
   select value into item from jsonb_array_elements(public.get_academy_progression()->'challenges') where value->>'id'=challenge.id;
   if (item->>'progress')::int<>1 or item->>'practicePath'<>'/games/matching' then
    raise exception 'Mode variety or next-mode recommendation failed';
   end if;
   delete from public.game_attempt_history where user_id=u;
  end if;

  if challenge.metric='days' then
   insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
   select u,c,coalesce(challenge.game_mode,'study_test'),'same_day_'||n,coalesce(challenge.code_filter,'all'),10,10,0,100
   from generate_series(1,7) n;
   select value into item from jsonb_array_elements(public.get_academy_progression()->'challenges') where value->>'id'=challenge.id;
   if (item->>'progress')::int<>1 then raise exception 'Repeated sessions counted as additional UTC days: %',challenge.id;end if;
   delete from public.game_attempt_history where user_id=u;
  end if;

  if challenge.metric in ('comeback','improve') then
   for i in 1..4 loop
    insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
    values(u,c,case when i=3 then 'matching' else 'study_test' end,'chronology_'||i,
     case when i=4 then 'vehicle' else 'all' end,case when i=2 then 3 else 10 end,
     case when i=2 then 3 else 10 end,case when i=2 then 2 else 0 end,100) returning id into attempt;
    update academy_progression_private.events set recorded_at=(d::timestamp at time zone 'UTC')+i*interval '1 second' where attempt_id=attempt;
   end loop;
   select value into item from jsonb_array_elements(public.get_academy_progression()->'challenges') where value->>'id'=challenge.id;
   if (item->>'progress')::int<>0 then raise exception 'Wrong-order, cross-mode or cross-code improvement counted';end if;
   delete from public.game_attempt_history where user_id=u;
  end if;

  attempts:=case challenge.metric
   when 'sessions' then challenge.target when 'accurate' then challenge.target when 'perfect' then challenge.target
   when 'comeback' then challenge.target+1 when 'improve' then challenge.target+1
   when 'modes' then 4 when 'filters' then 3 when 'balanced' then 3 when 'days' then 7 else 1 end;
  for i in 1..attempts loop
   mode_name:=coalesce(challenge.game_mode,case when challenge.metric='modes' then (array['study_test','matching','speed','blaster'])[i] else 'study_test' end);
   code_name:=coalesce(challenge.code_filter,case when challenge.metric in ('filters','balanced') then (array['penal','hs','vehicle'])[i] else 'all' end);
   correct_count:=greatest(challenge.target,challenge.min_answers,coalesce(challenge.balanced_correct,10),30);incorrect_count:=0;
   if challenge.metric in ('comeback','improve') and i=1 then correct_count:=3;incorrect_count:=2;end if;
   -- A bogus zero accuracy field cannot hide correct answers. Client created_at is not a reward clock.
   insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy,created_at)
   values(u,c,mode_name,challenge.id||'_'||i,code_name,correct_count,correct_count,incorrect_count,0,now()-interval '90 days') returning id into attempt;
   if (select (recorded_at at time zone 'UTC')::date from academy_progression_private.events where attempt_id=attempt)<>d then
    raise exception 'Client timestamp changed server receipt date';
   end if;
   -- Day fixtures can cover a synthetic full week. Only the private evaluator receives Sunday.
   update academy_progression_private.events set recorded_at=
    case when challenge.metric='days' then ((w+i-1)::timestamp at time zone 'UTC')
    else (d::timestamp at time zone 'UTC')+i*interval '1 second' end where attempt_id=attempt;
  end loop;
  select value into item from jsonb_array_elements(academy_progression_private.challenges_at(u,w+6)) where value->>'id'=challenge.id;
  if item is null or (item->>'progress')::int<>challenge.target then raise exception 'Full-week goal not satisfied: % / %',challenge.id,item;end if;

  selected:=public.get_academy_progression();
  select value into item from jsonb_array_elements(selected->'challenges') where value->>'id'=challenge.id;
  if challenge.metric='days' then
   day_goals:=day_goals+1;
   if (item->>'progress')::int<>least(challenge.target,d-w+1) then raise exception 'Future UTC days counted by public RPC: %',challenge.id;end if;
  elsif (item->>'progress')::int<>challenge.target then raise exception 'Current-day weekly goal not satisfied: %',challenge.id;
  end if;
  if (item->>'progress')::int<challenge.target then
   before_xp:=(selected->>'totalXp')::bigint;
   begin
    perform public.claim_academy_challenge(challenge.id);
    raise exception 'Future-day work was claimable: %',challenge.id;
   exception when others then if sqlerrm not like 'Complete the challenge%' then raise;end if;end;
   if (public.get_academy_progression()->>'totalXp')::bigint<>before_xp then raise exception 'Rejected future work changed XP';end if;
  else
   before_xp:=(selected->>'totalXp')::bigint;
   result:=public.claim_academy_challenge(challenge.id);
   if (result->>'awardedXp')::int<>challenge.xp or (result->>'totalXp')::bigint<>before_xp+challenge.xp then
    raise exception 'Weekly award mismatch: %',challenge.id;
   end if;
   awarded_total:=awarded_total+challenge.xp;publicly_claimed:=publicly_claimed+1;
   result:=public.claim_academy_challenge(challenge.id);
   if (result->>'awardedXp')::int<>0 or (result->>'totalXp')::bigint<>before_xp+challenge.xp then
    raise exception 'Duplicate weekly reward: %',challenge.id;
   end if;
  end if;
  select value into item from jsonb_array_elements(academy_progression_private.challenges_at(u,w+350)) where value->>'id'=challenge.id;
  if item is null or (item->>'progress')::int<>0 or (item->>'claimed')::boolean then
   raise exception 'A later occurrence inherited progress or a claim: %',challenge.id;
  end if;
 end loop;
 if publicly_claimed < 100-day_goals then raise exception 'Not all eligible goals received a real public claim';end if;
 if (public.get_academy_progression()->>'totalXp')::bigint<>awarded_total then raise exception 'Previously earned XP was lost';end if;

 begin perform public.claim_academy_challenge('weekly_not_real');raise exception 'Unknown weekly goal accepted';
 exception when others then if sqlerrm<>'Unknown challenge' then raise;end if;end;
 select id into unknown_id from academy_progression_private.weekly_catalog
 where id not in(select x->>'id' from jsonb_array_elements(academy_progression_private.weekly_for_date(d)) x) limit 1;
 begin perform public.claim_academy_challenge(unknown_id);raise exception 'Inactive weekly goal accepted';
 exception when others then if sqlerrm<>'Unknown challenge' then raise;end if;end;

 -- Historical reward fixture proves ledger retention after a reset; it does not bypass a public claim.
 insert into academy_progression_private.claims(user_id,challenge,period_start,xp)
 values(u,'weekly_days',w-7,200);
 if (public.get_academy_progression()->>'totalXp')::bigint<>awarded_total+200 then raise exception 'Historical weekly reward was lost';end if;

 -- UTC boundaries are independent of the session timezone, including a synthetic Monday and Tuesday.
 select id,position into day_goal_id,day_goal_position from academy_progression_private.weekly_catalog where metric='days' and game_mode is null and code_filter is null order by target desc limit 1;
 if day_goal_id is null then raise exception 'Day-consistency coverage missing';end if;
 select n into offset_weeks from generate_series(0,49) n where day_goal_position in ((n*2*37)%100,((n*2+1)*37)%100) limit 1;
 update academy_progression_private.rotation_config set weekly_starts_on=w-offset_weeks*7;
 delete from public.game_attempt_history where user_id=u;
 for i in 0..3 loop
  insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
  values(u,c,'study_test','utc_boundary_'||i,'all',10,10,0,100) returning id into attempt;
  update academy_progression_private.events set recorded_at=(w::timestamp at time zone 'UTC')+
   case i when 0 then -interval '1 second' when 1 then interval '0 seconds' when 2 then interval '1 day' else interval '2 days' end
  where attempt_id=attempt;
 end loop;
 perform set_config('TimeZone','America/Los_Angeles',true);
 for i in 0..2 loop
  select value into item from jsonb_array_elements(academy_progression_private.challenges_at(u,w+i)) where value->>'id'=day_goal_id;
  if item is null or (item->>'progress')::int<>i+1 then raise exception 'UTC week/day boundary failed: day % / %',i,item;end if;
 end loop;
 perform set_config('TimeZone',old_timezone,true);

 if (select starts_on from academy_progression_private.rotation_config)<>original_daily_start then raise exception 'Weekly rotation changed the daily schedule';end if;
 if has_table_privilege('authenticated','academy_progression_private.weekly_catalog','SELECT')
 or has_table_privilege('authenticated','academy_progression_private.weekly_catalog','INSERT')
 or has_table_privilege('authenticated','academy_progression_private.rotation_config','UPDATE')
 or has_table_privilege('anon','academy_progression_private.weekly_catalog','SELECT')
 or has_function_privilege('authenticated','academy_progression_private.weekly_for_date(date)','EXECUTE')
 or has_function_privilege('authenticated','academy_progression_private.challenges_at(uuid,date)','EXECUTE')
 or has_function_privilege('anon','academy_progression_private.weekly_for_date(date)','EXECUTE') then
  raise exception 'Private weekly schedule or evaluator exposed to clients';
 end if;
 raise notice 'PASS: 100 weekly goals evaluated; % real public claims; % day goals checked without overriding the server clock; wrong mode/filter/short attempts/fake accuracy rejected; balanced thresholds and improvement chronology; UTC boundaries; 50-week coverage, stable weekdays, rollover, legacy preservation, XP retention and private permissions',publicly_claimed,day_goals;
end $$;
rollback;
