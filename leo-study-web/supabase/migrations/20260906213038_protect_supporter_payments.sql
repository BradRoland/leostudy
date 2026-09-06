-- Development clone only until an approved production rollout.
begin;
-- Paid access is server-owned. Keep profile editing and first-time upserts working.
revoke insert, update on public.profiles from public, anon, authenticated;
revoke insert (supporter_tier), update (supporter_tier) on public.profiles from public, anon, authenticated;
grant insert (user_id, username, avatar_path, bio, agency, last_active, created_at, updated_at),
      update (user_id, username, avatar_path, bio, agency, last_active, updated_at)
  on public.profiles to authenticated;

create schema if not exists supporter_private;
revoke all on schema supporter_private from public, anon, authenticated;
grant usage on schema supporter_private to service_role;
create table supporter_private.checkout_grants (
  session_id text primary key check (length(session_id) between 1 and 255),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null check (tier in ('tier2', 'tier5', 'tier10')),
  livemode boolean not null,
  granted_at timestamptz not null default now()
);
alter table supporter_private.checkout_grants enable row level security;
revoke all on supporter_private.checkout_grants from public, anon, authenticated;
grant select, insert on supporter_private.checkout_grants to service_role;

-- A single transaction records fulfillment and grants access. Concurrent duplicate
-- deliveries wait on the unique session key; failures roll back both operations.
create function public.fulfill_supporter_checkout(p_session_id text, p_user_id uuid, p_tier text, p_livemode boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_inserted integer;
  v_existing supporter_private.checkout_grants%rowtype;
  v_tier text;
begin
  insert into supporter_private.checkout_grants(session_id, user_id, tier, livemode)
  values(p_session_id, p_user_id, p_tier, p_livemode) on conflict (session_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into strict v_existing from supporter_private.checkout_grants where session_id = p_session_id;
    if v_existing.user_id <> p_user_id or v_existing.tier <> p_tier or v_existing.livemode <> p_livemode then
      raise exception 'Checkout fulfillment conflicts with its original grant';
    end if;
  else
    insert into public.profiles(user_id, supporter_tier) values(p_user_id, p_tier)
    on conflict (user_id) do update set supporter_tier = excluded.supporter_tier, updated_at = now()
    where array_position(array['free','tier2','tier5','tier10'], public.profiles.supporter_tier)
        < array_position(array['free','tier2','tier5','tier10'], excluded.supporter_tier);
  end if;
  select supporter_tier into v_tier from public.profiles where user_id = p_user_id;
  return jsonb_build_object('applied', v_inserted = 1, 'duplicate', v_inserted = 0, 'tier', v_tier);
end;
$$;
revoke all on function public.fulfill_supporter_checkout(text,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.fulfill_supporter_checkout(text,uuid,text,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
