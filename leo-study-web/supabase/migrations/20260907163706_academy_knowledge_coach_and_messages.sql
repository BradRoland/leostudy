-- Apply to the retained development clone only until production is approved.
begin;
create schema if not exists academy_private;
revoke all on schema academy_private from public;
grant usage on schema academy_private to authenticated, service_role;

create table public.academy_dm_threads (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.academy_classes(id) on delete cascade,
 user_low uuid not null references auth.users(id) on delete cascade, user_high uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_sender uuid references auth.users(id) on delete set null,
 check(user_low < user_high), unique(class_id,user_low,user_high)
);
create index academy_dm_low on public.academy_dm_threads(user_low,updated_at desc);
create index academy_dm_high on public.academy_dm_threads(user_high,updated_at desc);
create table public.academy_dm_messages (
 id uuid primary key default gen_random_uuid(), thread_id uuid not null references public.academy_dm_threads(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade, body text not null check(length(btrim(body)) between 1 and 2000),
 client_nonce uuid not null, created_at timestamptz not null default now(), unique(sender_id,client_nonce)
);
create index academy_dm_history on public.academy_dm_messages(thread_id,created_at desc,id);
create index academy_dm_rate on public.academy_dm_messages(sender_id,created_at desc);
create table public.academy_dm_reads (
 thread_id uuid not null references public.academy_dm_threads(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, read_at timestamptz not null default now(),primary key(thread_id,user_id)
);
create table public.academy_dm_blocks (
 user_id uuid not null references auth.users(id) on delete cascade, blocked_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(user_id,blocked_id), check(user_id<>blocked_id)
);
create function academy_private.can_read_dm(p_class uuid,p_low uuid,p_high uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() in(p_low,p_high)
 and exists(select 1 from public.class_memberships where class_id=p_class and user_id=p_low and status='active' and is_active)
 and exists(select 1 from public.class_memberships where class_id=p_class and user_id=p_high and status='active' and is_active)
$$;
revoke all on function academy_private.can_read_dm(uuid,uuid,uuid) from public;
grant execute on function academy_private.can_read_dm(uuid,uuid,uuid) to authenticated;
alter table public.academy_dm_threads enable row level security;
alter table public.academy_dm_messages enable row level security;
alter table public.academy_dm_reads enable row level security;
alter table public.academy_dm_blocks enable row level security;
create policy dm_thread_members on public.academy_dm_threads for select to authenticated using(academy_private.can_read_dm(class_id,user_low,user_high));
create policy dm_message_members on public.academy_dm_messages for select to authenticated using(exists(select 1 from public.academy_dm_threads t where t.id=thread_id));
create policy dm_read_members on public.academy_dm_reads for select to authenticated using(exists(select 1 from public.academy_dm_threads t where t.id=thread_id));
create policy dm_block_owner on public.academy_dm_blocks for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.academy_dm_threads,public.academy_dm_messages,public.academy_dm_reads,public.academy_dm_blocks from anon,authenticated;
grant select on public.academy_dm_threads,public.academy_dm_messages,public.academy_dm_reads,public.academy_dm_blocks to authenticated;
grant all on public.academy_dm_threads,public.academy_dm_messages,public.academy_dm_reads,public.academy_dm_blocks to service_role;

create function public.start_academy_dm(p_class uuid,p_peer uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); lo uuid; hi uuid; result uuid;
begin
 if actor is null or p_peer is null or actor=p_peer then raise exception 'Choose a classmate to message';end if;
 lo:=least(actor,p_peer);hi:=greatest(actor,p_peer);
 if not academy_private.can_read_dm(p_class,lo,hi) then raise exception 'Messaging is available between active classmates';end if;
 if exists(select 1 from public.academy_dm_blocks where (user_id=actor and blocked_id=p_peer) or (user_id=p_peer and blocked_id=actor)) then raise exception 'This conversation is unavailable';end if;
 insert into public.academy_dm_threads(class_id,user_low,user_high) values(p_class,lo,hi) on conflict(class_id,user_low,user_high) do nothing;
 select id into result from public.academy_dm_threads where class_id=p_class and user_low=lo and user_high=hi;
 return result;
end $$;
create function public.send_academy_dm(p_thread uuid,p_body text,p_nonce uuid) returns public.academy_dm_messages
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); conversation public.academy_dm_threads; result public.academy_dm_messages; peer uuid;
begin
 select * into conversation from public.academy_dm_threads where id=p_thread;
 if actor is null or conversation.id is null or not academy_private.can_read_dm(conversation.class_id,conversation.user_low,conversation.user_high) then raise exception 'Conversation unavailable';end if;
 peer:=case when conversation.user_low=actor then conversation.user_high else conversation.user_low end;
 if exists(select 1 from public.academy_dm_blocks where (user_id=actor and blocked_id=peer) or (user_id=peer and blocked_id=actor)) then raise exception 'This conversation is unavailable';end if;
 if p_nonce is null or p_body is null or length(btrim(p_body)) not between 1 and 2000 then raise exception 'Use 1–2,000 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,713));
 select * into result from public.academy_dm_messages where sender_id=actor and client_nonce=p_nonce;
 if result.id is not null then
  if result.thread_id<>p_thread or result.body<>btrim(p_body) then raise exception 'Message retry does not match';end if;
  return result;
 end if;
 if (select count(*) from public.academy_dm_messages where sender_id=actor and created_at>now()-interval '1 minute')>=20 then raise exception 'Please wait a moment before sending more messages';end if;
 insert into public.academy_dm_messages(thread_id,sender_id,body,client_nonce) values(p_thread,actor,btrim(p_body),p_nonce) returning * into result;
 update public.academy_dm_threads set updated_at=result.created_at,last_sender=actor where id=p_thread;
 return result;
end $$;
create function public.mark_academy_dm_read(p_thread uuid,p_through timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); conversation public.academy_dm_threads;
begin
 select * into conversation from public.academy_dm_threads where id=p_thread;
 if actor is null or conversation.id is null or not academy_private.can_read_dm(conversation.class_id,conversation.user_low,conversation.user_high) then raise exception 'Conversation unavailable';end if;
 insert into public.academy_dm_reads(thread_id,user_id,read_at) values(p_thread,actor,least(coalesce(p_through,now()),now()))
 on conflict(thread_id,user_id) do update set read_at=greatest(academy_dm_reads.read_at,excluded.read_at);
end $$;
create function public.set_academy_dm_block(p_peer uuid,p_block boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();begin
 if actor is null or p_peer is null or p_peer=actor then raise exception 'Choose a classmate';end if;
 if p_block then insert into public.academy_dm_blocks(user_id,blocked_id) values(actor,p_peer) on conflict do nothing;
 else delete from public.academy_dm_blocks where user_id=actor and blocked_id=p_peer;end if;
end $$;
revoke all on function public.start_academy_dm(uuid,uuid),public.send_academy_dm(uuid,text,uuid),public.mark_academy_dm_read(uuid,timestamptz),public.set_academy_dm_block(uuid,boolean) from public,anon;
grant execute on function public.start_academy_dm(uuid,uuid),public.send_academy_dm(uuid,text,uuid),public.mark_academy_dm_read(uuid,timestamptz),public.set_academy_dm_block(uuid,boolean) to authenticated;

create table academy_private.coach_usage(user_id uuid not null references auth.users(id) on delete cascade,day date not null,requests int not null default 0 check(requests>=0),primary key(user_id,day));
alter table academy_private.coach_usage enable row level security;
revoke all on academy_private.coach_usage from public,anon,authenticated;
grant all on academy_private.coach_usage to service_role;
create function public.reserve_academy_coach_usage(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare allowance int; used int; today date:=(now() at time zone 'UTC')::date;
begin
 select max(case when paid_tier='tier10' then 60 when paid_tier='tier5' then 20 else 0 end) into allowance from public.academy_subscriptions where user_id=p_user and paid_through>now();
 if coalesce(allowance,0)=0 then raise exception 'Active membership required';end if;
 perform pg_advisory_xact_lock(713007);
 if (select coalesce(sum(requests),0) from academy_private.coach_usage where day=today)>=500 then raise exception 'Daily coach capacity reached';end if;
 insert into academy_private.coach_usage(user_id,day,requests) values(p_user,today,1) on conflict(user_id,day) do update set requests=coach_usage.requests+1 where coach_usage.requests<allowance returning requests into used;
 if used is null then raise exception 'Daily allowance reached';end if;
 return jsonb_build_object('limit',allowance,'remaining',allowance-used);
end $$;
revoke all on function public.reserve_academy_coach_usage(uuid) from public,anon,authenticated;
grant execute on function public.reserve_academy_coach_usage(uuid) to service_role;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 alter publication supabase_realtime add table public.academy_dm_threads,public.academy_dm_messages,public.academy_dm_reads;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
