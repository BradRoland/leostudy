-- Stable earned progression, repeat-safe challenges, and private room authorization.
begin;
create schema if not exists academy_progression_private;
revoke all on schema academy_progression_private from public,anon,authenticated;
create table academy_progression_private.progress (
 user_id uuid primary key references auth.users(id) on delete cascade,
 peak_base_xp bigint not null default 0 check(peak_base_xp>=0),
 legacy_offset bigint not null default 0 check(legacy_offset>=0)
);
create table academy_progression_private.events (
 attempt_id bigint primary key references public.game_attempt_history(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 recorded_at timestamptz not null default now(),
 correct integer not null check(correct>=0)
);
create index on academy_progression_private.events(user_id,recorded_at);
create table academy_progression_private.claims (
 user_id uuid not null references auth.users(id) on delete cascade,
 challenge text not null, period_start date not null, xp integer not null check(xp>0),
 claimed_at timestamptz not null default now(), primary key(user_id,challenge,period_start)
);
-- Import existing earned levels once. Future display snapshots cannot grant unlocks.
insert into academy_progression_private.progress(user_id,peak_base_xp)
 select user_id,least(100000000,greatest(0,coalesce((profile_details#>>'{levelSnapshot,totalXp}')::numeric,0)))::bigint
 from public.app_state;
create function academy_progression_private.number(j jsonb,k text) returns bigint
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(j->k)='number' then least(100000000,greatest(0,(j->>k)::numeric))::bigint else 0 end
$$;
create function academy_progression_private.base_xp(u uuid) returns bigint
language plpgsql security definer set search_path='' as $$
declare a public.app_state%rowtype; s jsonb; h jsonb; g jsonb; base bigint:=0; peak bigint;
begin
 select * into a from public.app_state where user_id=u;
 s:=coalesce(a.profile_details->'stats','{}'); h:=coalesce(a.high_scores,'{}'); g:=coalesce(s->'gamePlays','{}');
 base:=academy_progression_private.number(s,'studySeconds')/60
 +academy_progression_private.number(s,'studyDayStreak')*28
 +greatest(academy_progression_private.number(s,'bestStudyDayStreak'),coalesce(a.best_streak,0))*16
 +academy_progression_private.number(s,'lifetimeMasteredCodes')*70
 +academy_progression_private.number(s,'flashcardsReviewed')/4
 +academy_progression_private.number(s,'scenariosReviewed')*6
 +academy_progression_private.number(s,'achievementXp')
 +(academy_progression_private.number(g,'matching')+academy_progression_private.number(g,'speed')+academy_progression_private.number(g,'blaster'))*6
 +academy_progression_private.number(h,'matching')/18+academy_progression_private.number(h,'blaster')/20
 +(academy_progression_private.number(h,'caseFile')+academy_progression_private.number(h,'rapidFire')+academy_progression_private.number(h,'gravity'))/24;
 select coalesce(sum(wins*125::bigint+losses*35::bigint),0) into peak from public.duel_player_stats where user_id=u and game_type='all';
 return base+coalesce(peak,0);
end $$;
-- Carry historical bonuses forward without swallowing newly earned daily rewards.
update academy_progression_private.progress p set
 legacy_offset=greatest(0,p.peak_base_xp-academy_progression_private.base_xp(p.user_id)-coalesce((select total_bonus_xp from daily_reward_private.progress d where d.user_id=p.user_id),0)),
 peak_base_xp=greatest(0,p.peak_base_xp-coalesce((select total_bonus_xp from daily_reward_private.progress d where d.user_id=p.user_id),0));
create function academy_progression_private.total_xp(u uuid) returns bigint
language plpgsql security definer set search_path='' as $$
declare base bigint:=academy_progression_private.base_xp(u); daily bigint; bonus bigint; peak bigint;
begin
 insert into academy_progression_private.progress(user_id,peak_base_xp) values(u,base)
 on conflict(user_id) do update set peak_base_xp=greatest(progress.peak_base_xp,excluded.peak_base_xp+progress.legacy_offset)
 returning peak_base_xp into peak;
 select coalesce(total_bonus_xp,0) into daily from daily_reward_private.progress where user_id=u;
 select coalesce(sum(xp),0) into bonus from academy_progression_private.claims where user_id=u;
 return peak+coalesce(daily,0)+bonus;
end $$;
create function academy_progression_private.level(u uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare xp bigint:=academy_progression_private.total_xp(u); threshold bigint:=0; l integer;
begin
 for l in 1..99 loop
  threshold:=threshold+260+l*70+floor(power(l::numeric,1.52)*24)::bigint;
  if xp<threshold then return l; end if;
 end loop;
 return 100;
end $$;
create function academy_progression_private.record_attempt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Only finished, substantive attempts count; periods use server receipt time.
 if new.correct>=0 and new.incorrect>=0 and new.correct+new.incorrect>=5
 and new.correct+new.incorrect<=1000 and public.get_active_class_id(new.user_id) is not null then
  insert into academy_progression_private.events(attempt_id,user_id,correct)
  values(new.id,new.user_id,new.correct) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger academy_challenge_attempt after insert on public.game_attempt_history
 for each row execute function academy_progression_private.record_attempt();
create function public.get_academy_progression() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); day_start date:=(now() at time zone 'UTC')::date;
 week_start date:=date_trunc('week',now() at time zone 'UTC')::date; items jsonb; total bigint;
begin
 if u is null or not daily_reward_private.is_eligible(u) then raise exception 'Join an active class to earn progression';end if;
 total:=academy_progression_private.total_xp(u);
 with catalog(id,cadence,title,target,xp,metric,start_date) as (values
 ('daily_sessions','daily','Complete two practice sessions',2,60,'sessions',day_start),
 ('daily_correct','daily','Answer 20 questions correctly',20,80,'correct',day_start),
 ('weekly_sessions','weekly','Complete ten practice sessions',10,250,'sessions',week_start),
 ('weekly_days','weekly','Practice on three different days',3,200,'days',week_start)
 ), counted as (
 select c.*,case metric when 'sessions' then count(e.attempt_id) when 'correct' then coalesce(sum(e.correct),0)
 else count(distinct (e.recorded_at at time zone 'UTC')::date) end as progress
 from catalog c left join academy_progression_private.events e on e.user_id=u
 and e.recorded_at>=(c.start_date::timestamp at time zone 'UTC')
 and e.recorded_at<((c.start_date+case when cadence='daily' then 1 else 7 end)::timestamp at time zone 'UTC')
 group by c.id,c.cadence,c.title,c.target,c.xp,c.metric,c.start_date
 ) select jsonb_agg(jsonb_build_object('id',id,'cadence',cadence,'title',title,'target',target,'xp',xp,
 'progress',least(progress,target),'claimed',exists(select 1 from academy_progression_private.claims cl where cl.user_id=u and cl.challenge=c.id and cl.period_start=c.start_date),
 'resetsAt',(start_date+case when cadence='daily' then 1 else 7 end)::timestamp at time zone 'UTC') order by cadence,id) into items from counted c;
 return jsonb_build_object('totalXp',total,'level',academy_progression_private.level(u),'challenges',items);
end $$;
create function public.claim_academy_challenge(p_challenge text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); status jsonb; item jsonb; start_date date; awarded integer:=0;
begin
 status:=public.get_academy_progression();
 perform 1 from academy_progression_private.progress where user_id=u for update;
 select value into item from jsonb_array_elements(status->'challenges') where value->>'id'=p_challenge;
 if item is null then raise exception 'Unknown challenge';end if;
 if (item->>'progress')::int<(item->>'target')::int then raise exception 'Complete the challenge before claiming XP';end if;
 start_date:=case when item->>'cadence'='daily' then (now() at time zone 'UTC')::date else date_trunc('week',now() at time zone 'UTC')::date end;
 insert into academy_progression_private.claims(user_id,challenge,period_start,xp)
 values(u,p_challenge,start_date,(item->>'xp')::int) on conflict do nothing returning xp into awarded;
 return public.get_academy_progression()||jsonb_build_object('awardedXp',coalesce(awarded,0));
end $$;
create function academy_progression_private.guard_room() returns trigger
language plpgsql security definer set search_path='' as $$
declare l integer; settings jsonb:=coalesce(new.settings,'{}'); participant uuid;
begin
 if tg_op='UPDATE' and new.game_type is not distinct from old.game_type
 and new.settings is not distinct from old.settings and new.is_public is not distinct from old.is_public then return new;end if;
 l:=academy_progression_private.level(new.host_user_id);
 if tg_op='INSERT' and l<10 then raise exception 'Custom room hosting unlocks at Level 10. You can still join a classmate or practice against a bot.';end if;
 if new.game_type='connect4' and l<5 then raise exception 'Connect Four unlocks at Level 5';end if;
 if new.game_type='connect4' then
  for participant in select user_id from public.room_players where room_id=new.id loop
   if academy_progression_private.level(participant)<5 then raise exception 'Both players need Level 5 for Connect Four';end if;
  end loop;
 end if;
 if new.game_type='blaster' then
  if coalesce((settings->>'powerups_enabled')::boolean,false) and l<6 then raise exception 'Power-ups unlock at Level 6';end if;
  if coalesce((settings->>'blaster_overtime_enabled')::boolean,false) and l<8 then raise exception 'Overtime unlocks at Level 8';end if;
  if (coalesce((settings->>'blaster_sudden_death')::boolean,false) or settings->>'blaster_win_condition'='death') and l<12 then raise exception 'Knockout rules unlock at Level 12';end if;
 end if;
 return new;
end $$;
create trigger academy_room_unlock before insert or update of game_type,settings,is_public on public.rooms
 for each row execute function academy_progression_private.guard_room();
create function academy_progression_private.guard_player() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype;
begin
 select * into r from public.rooms where id=new.room_id for update;
 if r.game_type='connect4' and academy_progression_private.level(new.user_id)<5 then raise exception 'Connect Four unlocks at Level 5';end if;
 if exists(select 1 from public.room_players where room_id=new.room_id and user_id<>new.user_id group by room_id having count(*)>=2) then raise exception 'Room is full';end if;
 return new;
end $$;
create trigger academy_player_unlock before insert on public.room_players for each row execute function academy_progression_private.guard_player();
-- Direct writes must not bypass room codes or the checked room-management RPCs.
revoke insert,update on public.rooms from anon,authenticated;
revoke insert,update on public.room_players from anon,authenticated;
grant update(last_seen) on public.room_players to authenticated;
create or replace function public.join_1v1_room(
  p_room_id uuid default null,
  p_join_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_class_id uuid := public.get_active_class_id(auth.uid());
  v_room public.rooms%rowtype;
  v_slot integer;
  v_players integer;
  v_code text := regexp_replace(coalesce(p_join_code, ''), '[[:space:]-]', '', 'g');
  v_is_invite_room boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_class_id is null then
    raise exception 'Join a class before joining 1v1 rooms';
  end if;

  if p_room_id is not null then
    select * into v_room
    from public.rooms
    where id = p_room_id for update;
  elsif v_code <> '' then
    select * into v_room
    from public.rooms
    where join_code = v_code and class_id=v_class_id for update;
  else
    raise exception 'Room id or join code required';
  end if;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.class_id is distinct from v_class_id then
    raise exception 'This room belongs to another class';
  end if;


  if exists (
    select 1 from public.room_players rp
    where rp.room_id = v_room.id and rp.user_id = v_uid
  ) then
    return v_room.id;
  end if;

  if v_room.status <> 'waiting' then raise exception 'This room has already started or closed'; end if;
  if v_room.game_type='connect4' and academy_progression_private.level(v_uid)<5 then raise exception 'Connect Four unlocks at Level 5';end if;

  if to_regclass('public.duel_invites') is not null then
    select exists (
      select 1
      from public.duel_invites di
      where di.room_id = v_room.id
    )
    into v_is_invite_room;
  end if;

  if v_is_invite_room then
    if not exists (
      select 1
      from public.duel_invites di
      where di.room_id = v_room.id
        and di.class_id = v_class_id
        and (di.sender_user_id = v_uid or di.recipient_user_id = v_uid)
    ) then
      raise exception 'This room is invite-only';
    end if;
  elsif not v_room.is_public and (v_code !~ '^[0-9]{6}$' or v_code is distinct from v_room.join_code) then
    raise exception 'That room code is incorrect. Check the six digits with your classmate';
  end if;

  select count(*)::int into v_players
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_players >= 2 then
    raise exception 'Room is full';
  end if;

  if not exists (select 1 from public.room_players rp where rp.room_id = v_room.id and rp.slot_no = 1) then
    v_slot := 1;
  else
    v_slot := 2;
  end if;

  insert into public.room_players (room_id, user_id, slot_no, is_ready)
  values (v_room.id, v_uid, v_slot, false);

  return v_room.id;
end;
$$;

CREATE OR REPLACE FUNCTION public.get_1v1_room_details(p_room_id uuid)
 RETURNS TABLE(room jsonb, players jsonb, results jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select
    (row_to_json(r)::jsonb - 'join_code') || jsonb_build_object('join_code',case when public.is_room_participant(r.id,auth.uid()) then r.join_code else null end) as room,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rp.id,
        'room_id', rp.room_id,
        'user_id', rp.user_id,
        'slot_no', rp.slot_no,
        'is_ready', rp.is_ready,
        'score', rp.score,
        'total_time_ms', rp.total_time_ms,
        'fastest_round_ms', rp.fastest_round_ms,
        'current_round', rp.current_round,
        'last_seen', rp.last_seen,
        'finished_at', rp.finished_at
      ) order by rp.slot_no asc)
      from public.room_players rp
      where rp.room_id = r.id
    ), '[]'::jsonb) as players,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rr.id,
        'room_id', rr.room_id,
        'user_id', rr.user_id,
        'score', rr.score,
        'total_time_ms', rr.total_time_ms,
        'placement', rr.placement,
        'is_winner', rr.is_winner
      ) order by rr.placement asc, rr.score desc)
      from public.room_results rr
      where rr.room_id = r.id
    ), '[]'::jsonb) as results
  from public.rooms r
  where r.id = p_room_id and auth.uid() is not null
    and r.class_id=public.get_active_class_id(auth.uid())
    and (r.is_public or r.host_user_id=auth.uid() or public.is_room_participant(r.id,auth.uid()));
end;
$function$;
-- Replaced legacy RPCs must share the owner of their private helpers.
alter function public.join_1v1_room(uuid,text) owner to current_user;
alter function public.get_1v1_room_details(uuid) owner to current_user;
revoke all on all tables in schema academy_progression_private from public,anon,authenticated;
revoke all on all functions in schema academy_progression_private from public,anon,authenticated;
revoke all on function public.get_academy_progression(),public.claim_academy_challenge(text),public.join_1v1_room(uuid,text),public.get_1v1_room_details(uuid) from public,anon;
grant execute on function public.get_academy_progression(),public.claim_academy_challenge(text),public.join_1v1_room(uuid,text),public.get_1v1_room_details(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
