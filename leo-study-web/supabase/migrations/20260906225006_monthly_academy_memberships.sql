-- Apply to the development clone only until production rollout is approved.
begin;
create table public.academy_billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique,
  livemode boolean not null,
  created_at timestamptz not null default now()
);
create table public.academy_subscriptions (
  subscription_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id text not null,
  price_id text not null,
  tier text not null check (tier in ('tier5','tier10')),
  status text not null,
  paid_tier text check (paid_tier in ('tier5','tier10')),
  paid_through timestamptz,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  livemode boolean not null,
  sync_sequence bigint not null,
  updated_at timestamptz not null default now()
);
create index academy_subscriptions_user_access on public.academy_subscriptions(user_id, paid_through desc);
alter table public.academy_billing_customers enable row level security;
alter table public.academy_subscriptions enable row level security;
revoke all on public.academy_billing_customers, public.academy_subscriptions from public, anon, authenticated;
grant select on public.academy_billing_customers, public.academy_subscriptions to authenticated;
grant all on public.academy_billing_customers, public.academy_subscriptions to service_role;
create policy own_billing_customer on public.academy_billing_customers for select to authenticated using (user_id = (select auth.uid()));
create policy own_subscription on public.academy_subscriptions for select to authenticated using (user_id = (select auth.uid()));

create sequence supporter_private.subscription_sync_sequence;
grant usage on sequence supporter_private.subscription_sync_sequence to service_role;
create function public.next_subscription_sync() returns bigint language sql security invoker set search_path = '' as $$
  select nextval('supporter_private.subscription_sync_sequence');
$$;
revoke all on function public.next_subscription_sync() from public, anon, authenticated;
grant execute on function public.next_subscription_sync() to service_role;

create table public.academy_membership_badges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plus_until timestamptz,
  pro_until timestamptz
);
alter table public.academy_membership_badges enable row level security;
revoke all on public.academy_membership_badges from public, anon, authenticated;
grant select on public.academy_membership_badges to authenticated;
grant all on public.academy_membership_badges to service_role;
create policy visible_membership_badges on public.academy_membership_badges for select to authenticated using (true);

create function public.record_subscription_snapshot(p_snapshot jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_existing public.academy_subscriptions%rowtype;
  v_id text := p_snapshot->>'subscription_id';
  v_user uuid := (p_snapshot->>'user_id')::uuid;
  v_paid_until timestamptz := (p_snapshot->>'paid_through')::timestamptz;
  v_paid_tier text := p_snapshot->>'paid_tier';
  v_sequence bigint := (p_snapshot->>'sync_sequence')::bigint;
begin
  if not exists(select 1 from public.academy_billing_customers where user_id=v_user and customer_id=p_snapshot->>'customer_id' and livemode=(p_snapshot->>'livemode')::boolean) then
    raise exception 'Subscription customer does not belong to this academy account';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id,0));
  select * into v_existing from public.academy_subscriptions where subscription_id=v_id;
  if found then
    if v_existing.user_id <> v_user or v_existing.customer_id <> p_snapshot->>'customer_id' or v_existing.livemode <> (p_snapshot->>'livemode')::boolean then
      raise exception 'Subscription ownership conflict';
    end if;
    if v_sequence <= v_existing.sync_sequence then return jsonb_build_object('applied',false,'stale',true); end if;
    -- A failed renewal or cancellation never erases time already paid for.
    if v_paid_until is null or v_paid_until < v_existing.paid_through then
      v_paid_until := v_existing.paid_through;
      v_paid_tier := v_existing.paid_tier;
    end if;
  end if;
  if (v_paid_until is null) <> (v_paid_tier is null) then raise exception 'Incomplete paid entitlement'; end if;
  insert into public.academy_subscriptions(subscription_id,user_id,customer_id,price_id,tier,status,paid_tier,paid_through,cancel_at_period_end,current_period_end,livemode,sync_sequence)
  values(v_id,v_user,p_snapshot->>'customer_id',p_snapshot->>'price_id',p_snapshot->>'tier',p_snapshot->>'status',v_paid_tier,v_paid_until,
    (p_snapshot->>'cancel_at_period_end')::boolean,(p_snapshot->>'current_period_end')::timestamptz,(p_snapshot->>'livemode')::boolean,v_sequence)
  on conflict(subscription_id) do update set price_id=excluded.price_id,tier=excluded.tier,status=excluded.status,paid_tier=excluded.paid_tier,
    paid_through=excluded.paid_through,cancel_at_period_end=excluded.cancel_at_period_end,current_period_end=excluded.current_period_end,
    sync_sequence=excluded.sync_sequence,updated_at=now();
  insert into public.academy_membership_badges(user_id,plus_until,pro_until)
  select v_user,max(paid_through) filter(where paid_tier='tier5'),max(paid_through) filter(where paid_tier='tier10')
  from public.academy_subscriptions where user_id=v_user
  on conflict(user_id) do update set plus_until=excluded.plus_until,pro_until=excluded.pro_until;
  return jsonb_build_object('applied',true,'paid_through',v_paid_until,'paid_tier',v_paid_tier);
