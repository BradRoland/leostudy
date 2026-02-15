-- Run in Supabase SQL editor

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  avatar_path text,
  supporter_tier text not null default 'free' check (supporter_tier in ('free', 'tier2', 'tier5', 'tier10')),
  bio text not null default '',
  agency text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  performance jsonb not null default '{}'::jsonb,
  high_scores jsonb not null default '{"matching":0,"blaster":0,"caseFile":0,"rapidFire":0,"gravity":0}'::jsonb,
  best_streak integer not null default 0,
  profile_details jsonb not null default '{"bio":"","agency":""}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists agency text not null default '';
alter table public.app_state add column if not exists profile_details jsonb not null default '{"bio":"","agency":""}'::jsonb;

create table if not exists public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  match_duration int4,
  match_filter text check (match_filter in ('all', 'penal', 'hs', 'vehicle')),
  score integer not null default 0,
  round integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.leaderboard add column if not exists match_duration int4;
alter table public.leaderboard add column if not exists match_filter text;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leaderboard_match_filter_check'
  ) then
    alter table public.leaderboard
    add constraint leaderboard_match_filter_check
    check (match_filter is null or match_filter in ('all', 'penal', 'hs', 'vehicle'));
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.app_state enable row level security;
alter table public.leaderboard enable row level security;

create policy if not exists "profiles_select_all" on public.profiles
for select using (true);

create policy if not exists "profiles_insert_self" on public.profiles
for insert with check (auth.uid() = user_id);

create policy if not exists "profiles_update_self" on public.profiles
for update using (auth.uid() = user_id);

create policy if not exists "app_state_select_self" on public.app_state
for select using (auth.uid() = user_id);

create policy if not exists "app_state_insert_self" on public.app_state
for insert with check (auth.uid() = user_id);

create policy if not exists "app_state_update_self" on public.app_state
for update using (auth.uid() = user_id);

create policy if not exists "leaderboard_select_all" on public.leaderboard
for select using (true);

create policy if not exists "leaderboard_insert_self" on public.leaderboard
for insert with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy if not exists "avatar_public_read" on storage.objects
for select using (bucket_id = 'avatars');

create policy if not exists "avatar_upload_self" on storage.objects
for insert with check (
  bucket_id = 'avatars' and auth.uid()::text = split_part(name, '/', 1)
);

create policy if not exists "avatar_update_self" on storage.objects
for update using (
  bucket_id = 'avatars' and auth.uid()::text = split_part(name, '/', 1)
);
