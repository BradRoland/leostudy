-- Add last_active column to profiles to track online users
alter table public.profiles add column if not exists last_active timestamptz;

-- Create index for faster queries
create index if not exists profiles_last_active_idx on public.profiles (last_active);

-- Function to get count of users active in last N minutes
create or replace function public.get_online_users_count(minutes_interval int default 5)
returns int as $$
  select count(*)::int from public.profiles
  where last_active is not null
  and last_active > now() - (minutes_interval || ' minutes')::interval;
$$ language sql stable;
