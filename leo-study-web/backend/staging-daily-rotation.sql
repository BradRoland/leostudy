-- Development clone only. Exercises every challenge against real Postgres functions; rolls back all fixtures.
begin;
do $$
declare u uuid:=gen_random_uuid(); a uuid; c uuid; d date:=(now() at time zone 'UTC')::date; first_day date; seen text[]:='{}'; selected jsonb; item jsonb; before_xp bigint; result jsonb; challenge record; offset_days int; i int; mode text; code text; correct_count int; incorrect_count int; previous_id bigint;
begin
 if current_database()<>'codex_class180_ui_test_20260906' then raise exception 'Development clone required';end if;
 if (select count(*) from academy_progression_private.daily_catalog)<>100 then raise exception 'Expected exactly 100 challenges';end if;
 select starts_on into first_day from academy_progression_private.rotation_config;
 for i in 0..49 loop
  selected:=academy_progression_private.daily_for_date(first_day+i);
  if jsonb_array_length(selected)<>2 then raise exception 'Daily slot count failed';end if;
  for item in select value from jsonb_array_elements(selected) loop
   if item->>'id'=any(seen) then raise exception 'Repeated challenge within the 50-day cycle';end if;
   seen:=array_append(seen,item->>'id');
  end loop;
 end loop;
 if cardinality(seen)<>100 or academy_progression_private.daily_for_date(first_day)<>academy_progression_private.daily_for_date(first_day+50) then raise exception 'Rotation coverage/repeat period failed';end if;
 if not exists(select 1 from jsonb_array_elements(academy_progression_private.daily_for_date(first_day-1)) x where x->>'id'='daily_sessions') then raise exception 'Existing day was not preserved';end if;
 insert into auth.users(id,email) values(u,'rotation-'||u||'@example.test');
 insert into public.profiles(user_id,username) values(u,'Rotation '||u);
 insert into public.academies(name) values('Synthetic rotation '||u) returning id into a;
 insert into public.academy_classes(academy_id,class_name,status,visibility,join_mode) values(a,'Synthetic rotation','active','unlisted','open') returning id into c;
 insert into public.class_memberships(user_id,class_id,role,status,is_active) values(u,c,'cadet','active',true);
 perform set_config('request.jwt.claim.sub',u::text,true);
 for challenge in select * from academy_progression_private.daily_catalog order by position loop
  -- Changing the schedule inside this transaction is invisible to other users and is rolled back.
  -- The original epoch may have been changed by the preceding test; derive the inverse permutation directly.
  select day into offset_days from generate_series(0,49) day where challenge.position in ((day*2*37)%100,((day*2+1)*37)%100) limit 1;
  update academy_progression_private.rotation_config set starts_on=d-offset_days;
  delete from public.game_attempt_history where user_id=u;
  selected:=public.get_academy_progression();
  select value into item from jsonb_array_elements(selected->'challenges') where value->>'id'=challenge.id;
  if item is null or (item->>'progress')::int<>0 then raise exception 'Fresh challenge not empty: %',challenge.id;end if;
  begin
   perform public.claim_academy_challenge(challenge.id);
   raise exception 'Premature reward was accepted: %',challenge.id;
  exception when others then
   if sqlerrm not like 'Complete the challenge%' then raise;end if;
  end;
  -- A four-answer attempt must never count, even if it is perfect.
  insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
  values(u,c,coalesce(challenge.game_mode,'study_test'),'short_'||challenge.id,coalesce(challenge.code_filter,'all'),4,4,0,100);
  if exists(select 1 from academy_progression_private.events where user_id=u) then raise exception 'Short attempt counted';end if;
  if challenge.game_mode is not null or challenge.code_filter is not null then
   if challenge.game_mode is not null then
    insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
    values(u,c,case when challenge.game_mode='matching' then 'speed' else 'matching' end,'wrong_mode_'||challenge.id,coalesce(challenge.code_filter,'all'),30,30,0,100);
   end if;
   if challenge.code_filter is not null then
    insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
    values(u,c,coalesce(challenge.game_mode,'study_test'),'wrong_code_'||challenge.id,'all',30,30,0,100);
   end if;
   select value into item from jsonb_array_elements(public.get_academy_progression()->'challenges') where value->>'id'=challenge.id;
   if (item->>'progress')::int<>0 then raise exception 'Wrong mode or code set counted: %',challenge.id;end if;
   delete from public.game_attempt_history where user_id=u;
  end if;
  if challenge.metric in ('accurate','perfect','accurate_correct') then
   insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
   values(u,c,coalesce(challenge.game_mode,'study_test'),'bad_accuracy_'||challenge.id,coalesce(challenge.code_filter,'all'),3,3,2,100);
   select value into item from jsonb_array_elements(public.get_academy_progression()->'challenges') where value->>'id'=challenge.id;
   if (item->>'progress')::int<>0 then raise exception 'Client accuracy bypassed correctness: %',challenge.id;end if;
   delete from public.game_attempt_history where user_id=u;
  end if;
  if challenge.metric in ('filters','balanced') then
   insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
   values(u,c,'study_test','mixed_'||challenge.id,'all',30,30,0,100);
   select value into item from jsonb_array_elements(public.get_academy_progression()->'challenges') where value->>'id'=challenge.id;
   if (item->>'progress')::int<>0 or item->>'codeFilter'<>'penal' then raise exception 'Mixed codes counted as a specific set';end if;
   delete from public.game_attempt_history where user_id=u;
  end if;
  if challenge.metric='modes' then
   for i in 1..3 loop
    insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
    values(u,c,'study_test','repeat_mode_'||i,'all',15,15,0,100);
   end loop;
   select value into item from jsonb_array_elements(public.get_academy_progression()->'challenges') where value->>'id'=challenge.id;
   if (item->>'progress')::int<>1 or item->>'practicePath'<>'/games/matching' then raise exception 'Mode variety or next-mode recommendation failed';end if;
   delete from public.game_attempt_history where user_id=u;
  end if;
  if challenge.metric in ('comeback','improve') then
   insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
   values(u,c,'study_test','earlier_good','all',10,10,0,100),(u,c,'study_test','later_bad','all',3,3,2,60),(u,c,'matching','other_mode_good','all',10,10,0,100);
   select value into item from jsonb_array_elements(public.get_academy_progression()->'challenges') where value->>'id'=challenge.id;
   if (item->>'progress')::int<>0 then raise exception 'Wrong-order or cross-mode improvement counted';end if;
   delete from public.game_attempt_history where user_id=u;
  end if;
  for i in 1..3 loop
   mode:=coalesce(challenge.game_mode,case when challenge.metric='modes' then (array['study_test','matching','speed'])[i] else 'study_test' end);
   code:=coalesce(challenge.code_filter,case when challenge.metric in ('filters','balanced') then (array['penal','hs','vehicle'])[i] else 'all' end);
   correct_count:=15;incorrect_count:=0;
   if challenge.metric in ('comeback','improve') and i=1 then correct_count:=3;incorrect_count:=2;end if;
   insert into public.game_attempt_history(user_id,class_id,mode,track_key,filter,score,correct,incorrect,accuracy)
   values(u,c,mode,challenge.id||'_'||i,code,correct_count,correct_count,incorrect_count,0) returning id into previous_id;
   -- A bogus client accuracy field is deliberately ignored; correctness is recomputed.
  end loop;
  selected:=public.get_academy_progression();
  select value into item from jsonb_array_elements(selected->'challenges') where value->>'id'=challenge.id;
  if (item->>'progress')::int<>challenge.target then raise exception 'Goal not satisfied: % / %',challenge.id,item;end if;
  before_xp:=(selected->>'totalXp')::bigint;
  result:=public.claim_academy_challenge(challenge.id);
  if (result->>'awardedXp')::int<>challenge.xp or (result->>'totalXp')::bigint<>before_xp+challenge.xp then raise exception 'Award mismatch: %',challenge.id;end if;
  result:=public.claim_academy_challenge(challenge.id);
  if (result->>'awardedXp')::int<>0 then raise exception 'Duplicate reward: %',challenge.id;end if;
 end loop;
 -- An inactive goal and a made-up ID cannot be claimed.
 begin perform public.claim_academy_challenge('daily_not_real');raise exception 'Unknown goal accepted';exception when others then if sqlerrm<>'Unknown challenge' then raise;end if;end;
 select id into mode from academy_progression_private.daily_catalog where id not in(select x->>'id' from jsonb_array_elements(academy_progression_private.daily_for_date(d)) x) limit 1;
 begin perform public.claim_academy_challenge(mode);raise exception 'Inactive goal accepted';exception when others then if sqlerrm<>'Unknown challenge' then raise;end if;end;
 -- Client fields and direct table access cannot set dates, catalog choices or reward amounts.
 if has_table_privilege('authenticated','academy_progression_private.daily_catalog','INSERT') or has_function_privilege('authenticated','academy_progression_private.daily_for_date(date)','EXECUTE') then raise exception 'Private rotation exposed';end if;
 raise notice 'PASS: all 100 goals completed and awarded once, short sessions ignored, computed accuracy, current-day eligibility, 50-day nonrepeat coverage, cycle wrap and private catalog permissions';
end $$;
rollback;
