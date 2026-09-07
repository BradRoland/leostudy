-- This helper is usable only in the retained development clone, by the backend.
begin;
create function public.set_roland_test_membership(p_user uuid,p_tier text) returns void
language plpgsql security invoker set search_path='' as $$
declare test_id text:='academy_test_'||p_user::text; expires timestamptz:=now()+interval '7 days';
begin
 if current_database()<>'codex_class180_ui_test_20260906' or p_user is distinct from '90f1b543-e768-4d48-95da-bec61dd9a193'::uuid
 or not exists(select 1 from public.user_roles where user_id=p_user and role='owner') then raise exception 'Roland development access required';end if;
 if p_tier is null or p_tier not in ('free','tier5','tier10') then raise exception 'Choose Free, Plus or Pro';end if;
 perform pg_advisory_xact_lock(hashtextextended(test_id,0));
 if p_tier='free' then
  delete from public.academy_subscriptions where subscription_id=test_id and user_id=p_user and status='development_test' and not livemode;
 else
  insert into public.academy_subscriptions(subscription_id,user_id,customer_id,price_id,tier,status,paid_tier,paid_through,cancel_at_period_end,current_period_end,livemode,sync_sequence)
  values(test_id,p_user,'development_test','development_test_'||p_tier,p_tier,'development_test',p_tier,expires,true,expires,false,0)
  on conflict(subscription_id) do update set tier=excluded.tier,price_id=excluded.price_id,paid_tier=excluded.paid_tier,paid_through=excluded.paid_through,current_period_end=excluded.current_period_end,updated_at=now()
  where academy_subscriptions.user_id=p_user and academy_subscriptions.status='development_test' and not academy_subscriptions.livemode;
  if not found then raise exception 'Test membership identity conflict';end if;
 end if;
 insert into public.academy_membership_badges(user_id,plus_until,pro_until)
 select p_user,max(paid_through) filter(where paid_tier='tier5'),max(paid_through) filter(where paid_tier='tier10') from public.academy_subscriptions where user_id=p_user
 on conflict(user_id) do update set plus_until=excluded.plus_until,pro_until=excluded.pro_until;
end $$;
revoke all on function public.set_roland_test_membership(uuid,text) from public,anon,authenticated;
grant execute on function public.set_roland_test_membership(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