end;
$$;
revoke all on function public.record_subscription_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.record_subscription_snapshot(jsonb) to service_role;

-- Evaluated at query time: expiry does not depend on a webhook or scheduled job.
create function public.academy_membership_access() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce((select jsonb_build_object('tier',case when paid_through>now() then coalesce(paid_tier,'free') else 'free' end,
      'paidThrough',paid_through,'subscriptionId',subscription_id,'cancelAtPeriodEnd',cancel_at_period_end,'status',status)
    from public.academy_subscriptions where user_id=(select auth.uid())
    order by case when paid_through>now() and paid_tier='tier10' then 2 when paid_through>now() and paid_tier='tier5' then 1 else 0 end desc,
      updated_at desc limit 1),
    jsonb_build_object('tier','free','paidThrough',null,'subscriptionId',null,'cancelAtPeriodEnd',false,'status','inactive'));
$$;
revoke all on function public.academy_membership_access() from public, anon;
grant execute on function public.academy_membership_access() to authenticated;

create view public.academy_public_profiles with (security_invoker=true) as
select p.user_id,p.username,p.avatar_path,p.bio,p.agency,p.last_active,p.created_at,p.updated_at,
  p.supporter_tier as legacy_supporter_tier,
  case when p.supporter_tier='tier10' or b.pro_until>now() then 'tier10'
       when p.supporter_tier='tier5' or b.plus_until>now() then 'tier5' else p.supporter_tier end as supporter_tier,
  case when b.pro_until>now() then 'tier10' when b.plus_until>now() then 'tier5' else 'free' end as membership_tier
from public.profiles p left join public.academy_membership_badges b on b.user_id=p.user_id;
revoke all on public.academy_public_profiles from public,anon;
grant select on public.academy_public_profiles to authenticated,service_role;
create policy paid_scenario_content on public.content_items as restrictive for select to authenticated
using (type <> 'scenario' or public.is_owner((select auth.uid())) or exists(
  select 1 from public.academy_subscriptions where user_id=(select auth.uid()) and paid_through>now() and paid_tier in ('tier5','tier10')
));
create policy no_anonymous_scenario_content on public.content_items as restrictive for select to anon using (type <> 'scenario');

create table public.academy_checkout_leases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token uuid not null,
  expires_at timestamptz not null
);
alter table public.academy_checkout_leases enable row level security;
revoke all on public.academy_checkout_leases from public,anon,authenticated;
grant all on public.academy_checkout_leases to service_role;
create function public.claim_membership_checkout(p_user uuid,p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.academy_checkout_leases values(p_user,p_token,now()+interval '5 minutes')
  on conflict(user_id) do update set token=excluded.token,expires_at=excluded.expires_at
  where public.academy_checkout_leases.expires_at < now();
  return found;
end; $$;
create function public.release_membership_checkout(p_user uuid,p_token uuid) returns void
language sql security invoker set search_path='' as $$
  delete from public.academy_checkout_leases where user_id=p_user and token=p_token;
$$;
revoke all on function public.claim_membership_checkout(uuid,uuid),public.release_membership_checkout(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_membership_checkout(uuid,uuid),public.release_membership_checkout(uuid,uuid) to service_role;

create function public.save_academy_pro_preferences(p_preferences jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.academy_subscriptions where user_id=auth.uid() and paid_tier='tier10' and paid_through>now()) then raise exception 'Academy Pro is required'; end if;
  if jsonb_typeof(p_preferences)<>'object' or octet_length(p_preferences::text)>16384 then raise exception 'Invalid study preferences'; end if;
  insert into public.app_state(user_id,profile_details,updated_at) values(auth.uid(),jsonb_build_object('proStudyPreferences',p_preferences),now())
  on conflict(user_id) do update set profile_details=jsonb_set(coalesce(public.app_state.profile_details,'{}'::jsonb),'{proStudyPreferences}',p_preferences),updated_at=now();
end; $$;
revoke all on function public.save_academy_pro_preferences(jsonb) from public,anon;
grant execute on function public.save_academy_pro_preferences(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
