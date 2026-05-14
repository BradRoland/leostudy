-- LEO Study baseline database setup
-- Generated as a clean bootstrap migration from the historical project schema.
-- Fresh Supabase projects only: do not run this against an existing production database.

create extension if not exists pgcrypto;

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  avatar_path text,
  supporter_tier text not null default 'free' check (supporter_tier in ('free', 'tier2', 'tier5', 'tier10')),
  bio text not null default '',
  agency text not null default '',
  last_active timestamptz,
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

create table if not exists public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  match_duration int4,
  match_filter text check (match_filter is null or match_filter in ('all', 'penal', 'hs', 'vehicle')),
  score integer not null default 0,
  round integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_leaderboard_game_score on public.leaderboard(game, score desc, round desc, created_at desc);
create index if not exists idx_leaderboard_user_game on public.leaderboard(user_id, game, created_at desc);

alter table public.profiles enable row level security;
alter table public.app_state enable row level security;
alter table public.leaderboard enable row level security;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_timestamp_updated_at();

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_read_all') then
    create policy profiles_read_all on public.profiles for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_self') then
    create policy profiles_insert_self on public.profiles for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_self') then
    create policy profiles_update_self on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_state' and policyname = 'app_state_read_all') then
    create policy app_state_read_all on public.app_state for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_state' and policyname = 'app_state_upsert_self') then
    create policy app_state_upsert_self on public.app_state for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_state' and policyname = 'app_state_update_self') then
    create policy app_state_update_self on public.app_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'leaderboard' and policyname = 'leaderboard_read_all') then
    create policy leaderboard_read_all on public.leaderboard for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'leaderboard' and policyname = 'leaderboard_insert_any_authed') then
    create policy leaderboard_insert_any_authed on public.leaderboard for insert to authenticated with check (true);
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatar_public_read') then
    create policy avatar_public_read on storage.objects for select using (bucket_id = 'avatars');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatar_upload_self') then
    create policy avatar_upload_self on storage.objects for insert with check (bucket_id = 'avatars' and auth.uid()::text = split_part(name, '/', 1));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatar_update_self') then
    create policy avatar_update_self on storage.objects for update using (bucket_id = 'avatars' and auth.uid()::text = split_part(name, '/', 1));
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260215_owner_roles_and_content_items.sql
-- -----------------------------------------------------------------------------

-- Owner roles + editable content tables + RLS
-- Run in Supabase SQL editor (or via supabase migration tooling)

create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id text primary key,
  category text not null,
  type text not null check (type in ('code', 'scenario', 'question')),
  title text not null,
  question text,
  answer text,
  tags text[] not null default '{}'::text[],
  difficulty text,
  code_section text,
  explanation text,
  source_url text,
  scenario text,
  scenario_questions jsonb not null default '[]'::jsonb,
  key_points text[] not null default '{}'::text[],
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_items_category on public.content_items(category);
create index if not exists idx_content_items_type on public.content_items(type);
create index if not exists idx_content_items_published on public.content_items(is_published);
create unique index if not exists uq_content_items_code_section
  on public.content_items (lower(category), lower(code_section))
  where type <> 'scenario' and code_section is not null;
create unique index if not exists uq_content_items_scenario_text
  on public.content_items (lower(category), lower(scenario))
  where type = 'scenario' and scenario is not null;

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_roles_updated_at on public.user_roles;
create trigger trg_user_roles_updated_at
before update on public.user_roles
for each row
execute function public.set_timestamp_updated_at();

drop trigger if exists trg_content_items_updated_at on public.content_items;
create trigger trg_content_items_updated_at
before update on public.content_items
for each row
execute function public.set_timestamp_updated_at();

alter table public.user_roles enable row level security;
alter table public.content_items enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'user_roles_select_own'
  ) then
    create policy user_roles_select_own
    on public.user_roles
    for select
    using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'content_items'
      and policyname = 'content_items_select_published_or_owner'
  ) then
    create policy content_items_select_published_or_owner
    on public.content_items
    for select
    using (
      is_published = true
      or exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'content_items'
      and policyname = 'content_items_owner_insert'
  ) then
    create policy content_items_owner_insert
    on public.content_items
    for insert
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'content_items'
      and policyname = 'content_items_owner_update'
  ) then
    create policy content_items_owner_update
    on public.content_items
    for update
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    )
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'content_items'
      and policyname = 'content_items_owner_delete'
  ) then
    create policy content_items_owner_delete
    on public.content_items
    for delete
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260216_profiles_username_unique.sql
-- -----------------------------------------------------------------------------

-- Enforce unique usernames (case-insensitive).
-- Required for correct behavior under concurrency (two users picking same name).

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260218_fix_leaderboard_rls.sql
-- -----------------------------------------------------------------------------

-- Simplest fix: allow authenticated users to insert/update leaderboard
-- This works with Supabase's upsert

-- First drop old policies
drop policy if exists "leaderboard_insert_self" on public.leaderboard;
drop policy if exists "leaderboard_update_self" on public.leaderboard;

-- Allow authenticated users to insert
create policy "leaderboard_all_insert" on public.leaderboard
for insert with check (true);

-- Allow authenticated users to update
create policy "leaderboard_all_update" on public.leaderboard
for update using (true);


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260218_leaderboard_dedup.sql
-- -----------------------------------------------------------------------------

-- Add unique constraint to prevent duplicate leaderboard entries
-- First, delete duplicates keeping the highest score
DELETE FROM leaderboard WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, game, match_duration, match_filter)
  id FROM leaderboard
  ORDER BY user_id, game, match_duration, match_filter, score DESC, created_at DESC
);

-- Add unique constraint
ALTER TABLE public.leaderboard ADD CONSTRAINT unique_user_game_duration_filter UNIQUE (user_id, game, match_duration, match_filter);

-- Create function to upsert leaderboard scores
CREATE OR REPLACE FUNCTION public.upsert_leaderboard(
  p_user_id UUID,
  p_game TEXT,
  p_match_duration INT,
  p_match_filter TEXT,
  p_score INT,
  p_round INT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO leaderboard (user_id, game, match_duration, match_filter, score, round)
  VALUES (p_user_id, p_game, p_match_duration, p_match_filter, p_score, p_round)
  ON CONFLICT (user_id, game, match_duration, match_filter)
  DO UPDATE SET score = GREATEST(leaderboard.score, EXCLUDED.score),
              round = EXCLUDED.round,
              created_at = NOW();
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260218_online_users.sql
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260219220232_active_rooms_list.sql
-- -----------------------------------------------------------------------------




-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260219_agency_backfill.sql
-- -----------------------------------------------------------------------------

-- Simple migration to update agency field

-- Update empty/null agencies to Unaffiliated
UPDATE profiles SET agency = 'Unaffiliated' WHERE agency IS NULL OR agency = '';

-- Set default for future inserts
ALTER TABLE profiles ALTER COLUMN agency SET DEFAULT 'Unaffiliated';


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260219_agency_mapping.sql
-- -----------------------------------------------------------------------------

-- Map existing agency values to dropdown options

UPDATE profiles SET agency = 'Madera Sheriffs Office'
WHERE LOWER(TRIM(agency)) IN ('madera sheriff', 'madera sheriffs office', 'madero sheriff', 'madero sheriffs office', 'mcsO', 'madera so');

UPDATE profiles SET agency = 'Fresno Police Department'
WHERE LOWER(TRIM(agency)) IN ('fresno pd', 'fresno police', 'fresnOPD', 'fresno');

UPDATE profiles SET agency = 'Fresno Sheriffs Office'
WHERE LOWER(TRIM(agency)) IN ('fresno sheriff', 'fresno sheriffs office', 'fresno so', 'fsO');

UPDATE profiles SET agency = 'Los Banos Police Department'
WHERE LOWER(TRIM(agency)) IN ('los banos', 'los banos pd', 'los banos police', 'lbpd');

UPDATE profiles SET agency = 'Clovis PD'
WHERE LOWER(TRIM(agency)) IN ('clovis', 'clovis pd', 'clovis police');

UPDATE profiles SET agency = 'DMV'
WHERE LOWER(TRIM(agency)) IN ('dmv', 'department of motor vehicles');

UPDATE profiles SET agency = 'Department of Insurance'
WHERE LOWER(TRIM(agency)) IN ('doi', 'department of insurance', 'insurance');

UPDATE profiles SET agency = 'Mariposa Sheriffs Office'
WHERE LOWER(TRIM(agency)) IN ('mariposa', 'mariposa sheriff', 'mariposa sheriffs office');

-- Everything else becomes Unaffiliated
UPDATE profiles SET agency = 'Unaffiliated'
WHERE agency NOT IN (
  'Fresno Police Department',
  'Fresno Sheriffs Office',
  'Madera Police Department',
  'Madera Sheriffs Office',
  'Los Banos Police Department',
  'DMV',
  'Department of Insurance',
  'Clovis PD',
  'Unaffiliated',
  'Mariposa Sheriffs Office'
);


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260219_app_settings.sql
-- -----------------------------------------------------------------------------

-- App-level settings for owner-managed configuration

create table if not exists public.app_settings (
  id text primary key default 'global' check (id = 'global'),
  agencies text[] not null default array[
    'Fresno Police Department',
    'Fresno Sheriffs Office',
    'Madera Police Department',
    'Madera Sheriffs Office',
    'Los Banos Police Department',
    'DMV',
    'Department of Insurance',
    'Clovis PD',
    'Unaffiliated',
    'Mariposa Sheriffs Office'
  ]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
before update on public.app_settings
for each row
execute function public.set_timestamp_updated_at();

alter table public.app_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_select_all'
  ) then
    create policy app_settings_select_all
    on public.app_settings
    for select
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_owner_insert'
  ) then
    create policy app_settings_owner_insert
    on public.app_settings
    for insert
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_owner_update'
  ) then
    create policy app_settings_owner_update
    on public.app_settings
    for update
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    )
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_owner_delete'
  ) then
    create policy app_settings_owner_delete
    on public.app_settings
    for delete
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;
end $$;

insert into public.app_settings (id)
values ('global')
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260219_public_chat.sql
-- -----------------------------------------------------------------------------

-- Public Chat tables for global chat widget
-- Run this in Supabase SQL editor

-- Public messages table
CREATE TABLE IF NOT EXISTS public.public_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  agency text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id)
);

-- Reports table
CREATE TABLE IF NOT EXISTS public.public_message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.public_messages(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for faster message fetching
CREATE INDEX IF NOT EXISTS idx_public_messages_created_at ON public.public_messages (created_at DESC);

-- Enable RLS
ALTER TABLE public.public_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_message_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies for public_messages
DROP POLICY IF EXISTS "public_messages_select_all" ON public.public_messages;
CREATE POLICY "public_messages_select_all" ON public.public_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_messages_insert_authenticated" ON public.public_messages;
CREATE POLICY "public_messages_insert_authenticated" ON public.public_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "public_messages_delete_admin_only" ON public.public_messages;
CREATE POLICY "public_messages_delete_admin_only" ON public.public_messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'owner')
  OR user_id = auth.uid()
);

-- RLS policies for public_message_reports
DROP POLICY IF EXISTS "public_message_reports_insert_authenticated" ON public.public_message_reports;
CREATE POLICY "public_message_reports_insert_authenticated" ON public.public_message_reports FOR INSERT WITH CHECK (auth.uid() = reporter_user_id);

DROP POLICY IF EXISTS "public_message_reports_select_admin_only" ON public.public_message_reports;
CREATE POLICY "public_message_reports_select_admin_only" ON public.public_message_reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'owner')
);

-- Grant execute to authenticated users
GRANT SELECT ON public.public_messages TO authenticated, anon;
GRANT INSERT ON public.public_messages TO authenticated;
GRANT UPDATE ON public.public_messages TO authenticated;
GRANT SELECT, INSERT ON public.public_message_reports TO authenticated;

-- Enable realtime for public_messages (add to existing publication)
ALTER PUBLICATION supabase_realtime ADD TABLE public.public_messages;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260219_realtime_1v1_rooms.sql
-- -----------------------------------------------------------------------------

-- Realtime 1v1 rooms, players, results, RLS, and server-side deck generation

create extension if not exists pgcrypto;

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  game_type text not null check (game_type in ('quiz', 'matching')),
  category text not null check (category in ('all', 'pc', 'vc', 'hs', 'scenarios')),
  is_public boolean not null default true,
  join_code text unique,
  rounds integer not null default 5 check (rounds between 5 and 50),
  question_set jsonb not null default '[]'::jsonb,
  status text not null default 'waiting' check (status in ('waiting', 'in_progress', 'completed', 'cancelled')),
  current_round integer not null default 1,
  winner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  constraint rooms_join_code_private_check check (
    (is_public = true and join_code is null)
    or (is_public = false and join_code ~ '^[0-9]{6}$')
  )
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_no integer not null check (slot_no between 1 and 2),
  is_ready boolean not null default false,
  score integer not null default 0,
  total_time_ms bigint not null default 0,
  current_round integer not null default 1,
  last_seen timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, slot_no)
);

create table if not exists public.room_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null default 0,
  total_time_ms bigint not null default 0,
  placement integer not null check (placement between 1 and 2),
  is_winner boolean not null default false,
  finished_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index if not exists idx_rooms_status_public_created on public.rooms (status, is_public, created_at desc);
create index if not exists idx_rooms_join_code on public.rooms (join_code);
create index if not exists idx_rooms_host on public.rooms (host_user_id);
create index if not exists idx_room_players_room on public.room_players (room_id);
create index if not exists idx_room_players_user on public.room_players (user_id);
create index if not exists idx_room_results_room on public.room_results (room_id);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_results enable row level security;

drop trigger if exists trg_rooms_updated_at on public.rooms;
create trigger trg_rooms_updated_at
before update on public.rooms
for each row
execute function public.set_timestamp_updated_at();

drop trigger if exists trg_room_players_updated_at on public.room_players;
create trigger trg_room_players_updated_at
before update on public.room_players
for each row
execute function public.set_timestamp_updated_at();

create or replace function public.is_room_participant(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = coalesce(p_user_id, auth.uid())
  );
$$;

grant execute on function public.is_room_participant(uuid, uuid) to authenticated;

-- Rooms: only participants can read room details.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rooms' and policyname = 'rooms_select_players_only'
  ) then
    create policy rooms_select_players_only
    on public.rooms
    for select
    using (
      exists (
        select 1
        from public.room_players rp
        where rp.room_id = rooms.id
          and rp.user_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rooms' and policyname = 'rooms_insert_host_only'
  ) then
    create policy rooms_insert_host_only
    on public.rooms
    for insert
    with check (auth.uid() = host_user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rooms' and policyname = 'rooms_update_players_only'
  ) then
    create policy rooms_update_players_only
    on public.rooms
    for update
    using (
      exists (
        select 1
        from public.room_players rp
        where rp.room_id = rooms.id
          and rp.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.room_players rp
        where rp.room_id = rooms.id
          and rp.user_id = auth.uid()
      )
    );
  end if;
end $$;

-- Room players: players can only manage their own row.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'room_players' and policyname = 'room_players_select_room_participants'
  ) then
    create policy room_players_select_room_participants
    on public.room_players
    for select
    using (public.is_room_participant(room_id, auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'room_players' and policyname = 'room_players_insert_self'
  ) then
    create policy room_players_insert_self
    on public.room_players
    for insert
    with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'room_players' and policyname = 'room_players_update_self'
  ) then
    create policy room_players_update_self
    on public.room_players
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

-- Results visible only to room participants.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'room_results' and policyname = 'room_results_select_room_participants'
  ) then
    create policy room_results_select_room_participants
    on public.room_results
    for select
    using (
      exists (
        select 1
        from public.room_players rp
        where rp.room_id = room_results.room_id
          and rp.user_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'room_results' and policyname = 'room_results_insert_self'
  ) then
    create policy room_results_insert_self
    on public.room_results
    for insert
    with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.generate_room_join_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.rooms where join_code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.list_public_1v1_rooms()
returns table (
  id uuid,
  game_type text,
  category text,
  rounds integer,
  created_at timestamptz,
  host_user_id uuid,
  player_count integer
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    r.game_type,
    r.category,
    r.rounds,
    r.created_at,
    r.host_user_id,
    count(rp.id)::int as player_count
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  where r.is_public = true
    and r.status = 'waiting'
  group by r.id
  having count(rp.id) < 2
  order by r.created_at desc
  limit 50;
$$;

grant execute on function public.list_public_1v1_rooms() to authenticated;

create or replace function public.create_1v1_room(
  p_game_type text,
  p_category text,
  p_is_public boolean default true,
  p_rounds integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_join_code text;
  v_question_set jsonb := '[]'::jsonb;
  v_round integer;
  v_pool_count integer;
  v_pool jsonb := '[]'::jsonb;
  v_item jsonb;
  v_choices text[];
  v_choice text;
  v_choice_json jsonb;
  v_correct_index integer;
  v_records jsonb := '[]'::jsonb;
  v_round_pairs jsonb;
  v_idx integer;
  v_left text;
  v_right text;
  v_rounds integer := greatest(5, least(coalesce(p_rounds, 10), 50));
  v_category text := lower(trim(p_category));
  v_game_type text := lower(trim(p_game_type));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_game_type not in ('quiz', 'matching') then
    raise exception 'Invalid game type';
  end if;

  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_game_type = 'matching' and v_category = 'scenarios' then
    raise exception 'Matching does not support SCENARIOS';
  end if;

  if v_game_type = 'matching' then
    v_rounds := 5;
  end if;

  if v_game_type = 'quiz' then
    if v_category = 'scenarios' then
      with base as (
        select
          c.id,
          coalesce(nullif(trim(c.scenario), ''), trim(c.title)) as prompt,
          coalesce(nullif(trim(c.answer), ''), 'Use the most lawful option based on facts.') as correct_answer,
          coalesce(c.scenario_questions, '[]'::jsonb) as scenario_questions,
          coalesce(nullif(trim(c.explanation), ''), 'Use lawful authority and articulable facts.') as explanation
        from public.content_items c
        where c.is_published = true
          and c.type = 'scenario'
          and nullif(trim(coalesce(c.scenario, c.title)), '') is not null
        order by random()
        limit 120
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    else
      with base as (
        select
          c.id,
          trim(c.title) as title,
          trim(c.code_section) as code_section,
          coalesce(nullif(trim(c.explanation), ''), trim(c.question), trim(c.answer), '') as explanation
        from public.content_items c
        where c.is_published = true
          and c.type in ('code', 'question')
          and nullif(trim(c.title), '') is not null
          and nullif(trim(c.code_section), '') is not null
          and (
            v_category = 'all'
            or (v_category = 'pc' and lower(c.category) in ('pc', 'penal', 'penal code'))
            or (v_category = 'vc' and lower(c.category) in ('vc', 'vehicle', 'vehicle code'))
            or (v_category = 'hs' and lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety'))
        )
        order by random()
        limit 220
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    end if;

    if v_pool_count < v_rounds then
      raise exception 'Not enough content to generate % quiz rounds', v_rounds;
    end if;

    for v_round in 1..v_rounds loop
      v_item := v_pool -> ((v_round - 1) % v_pool_count);

      if v_category = 'scenarios' then
        v_choices := array[]::text[];
        for v_choice in
          select value::text
          from jsonb_array_elements_text(coalesce(v_item->'scenario_questions', '[]'::jsonb))
        loop
          if length(trim(v_choice)) > 0 then
            v_choices := array_append(v_choices, trim(v_choice));
          end if;
        end loop;

        if coalesce(array_length(v_choices, 1), 0) < 2 then
          v_choices := array[
            (v_item->>'correct_answer'),
            'Document observations and seek corroborating evidence.',
            'Delay enforcement action until legal elements are established.',
            'Prioritize scene safety and gather witness statements.'
          ];
        end if;

        if not ((v_item->>'correct_answer') = any(v_choices)) then
          v_choices := array_append(v_choices, (v_item->>'correct_answer'));
        end if;

        v_choices := (select array_agg(value) from (select distinct unnest(v_choices) as value) t where length(trim(value)) > 0);
        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (
            select value
            from unnest(v_choices) as value
            order by random()
            limit 4
          ) s
        );

        if jsonb_array_length(v_choice_json) < 2 then
          raise exception 'Unable to generate scenario choices';
        end if;

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'correct_answer') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', v_item->>'prompt',
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation'
          )
        );
      else
        v_choices := array[(v_item->>'title')];

        for v_choice in
          select elem->>'title'
          from jsonb_array_elements(v_pool) as elem
          where (elem->>'id') <> (v_item->>'id')
          order by random()
          limit 3
        loop
          v_choices := array_append(v_choices, v_choice);
        end loop;

        v_choice_json := (
          select jsonb_agg(value)
          from (
            select value
            from unnest(v_choices) as value
            order by random()
          ) s
        );

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'title') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', concat('What best matches ', coalesce(v_item->>'code_section', 'this code section'), '?'),
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation',
            'sourceLabel', v_item->>'code_section'
          )
        );
      end if;
    end loop;
  else
    with base as (
      select
        c.id,
        trim(c.code_section) as code_section,
        trim(c.title) as title
      from public.content_items c
      where c.is_published = true
        and c.type in ('code', 'question')
        and nullif(trim(c.title), '') is not null
        and nullif(trim(c.code_section), '') is not null
        and (
          v_category = 'all'
          or (v_category = 'pc' and lower(c.category) in ('pc', 'penal', 'penal code'))
          or (v_category = 'vc' and lower(c.category) in ('vc', 'vehicle', 'vehicle code'))
          or (v_category = 'hs' and lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety'))
        )
      order by random()
      limit 180
    )
    select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
    into v_pool, v_pool_count
    from base;

    if v_pool_count < 3 then
      raise exception 'Not enough content to generate matching rounds';
    end if;

    v_records := '[]'::jsonb;
    for v_round in 1..v_rounds loop
      v_round_pairs := '[]'::jsonb;
      for v_idx in 0..2 loop
        v_item := v_pool -> ((v_round * 3 + v_idx - 1) % v_pool_count);
        v_left := v_item->>'code_section';
        v_right := v_item->>'title';
        v_round_pairs := v_round_pairs || jsonb_build_array(
          jsonb_build_object(
            'pairId', gen_random_uuid(),
            'left', v_left,
            'right', v_right
          )
        );
      end loop;
      v_records := v_records || jsonb_build_array(
        jsonb_build_object(
          'round', v_round,
          'pairs', v_round_pairs
        )
      );
    end loop;
    v_question_set := v_records;
  end if;

  v_join_code := case when p_is_public then null else public.generate_room_join_code() end;

  insert into public.rooms (
    host_user_id,
    game_type,
    category,
    is_public,
    join_code,
    rounds,
    question_set,
    status,
    current_round
  ) values (
    v_uid,
    v_game_type,
    v_category,
    p_is_public,
    v_join_code,
    v_rounds,
    v_question_set,
    'waiting',
    1
  )
  returning id into v_room_id;

  insert into public.room_players (room_id, user_id, slot_no, is_ready)
  values (v_room_id, v_uid, 1, false);

  return v_room_id;
end;
$$;

grant execute on function public.create_1v1_room(text, text, boolean, integer) to authenticated;

create or replace function public.create_1v1_room(
  p_game_type text,
  p_category text,
  p_is_public boolean default true
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.create_1v1_room(p_game_type, p_category, p_is_public, 10);
$$;

grant execute on function public.create_1v1_room(text, text, boolean) to authenticated;

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
  v_room public.rooms%rowtype;
  v_slot integer;
  v_players integer;
  v_code text := trim(coalesce(p_join_code, ''));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_room_id is not null then
    select * into v_room
    from public.rooms
    where id = p_room_id;
  elsif v_code <> '' then
    select * into v_room
    from public.rooms
    where join_code = v_code;
  else
    raise exception 'Room id or join code required';
  end if;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Room is not joinable';
  end if;

  if exists (
    select 1 from public.room_players rp
    where rp.room_id = v_room.id and rp.user_id = v_uid
  ) then
    return v_room.id;
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

grant execute on function public.join_1v1_room(uuid, text) to authenticated;

create or replace function public.set_1v1_ready(
  p_room_id uuid,
  p_ready boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ready_count integer;
  v_player_count integer;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update public.room_players
  set is_ready = p_ready,
      last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid;

  if not found then
    raise exception 'Not in room';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  select status into v_status from public.rooms where id = p_room_id;

  if v_status = 'waiting' and v_player_count = 2 and v_ready_count = 2 then
    update public.rooms
    set status = 'in_progress',
        started_at = coalesce(started_at, now()),
        current_round = 1
    where id = p_room_id
      and status = 'waiting';
    v_status := 'in_progress';
  end if;

  return coalesce(v_status, 'waiting');
end;
$$;

grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;

create or replace function public.submit_1v1_round(
  p_room_id uuid,
  p_round integer,
  p_correct boolean,
  p_elapsed_ms integer,
  p_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_points integer;
  v_elapsed integer;
  v_rounds integer;
  v_players_finished integer;
  v_total_players integer;
  v_winner uuid;
  v_results jsonb := '[]'::jsonb;
  v_row record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'Room not found';
  end if;
  if v_room.status not in ('in_progress', 'completed') then
    raise exception 'Room is not active';
  end if;

  v_rounds := v_room.rounds;
  v_elapsed := greatest(0, least(coalesce(p_elapsed_ms, 0), 300000));

  if v_room.game_type = 'quiz' then
    v_points := case when p_correct then 100 else 0 end;
  else
    v_points := case when p_correct then 100 else 0 end;
  end if;

  update public.room_players
  set
    score = score + v_points,
    total_time_ms = total_time_ms + v_elapsed,
    current_round = greatest(current_round, least(p_round + 1, v_rounds + 1)),
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round <= p_round;

  select count(*)::int,
         count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 and v_room.status <> 'completed' then
    select rp.user_id
    into v_winner
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, rp.total_time_ms asc, rp.joined_at asc
    limit 1;

    for v_row in
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        row_number() over (order by rp.score desc, rp.total_time_ms asc, rp.joined_at asc) as placement
      from public.room_players rp
      where rp.room_id = p_room_id
      order by placement
    loop
      insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
      values (p_room_id, v_row.user_id, v_row.score, v_row.total_time_ms, v_row.placement, v_row.user_id = v_winner)
      on conflict (room_id, user_id)
      do update set
        score = excluded.score,
        total_time_ms = excluded.total_time_ms,
        placement = excluded.placement,
        is_winner = excluded.is_winner,
        finished_at = now();
    end loop;

    update public.rooms
    set status = 'completed',
        winner_user_id = v_winner,
        ended_at = now(),
        current_round = v_rounds
    where id = p_room_id;
  else
    update public.rooms
    set current_round = greatest(current_round, least(p_round + 1, v_rounds))
    where id = p_room_id
      and status = 'in_progress';
  end if;

  for v_row in
    select user_id, score, total_time_ms, current_round
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'user_id', v_row.user_id,
        'score', v_row.score,
        'total_time_ms', v_row.total_time_ms,
        'current_round', v_row.current_round
      )
    );
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id),
    'players', v_results
  );
end;
$$;

grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;

create or replace function public.forfeit_1v1_match(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_self public.room_players%rowtype;
  v_opponent public.room_players%rowtype;
  v_remaining_players integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select * into v_self
  from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  if v_self.id is null then
    raise exception 'Not in room';
  end if;

  if v_room.status = 'waiting' then
    delete from public.room_players
    where room_id = p_room_id
      and user_id = v_uid;

    select count(*)::int
    into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    if v_remaining_players = 0 then
      update public.rooms
      set status = 'cancelled',
          ended_at = now()
      where id = p_room_id;
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', (select status from public.rooms where id = p_room_id),
      'winner_user_id', null
    );
  end if;

  if v_room.status <> 'in_progress' then
    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id
    );
  end if;

  select * into v_opponent
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_uid
  order by slot_no
  limit 1;

  update public.room_players
  set current_round = greatest(current_round, v_room.rounds + 1),
      last_seen = now()
  where id = v_self.id;

  if v_opponent.id is not null then
    update public.room_players
    set current_round = greatest(current_round, v_room.rounds + 1),
        last_seen = now()
    where id = v_opponent.id;

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_opponent.user_id, v_opponent.score, v_opponent.total_time_ms, 1, true)
    on conflict (room_id, user_id)
    do update set
      score = excluded.score,
      total_time_ms = excluded.total_time_ms,
      placement = excluded.placement,
      is_winner = excluded.is_winner,
      finished_at = now();

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_self.user_id, v_self.score, v_self.total_time_ms, 2, false)
    on conflict (room_id, user_id)
    do update set
      score = excluded.score,
      total_time_ms = excluded.total_time_ms,
      placement = excluded.placement,
      is_winner = excluded.is_winner,
      finished_at = now();

    update public.rooms
    set status = 'completed',
        winner_user_id = v_opponent.user_id,
        ended_at = now(),
        current_round = v_room.rounds
    where id = p_room_id;
  else
    update public.rooms
    set status = 'cancelled',
        ended_at = now(),
        current_round = v_room.rounds
    where id = p_room_id;
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id)
  );
end;
$$;

grant execute on function public.forfeit_1v1_match(uuid) to authenticated;

-- Realtime publication (safe idempotent blocks)
do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.room_players;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.room_results;
exception when duplicate_object then null;
end $$;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260220_1v1_forfeit_match.sql
-- -----------------------------------------------------------------------------

create or replace function public.forfeit_1v1_match(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_self public.room_players%rowtype;
  v_opponent public.room_players%rowtype;
  v_remaining_players integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select * into v_self
  from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  if v_self.id is null then
    raise exception 'Not in room';
  end if;

  if v_room.status = 'waiting' then
    delete from public.room_players
    where room_id = p_room_id
      and user_id = v_uid;

    select count(*)::int
    into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    if v_remaining_players = 0 then
      update public.rooms
      set status = 'cancelled',
          ended_at = now()
      where id = p_room_id;
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', (select status from public.rooms where id = p_room_id),
      'winner_user_id', null
    );
  end if;

  if v_room.status <> 'in_progress' then
    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id
    );
  end if;

  select * into v_opponent
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_uid
  order by slot_no
  limit 1;

  update public.room_players
  set current_round = greatest(current_round, v_room.rounds + 1),
      last_seen = now()
  where id = v_self.id;

  if v_opponent.id is not null then
    update public.room_players
    set current_round = greatest(current_round, v_room.rounds + 1),
        last_seen = now()
    where id = v_opponent.id;

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_opponent.user_id, v_opponent.score, v_opponent.total_time_ms, 1, true)
    on conflict (room_id, user_id)
    do update set
      score = excluded.score,
      total_time_ms = excluded.total_time_ms,
      placement = excluded.placement,
      is_winner = excluded.is_winner,
      finished_at = now();

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_self.user_id, v_self.score, v_self.total_time_ms, 2, false)
    on conflict (room_id, user_id)
    do update set
      score = excluded.score,
      total_time_ms = excluded.total_time_ms,
      placement = excluded.placement,
      is_winner = excluded.is_winner,
      finished_at = now();

    update public.rooms
    set status = 'completed',
        winner_user_id = v_opponent.user_id,
        ended_at = now(),
        current_round = v_room.rounds
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  else
    update public.rooms
    set status = 'cancelled',
        ended_at = now(),
        current_round = v_room.rounds
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id)
  );
end;
$$;

grant execute on function public.forfeit_1v1_match(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260220_1v1_matching_race_scoring.sql
-- -----------------------------------------------------------------------------

create or replace function public.submit_1v1_round(
  p_room_id uuid,
  p_round integer,
  p_correct boolean,
  p_elapsed_ms integer,
  p_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_points integer;
  v_elapsed integer;
  v_rounds integer;
  v_players_finished integer;
  v_total_players integer;
  v_winner uuid;
  v_results jsonb := '[]'::jsonb;
  v_row record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'Room not found';
  end if;
  if v_room.status not in ('in_progress', 'completed') then
    raise exception 'Room is not active';
  end if;

  v_rounds := v_room.rounds;
  v_elapsed := greatest(0, least(coalesce(p_elapsed_ms, 0), 300000));

  if v_room.game_type = 'quiz' then
    v_points := case when p_correct then 100 else 0 end;
  else
    v_points := case when p_correct then 100 else 0 end;
  end if;

  update public.room_players
  set
    score = score + v_points,
    total_time_ms = total_time_ms + v_elapsed,
    current_round = greatest(current_round, least(p_round + 1, v_rounds + 1)),
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round <= p_round;

  select count(*)::int,
         count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 and v_room.status <> 'completed' then
    select rp.user_id
    into v_winner
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, rp.total_time_ms asc, rp.joined_at asc
    limit 1;

    for v_row in
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        row_number() over (order by rp.score desc, rp.total_time_ms asc, rp.joined_at asc) as placement
      from public.room_players rp
      where rp.room_id = p_room_id
      order by placement
    loop
      insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
      values (p_room_id, v_row.user_id, v_row.score, v_row.total_time_ms, v_row.placement, v_row.user_id = v_winner)
      on conflict (room_id, user_id)
      do update set
        score = excluded.score,
        total_time_ms = excluded.total_time_ms,
        placement = excluded.placement,
        is_winner = excluded.is_winner,
        finished_at = now();
    end loop;

    update public.rooms
    set status = 'completed',
        winner_user_id = v_winner,
        ended_at = now(),
        current_round = v_rounds
    where id = p_room_id;
  else
    update public.rooms
    set current_round = greatest(current_round, least(p_round + 1, v_rounds))
    where id = p_room_id
      and status = 'in_progress';
  end if;

  for v_row in
    select user_id, score, total_time_ms, current_round
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'user_id', v_row.user_id,
        'score', v_row.score,
        'total_time_ms', v_row.total_time_ms,
        'current_round', v_row.current_round
      )
    );
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id),
    'players', v_results
  );
end;
$$;

grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260220_1v1_quiz_rounds_customization.sql
-- -----------------------------------------------------------------------------

alter table public.rooms drop constraint if exists rooms_rounds_check;
alter table public.rooms add constraint rooms_rounds_check check (rounds between 5 and 50);

drop function if exists public.list_public_1v1_rooms();
create or replace function public.list_public_1v1_rooms()
returns table (
  id uuid,
  game_type text,
  category text,
  rounds integer,
  created_at timestamptz,
  host_user_id uuid,
  player_count integer
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    r.game_type,
    r.category,
    r.rounds,
    r.created_at,
    r.host_user_id,
    count(rp.id)::int as player_count
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  where r.is_public = true
    and r.status = 'waiting'
  group by r.id
  having count(rp.id) < 2
  order by r.created_at desc
  limit 50;
$$;

grant execute on function public.list_public_1v1_rooms() to authenticated;

drop function if exists public.create_1v1_room(text, text, boolean, integer);
create or replace function public.create_1v1_room(
  p_game_type text,
  p_category text,
  p_is_public boolean default true,
  p_rounds integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_join_code text;
  v_question_set jsonb := '[]'::jsonb;
  v_round integer;
  v_pool_count integer;
  v_pool jsonb := '[]'::jsonb;
  v_item jsonb;
  v_choices text[];
  v_choice text;
  v_choice_json jsonb;
  v_correct_index integer;
  v_records jsonb := '[]'::jsonb;
  v_round_pairs jsonb;
  v_idx integer;
  v_left text;
  v_right text;
  v_rounds integer := greatest(5, least(coalesce(p_rounds, 10), 50));
  v_category text := lower(trim(p_category));
  v_game_type text := lower(trim(p_game_type));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_game_type not in ('quiz', 'matching') then
    raise exception 'Invalid game type';
  end if;

  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_game_type = 'matching' and v_category = 'scenarios' then
    raise exception 'Matching does not support SCENARIOS';
  end if;

  if v_game_type = 'matching' then
    v_rounds := 5;
  end if;

  if v_game_type = 'quiz' then
    if v_category = 'scenarios' then
      with base as (
        select
          c.id,
          coalesce(nullif(trim(c.scenario), ''), trim(c.title)) as prompt,
          coalesce(nullif(trim(c.answer), ''), 'Use the most lawful option based on facts.') as correct_answer,
          coalesce(c.scenario_questions, '[]'::jsonb) as scenario_questions,
          coalesce(nullif(trim(c.explanation), ''), 'Use lawful authority and articulable facts.') as explanation
        from public.content_items c
        where c.is_published = true
          and c.type = 'scenario'
          and nullif(trim(coalesce(c.scenario, c.title)), '') is not null
        order by random()
        limit 120
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    else
      with base as (
        select
          c.id,
          trim(c.title) as title,
          trim(c.code_section) as code_section,
          coalesce(nullif(trim(c.explanation), ''), trim(c.question), trim(c.answer), '') as explanation
        from public.content_items c
        where c.is_published = true
          and c.type in ('code', 'question')
          and nullif(trim(c.title), '') is not null
          and nullif(trim(c.code_section), '') is not null
          and (
            v_category = 'all'
            or (v_category = 'pc' and lower(c.category) in ('pc', 'penal', 'penal code'))
            or (v_category = 'vc' and lower(c.category) in ('vc', 'vehicle', 'vehicle code'))
            or (v_category = 'hs' and lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety'))
          )
        order by random()
        limit 220
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    end if;

    if v_pool_count < v_rounds then
      raise exception 'Not enough content to generate % quiz rounds', v_rounds;
    end if;

    for v_round in 1..v_rounds loop
      v_item := v_pool -> ((v_round - 1) % v_pool_count);

      if v_category = 'scenarios' then
        v_choices := array[]::text[];
        for v_choice in
          select value::text
          from jsonb_array_elements_text(coalesce(v_item->'scenario_questions', '[]'::jsonb))
        loop
          if length(trim(v_choice)) > 0 then
            v_choices := array_append(v_choices, trim(v_choice));
          end if;
        end loop;

        if coalesce(array_length(v_choices, 1), 0) < 2 then
          v_choices := array[
            (v_item->>'correct_answer'),
            'Document observations and seek corroborating evidence.',
            'Delay enforcement action until legal elements are established.',
            'Prioritize scene safety and gather witness statements.'
          ];
        end if;

        if not ((v_item->>'correct_answer') = any(v_choices)) then
          v_choices := array_append(v_choices, (v_item->>'correct_answer'));
        end if;

        v_choices := (select array_agg(value) from (select distinct unnest(v_choices) as value) t where length(trim(value)) > 0);
        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (
            select value
            from unnest(v_choices) as value
            order by random()
            limit 4
          ) s
        );

        if jsonb_array_length(v_choice_json) < 2 then
          raise exception 'Unable to generate scenario choices';
        end if;

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'correct_answer') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', v_item->>'prompt',
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation'
          )
        );
      else
        v_choices := array[(v_item->>'title')];

        for v_choice in
          select elem->>'title'
          from jsonb_array_elements(v_pool) as elem
          where (elem->>'id') <> (v_item->>'id')
          order by random()
          limit 3
        loop
          v_choices := array_append(v_choices, v_choice);
        end loop;

        v_choice_json := (
          select jsonb_agg(value)
          from (
            select value
            from unnest(v_choices) as value
            order by random()
          ) s
        );

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'title') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', concat('What best matches ', coalesce(v_item->>'code_section', 'this code section'), '?'),
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation',
            'sourceLabel', v_item->>'code_section'
          )
        );
      end if;
    end loop;
  else
    with base as (
      select
        c.id,
        trim(c.code_section) as code_section,
        trim(c.title) as title
      from public.content_items c
      where c.is_published = true
        and c.type in ('code', 'question')
        and nullif(trim(c.title), '') is not null
        and nullif(trim(c.code_section), '') is not null
        and (
          v_category = 'all'
          or (v_category = 'pc' and lower(c.category) in ('pc', 'penal', 'penal code'))
          or (v_category = 'vc' and lower(c.category) in ('vc', 'vehicle', 'vehicle code'))
          or (v_category = 'hs' and lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety'))
        )
      order by random()
      limit 180
    )
    select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
    into v_pool, v_pool_count
    from base;

    if v_pool_count < 3 then
      raise exception 'Not enough content to generate matching rounds';
    end if;

    v_records := '[]'::jsonb;
    for v_round in 1..v_rounds loop
      v_round_pairs := '[]'::jsonb;
      for v_idx in 0..2 loop
        v_item := v_pool -> ((v_round * 3 + v_idx - 1) % v_pool_count);
        v_left := v_item->>'code_section';
        v_right := v_item->>'title';
        v_round_pairs := v_round_pairs || jsonb_build_array(
          jsonb_build_object(
            'pairId', gen_random_uuid(),
            'left', v_left,
            'right', v_right
          )
        );
      end loop;
      v_records := v_records || jsonb_build_array(
        jsonb_build_object(
          'round', v_round,
          'pairs', v_round_pairs
        )
      );
    end loop;
    v_question_set := v_records;
  end if;

  v_join_code := case when p_is_public then null else public.generate_room_join_code() end;

  insert into public.rooms (
    host_user_id,
    game_type,
    category,
    is_public,
    join_code,
    rounds,
    question_set,
    status,
    current_round
  ) values (
    v_uid,
    v_game_type,
    v_category,
    p_is_public,
    v_join_code,
    v_rounds,
    v_question_set,
    'waiting',
    1
  )
  returning id into v_room_id;

  insert into public.room_players (room_id, user_id, slot_no, is_ready)
  values (v_room_id, v_uid, 1, false);

  return v_room_id;
end;
$$;

grant execute on function public.create_1v1_room(text, text, boolean, integer) to authenticated;

create or replace function public.create_1v1_room(
  p_game_type text,
  p_category text,
  p_is_public boolean default true
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.create_1v1_room(p_game_type, p_category, p_is_public, 10);
$$;

grant execute on function public.create_1v1_room(text, text, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260220_1v1_ready_countdown_tiebreak_rematch.sql
-- -----------------------------------------------------------------------------

-- 1v1 quality-of-life updates:
-- - ready-gated countdown protection on submit
-- - explicit tie-break order: score -> total time -> fastest round -> draw
-- - rematch room creation with same two players

alter table public.room_players
  add column if not exists fastest_round_ms bigint not null default 0;

alter table public.rooms
  add column if not exists rematch_room_id uuid references public.rooms(id) on delete set null;

create index if not exists idx_rooms_rematch_room_id
  on public.rooms (rematch_room_id);

create or replace function public.submit_1v1_round(
  p_room_id uuid,
  p_round integer,
  p_correct boolean,
  p_elapsed_ms integer,
  p_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_points integer;
  v_elapsed bigint;
  v_rounds integer;
  v_players_finished integer;
  v_total_players integer;
  v_winner uuid := null;
  v_results jsonb := '[]'::jsonb;
  v_row record;
  v_first record;
  v_second record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'completed' then
    for v_row in
      select user_id, score, total_time_ms, fastest_round_ms, current_round
      from public.room_players
      where room_id = p_room_id
      order by slot_no
    loop
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'user_id', v_row.user_id,
          'score', v_row.score,
          'total_time_ms', v_row.total_time_ms,
          'fastest_round_ms', v_row.fastest_round_ms,
          'current_round', v_row.current_round
        )
      );
    end loop;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id,
      'players', v_results
    );
  end if;

  if v_room.status <> 'in_progress' then
    raise exception 'Room is not active';
  end if;

  if v_room.started_at is null or now() < (v_room.started_at + interval '3 seconds') then
    raise exception 'Match countdown active';
  end if;

  if p_round is null or p_round < 1 then
    raise exception 'Invalid round';
  end if;

  v_rounds := greatest(1, coalesce(v_room.rounds, 1));
  v_elapsed := greatest(0, least(coalesce(p_elapsed_ms, 0), 300000));

  if v_room.game_type = 'matching' and p_points is not null then
    v_points := greatest(0, least(p_points, 1000));
  else
    v_points := case when p_correct then 100 else 0 end;
  end if;

  update public.room_players
  set
    score = score + v_points,
    total_time_ms = total_time_ms + v_elapsed,
    fastest_round_ms = case
      when v_elapsed <= 0 then fastest_round_ms
      when fastest_round_ms <= 0 then v_elapsed
      else least(fastest_round_ms, v_elapsed)
    end,
    current_round = greatest(current_round, least(p_round + 1, v_rounds + 1)),
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round <= p_round;

  if not found then
    raise exception 'Round already submitted or player not in room';
  end if;

  select
    count(*)::int,
    count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 and v_room.status <> 'completed' then
    select ranked.*
    into v_first
    from (
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
      from public.room_players rp
      where rp.room_id = p_room_id
      order by rp.score desc, rp.total_time_ms asc, fastest_norm asc, rp.joined_at asc
      limit 1
    ) ranked;

    select ranked.*
    into v_second
    from (
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
      from public.room_players rp
      where rp.room_id = p_room_id
      order by rp.score desc, rp.total_time_ms asc, fastest_norm asc, rp.joined_at asc
      offset 1
      limit 1
    ) ranked;

    if v_second.user_id is null then
      v_winner := v_first.user_id;
    elsif v_first.score <> v_second.score then
      v_winner := v_first.user_id;
    elsif v_first.total_time_ms <> v_second.total_time_ms then
      v_winner := v_first.user_id;
    elsif v_first.fastest_norm <> v_second.fastest_norm then
      v_winner := v_first.user_id;
    else
      v_winner := null;
    end if;

    for v_row in
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        rp.fastest_round_ms,
        row_number() over (
          order by rp.score desc,
                   rp.total_time_ms asc,
                   case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end asc,
                   rp.joined_at asc
        ) as rank_position
      from public.room_players rp
      where rp.room_id = p_room_id
      order by rank_position
    loop
      insert into public.room_results (
        room_id,
        user_id,
        score,
        total_time_ms,
        placement,
        is_winner
      ) values (
        p_room_id,
        v_row.user_id,
        v_row.score,
        v_row.total_time_ms,
        case when v_winner is null then 1 else v_row.rank_position end,
        (v_winner is not null and v_row.user_id = v_winner)
      )
      on conflict (room_id, user_id)
      do update set
        score = excluded.score,
        total_time_ms = excluded.total_time_ms,
        placement = excluded.placement,
        is_winner = excluded.is_winner,
        finished_at = now();
    end loop;

    update public.rooms
    set
      status = 'completed',
      winner_user_id = v_winner,
      ended_at = now(),
      current_round = v_rounds
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  else
    update public.rooms
    set current_round = greatest(current_round, least(p_round + 1, v_rounds))
    where id = p_room_id
      and status = 'in_progress';
  end if;

  v_results := '[]'::jsonb;
  for v_row in
    select user_id, score, total_time_ms, fastest_round_ms, current_round
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'user_id', v_row.user_id,
        'score', v_row.score,
        'total_time_ms', v_row.total_time_ms,
        'fastest_round_ms', v_row.fastest_round_ms,
        'current_round', v_row.current_round
      )
    );
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id),
    'players', v_results
  );
end;
$$;

grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;

drop function if exists public.rematch_1v1_room(uuid, text);
create or replace function public.rematch_1v1_room(
  p_room_id uuid,
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_source public.rooms%rowtype;
  v_existing public.rooms%rowtype;
  v_rematch_room_id uuid;
  v_category text;
  v_rounds integer;
  v_player_one uuid;
  v_player_two uuid;
  v_is_participant boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_source
  from public.rooms
  where id = p_room_id
  for update;

  if v_source.id is null then
    raise exception 'Room not found';
  end if;

  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = v_uid
  )
  into v_is_participant;

  if not v_is_participant then
    raise exception 'Only room participants can request a rematch';
  end if;

  if v_source.status <> 'completed' then
    raise exception 'Rematch is available only after match completion';
  end if;

  select rp.user_id
  into v_player_one
  from public.room_players rp
  where rp.room_id = p_room_id
  order by rp.slot_no asc
  limit 1;

  select rp.user_id
  into v_player_two
  from public.room_players rp
  where rp.room_id = p_room_id
  order by rp.slot_no asc
  offset 1
  limit 1;

  if v_player_one is null or v_player_two is null then
    raise exception 'Rematch requires exactly two players from the completed room';
  end if;

  v_category := lower(trim(coalesce(nullif(p_category, ''), v_source.category)));
  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_source.game_type = 'matching' and v_category = 'scenarios' then
    v_category := 'all';
  end if;

  v_rounds := case
    when v_source.game_type = 'matching' then 5
    else greatest(5, least(coalesce(v_source.rounds, 10), 50))
  end;

  if v_source.rematch_room_id is not null then
    select *
    into v_existing
    from public.rooms
    where id = v_source.rematch_room_id;

    -- If room exists and is in_progress, reset it to fresh state
    if v_existing.id is not null then
      -- Reset all player scores and state
      update public.room_players
      set is_ready = true,
          score = 0,
          total_time_ms = 0,
          fastest_round_ms = 0,
          current_round = 1,
          last_seen = now()
      where room_id = v_existing.id
        and user_id in (v_player_one, v_player_two);

      -- Reset room state
      update public.rooms
      set status = 'waiting',
          current_round = 1,
          winner_user_id = null,
          started_at = null,
          ended_at = null
      where id = v_existing.id;

      -- Return the fresh room (will trigger countdown on frontend)
      return v_existing.id;
    end if;

    if v_existing.id is not null and v_existing.status = 'waiting' and v_existing.category = v_category then
      delete from public.room_players
      where room_id = v_existing.id
        and user_id not in (v_player_one, v_player_two);

      insert into public.room_players (
        room_id,
        user_id,
        slot_no,
        is_ready,
        score,
        total_time_ms,
        fastest_round_ms,
        current_round,
        last_seen
      ) values
      (v_existing.id, v_player_one, 1, true, 0, 0, 0, 1, now()),
      (v_existing.id, v_player_two, 2, true, 0, 0, 0, 1, now())
      on conflict (room_id, user_id)
      do update set
        slot_no = excluded.slot_no,
        is_ready = true,
        score = 0,
        total_time_ms = 0,
        fastest_round_ms = 0,
        current_round = 1,
        last_seen = now();

      update public.rooms
      set
        host_user_id = v_player_one,
        game_type = v_source.game_type,
        category = v_category,
        rounds = v_rounds,
        status = 'in_progress',
        current_round = 1,
        winner_user_id = null,
        started_at = now(),
        ended_at = null
      where id = v_existing.id;

      return v_existing.id;
    end if;

    if v_existing.id is not null and v_existing.status = 'waiting' then
      delete from public.rooms where id = v_existing.id;
    end if;
  end if;

  v_rematch_room_id := public.create_1v1_room(
    v_source.game_type,
    v_category,
    v_source.is_public,
    v_rounds
  );

  delete from public.room_players
  where room_id = v_rematch_room_id;

  insert into public.room_players (
    room_id,
    user_id,
    slot_no,
    is_ready,
    score,
    total_time_ms,
    fastest_round_ms,
    current_round,
    last_seen
  ) values
  (v_rematch_room_id, v_player_one, 1, true, 0, 0, 0, 1, now()),
  (v_rematch_room_id, v_player_two, 2, true, 0, 0, 0, 1, now());

  update public.rooms
  set
    host_user_id = v_player_one,
    game_type = v_source.game_type,
    category = v_category,
    rounds = v_rounds,
    status = 'in_progress',
    current_round = 1,
    winner_user_id = null,
    started_at = now(),
    ended_at = null,
    rematch_room_id = null
  where id = v_rematch_room_id;

  update public.rooms
  set rematch_room_id = v_rematch_room_id
  where id = p_room_id;

  return v_rematch_room_id;
end;
$$;

grant execute on function public.rematch_1v1_room(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260220_1v1_rematch_same_room.sql
-- -----------------------------------------------------------------------------

-- Fixed rematch function: generates NEW questions and resets state
DROP FUNCTION IF EXISTS public.rematch_1v1_room(uuid, text);

CREATE OR REPLACE FUNCTION public.rematch_1v1_room(
  p_room_id uuid,
  p_category text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.rooms%ROWTYPE;
  v_category text;
  v_rounds integer;
  v_question_set jsonb := '[]'::jsonb;
  v_player_one uuid;
  v_player_two uuid;
  v_pool jsonb;
  v_pool_count int;
  v_round int;
  v_item jsonb;
  v_round_pairs jsonb;
  v_idx int;
  v_choices text[];
  v_choice text;
  v_choice_json jsonb;
  v_correct_index int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;

  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.room_players rp WHERE rp.room_id = p_room_id AND rp.user_id = v_uid) THEN
    RAISE EXCEPTION 'Only room participants can request a rematch';
  END IF;

  IF v_room.status <> 'completed' THEN
    RAISE EXCEPTION 'Rematch is available only after match completion';
  END IF;

  -- Get both players
  SELECT rp.user_id INTO v_player_one
  FROM public.room_players rp
  WHERE rp.room_id = p_room_id
  ORDER BY rp.slot_no ASC LIMIT 1;

  SELECT rp.user_id INTO v_player_two
  FROM public.room_players rp
  WHERE rp.room_id = p_room_id
  ORDER BY rp.slot_no ASC OFFSET 1 LIMIT 1;

  IF v_player_one IS NULL OR v_player_two IS NULL THEN
    RAISE EXCEPTION 'Rematch requires exactly two players';
  END IF;

  -- Set category
  IF p_category IS NOT NULL AND LENGTH(TRIM(p_category)) > 0 THEN
    v_category := LOWER(TRIM(p_category));
  ELSE
    v_category := LOWER(v_room.category);
  END IF;

  IF v_category NOT IN ('all', 'pc', 'vc', 'hs', 'scenarios') THEN
    v_category := 'all';
  END IF;

  IF v_room.game_type = 'matching' AND v_category = 'scenarios' THEN
    v_category := 'all';
  END IF;

  -- Set rounds
  v_rounds := CASE
    WHEN v_room.game_type = 'matching' THEN 5
    ELSE GREATEST(5, LEAST(COALESCE(v_room.rounds, 10), 50))
  END;

  -- Generate NEW question set
  IF v_room.game_type = 'matching' THEN
    -- Generate matching pairs
    WITH base AS (
      SELECT c.id, TRIM(c.code_section) AS code_section, TRIM(c.title) AS title
      FROM public.content_items c
      WHERE c.is_published = TRUE
        AND c.type IN ('code', 'question')
        AND NULLIF(TRIM(c.title), '') IS NOT NULL
        AND NULLIF(TRIM(c.code_section), '') IS NOT NULL
      ORDER BY random() LIMIT 180
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
    INTO v_pool, v_pool_count FROM base;

    IF v_pool_count < 3 THEN
      RAISE EXCEPTION 'Not enough content for matching';
    END IF;

    FOR v_round IN 1..v_rounds LOOP
      v_round_pairs := '[]'::jsonb;
      FOR v_idx IN 0..2 LOOP
        v_item := v_pool -> ((v_round * 3 + v_idx - 1) % v_pool_count);
        v_round_pairs := v_round_pairs || jsonb_build_array(
          jsonb_build_object('pairId', gen_random_uuid(), 'left', v_item->>'code_section', 'right', v_item->>'title', 'leftKind', 'code', 'rightKind', 'title')
        );
      END LOOP;
      v_question_set := v_question_set || jsonb_build_array(jsonb_build_object('round', v_round, 'pairs', v_round_pairs));
    END LOOP;
  ELSE
    -- Generate quiz questions
    WITH base AS (
      SELECT c.id, TRIM(c.title) AS title, TRIM(c.code_section) AS code_section,
             COALESCE(NULLIF(TRIM(c.explanation), ''), TRIM(c.question), TRIM(c.answer), '') AS explanation
      FROM public.content_items c
      WHERE c.is_published = TRUE
        AND c.type IN ('code', 'question')
        AND NULLIF(TRIM(c.title), '') IS NOT NULL
        AND NULLIF(TRIM(c.code_section), '') IS NOT NULL
      ORDER BY random() LIMIT 220
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
    INTO v_pool, v_pool_count FROM base;

    IF v_pool_count < v_rounds THEN
      RAISE EXCEPTION 'Not enough content for % rounds', v_rounds;
    END IF;

    FOR v_round IN 1..v_rounds LOOP
      v_item := v_pool -> ((v_round - 1) % v_pool_count);
      v_choices := ARRAY[(v_item->>'title')];

      FOR v_choice IN
        SELECT elem->>'title' FROM jsonb_array_elements(v_pool) AS elem
        WHERE (elem->>'id') <> (v_item->>'id') ORDER BY random() LIMIT 3
      LOOP
        v_choices := array_append(v_choices, v_choice);
      END LOOP;

      v_choice_json := (SELECT jsonb_agg(value) FROM (SELECT value FROM unnest(v_choices) AS value ORDER BY random()) s);
      v_correct_index := 0;
      FOR v_idx IN 0..jsonb_array_length(v_choice_json) - 1 LOOP
        IF (v_choice_json ->> v_idx) = (v_item->>'title') THEN
          v_correct_index := v_idx;
          EXIT;
        END IF;
      END LOOP;

      v_question_set := v_question_set || jsonb_build_array(
        jsonb_build_object('round', v_round, 'code', v_item->>'code_section', 'prompt', v_item->>'title',
                          'choices', v_choice_json, 'correctIndex', v_correct_index, 'explanation', v_item->>'explanation')
      );
    END LOOP;
  END IF;

  -- DELETE old results
  DELETE FROM public.room_results WHERE room_id = p_room_id;

  -- Reset ALL player state
  UPDATE public.room_players
  SET is_ready = FALSE, score = 0, total_time_ms = 0, fastest_round_ms = 0, current_round = 1, last_seen = NOW()
  WHERE room_id = p_room_id;

  -- Reset room to waiting
  UPDATE public.rooms
  SET question_set = v_question_set, category = v_category, rounds = v_rounds,
      status = 'waiting', current_round = 1, winner_user_id = NULL,
      started_at = NULL, ended_at = NULL, rematch_room_id = NULL
  WHERE id = p_room_id;

  RETURN p_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rematch_1v1_room(uuid, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260220_1v1_reset_leaderboard_stats.sql
-- -----------------------------------------------------------------------------

-- One-time reset for 1v1 leaderboard standings.
-- Keeps existing room history and only clears aggregated leaderboard stats.

delete from public.duel_player_stats;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260220_1v1_room_lifecycle_management.sql
-- -----------------------------------------------------------------------------

-- 1v1 room lifecycle controls:
-- - remove inactive waiting rooms after 5 minutes
-- - allow users to leave waiting/completed rooms cleanly
-- - allow host (or owner) to delete rooms

create or replace function public.cleanup_inactive_1v1_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  with stale_rooms as (
    select r.id
    from public.rooms r
    where (
      r.status = 'waiting'
      and r.created_at <= now() - interval '5 minutes'
      and not exists (
        select 1
        from public.room_players rp
        where rp.room_id = r.id
          and rp.last_seen >= now() - interval '5 minutes'
      )
    ) or (
      r.status in ('completed', 'cancelled')
      and coalesce(r.ended_at, r.updated_at, r.created_at) <= now() - interval '5 minutes'
      and r.rematch_room_id is null
    )
  )
  delete from public.rooms r
  using stale_rooms s
  where r.id = s.id;

  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
end;
$$;

grant execute on function public.cleanup_inactive_1v1_rooms() to authenticated;

drop function if exists public.list_public_1v1_rooms();
create or replace function public.list_public_1v1_rooms()
returns table (
  id uuid,
  game_type text,
  category text,
  rounds integer,
  created_at timestamptz,
  host_user_id uuid,
  player_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_inactive_1v1_rooms();

  return query
  select
    r.id,
    r.game_type,
    r.category,
    r.rounds,
    r.created_at,
    r.host_user_id,
    count(rp.id)::int as player_count
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  where r.is_public = true
    and r.status = 'waiting'
  group by r.id
  having count(rp.id) < 2
  order by r.created_at desc
  limit 50;
end;
$$;

grant execute on function public.list_public_1v1_rooms() to authenticated;

create or replace function public.leave_1v1_room(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_remaining_players integer := 0;
  v_next_host uuid := null;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'in_progress' then
    raise exception 'Cannot leave an active match. Use forfeit instead.';
  end if;

  if v_room.status in ('completed', 'cancelled') then
    delete from public.room_players
    where room_id = p_room_id
      and user_id = v_uid;

    if not found then
      raise exception 'Not in room';
    end if;

    select count(*)::int
    into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    if v_remaining_players <= 0 then
      delete from public.rooms
      where id = p_room_id;

      return jsonb_build_object(
        'room_id', p_room_id,
        'status', 'deleted',
        'player_count', 0,
        'deleted', true
      );
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'player_count', v_remaining_players,
      'deleted', false
    );
  end if;

  delete from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  if not found then
    select count(*)::int
    into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', coalesce(v_room.status, 'waiting'),
      'player_count', v_remaining_players
    );
  end if;

  select count(*)::int
  into v_remaining_players
  from public.room_players
  where room_id = p_room_id;

  if v_remaining_players <= 0 then
    delete from public.rooms
    where id = p_room_id;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', 'deleted',
      'player_count', 0,
      'deleted', true
    );
  end if;

  select rp.user_id
  into v_next_host
  from public.room_players rp
  where rp.room_id = p_room_id
  order by rp.slot_no asc
  limit 1;

  update public.rooms
  set host_user_id = coalesce(v_next_host, host_user_id),
      status = 'waiting',
      current_round = 1,
      started_at = null,
      winner_user_id = null,
      ended_at = null,
      rematch_room_id = null
  where id = p_room_id;

  update public.room_players
  set is_ready = false
  where room_id = p_room_id;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', 'waiting',
    'player_count', v_remaining_players
  );
end;
$$;

grant execute on function public.leave_1v1_room(uuid) to authenticated;

create or replace function public.delete_1v1_room(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_is_owner boolean := false;
  v_is_participant boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select exists(
    select 1
    from public.user_roles r
    where r.user_id = v_uid
      and r.role = 'owner'
  ) into v_is_owner;

  select exists(
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = v_uid
  ) into v_is_participant;

  if v_room.status in ('completed', 'cancelled') then
    if not v_is_owner and not v_is_participant and v_room.host_user_id <> v_uid then
      raise exception 'Only room participants, host, or owner can delete completed rooms';
    end if;
  else
    if not v_is_owner and v_room.host_user_id <> v_uid then
      raise exception 'Only host or owner can delete this room';
    end if;

    if v_room.status = 'in_progress' and not v_is_owner then
      raise exception 'Host cannot delete an active room';
    end if;
  end if;

  delete from public.rooms
  where id = p_room_id;

  return jsonb_build_object(
    'room_id', p_room_id,
    'deleted', true
  );
end;
$$;

grant execute on function public.delete_1v1_room(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260220_1v1_streak_loss_chat.sql
-- -----------------------------------------------------------------------------

-- Add streak loss notification to chat
-- Run this in Supabase SQL editor

-- Function to send streak loss message to public chat
CREATE OR REPLACE FUNCTION public.notify_streak_loss(
  p_loser_user_id uuid,
  p_loser_name text,
  p_winner_user_id uuid,
  p_winner_name text,
  p_streak_count int,
  p_game_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_streak_count > 0 THEN
    INSERT INTO public.public_messages (user_id, display_name, message)
    VALUES (
      p_loser_user_id,
      '🔔 System',
      FORMAT('%s lost their %s win streak of %s to %s! 💔', p_loser_name,
        CASE WHEN p_game_type = 'all' THEN '' ELSE p_game_type END,
        p_streak_count::text, p_winner_name)
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_streak_loss(uuid, text, uuid, text, int, text) TO authenticated;

-- Now update the trigger function to call notify_streak_loss
CREATE OR REPLACE FUNCTION public.process_1v1_room_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player RECORD;
  v_mode TEXT;
  v_modes TEXT[];
  v_is_winner BOOLEAN;
  v_loser_user_id UUID;
  v_loser_name TEXT;
  v_winner_user_id UUID;
  v_winner_name TEXT;
  v_game_type TEXT;
  v_old_streak INT;
BEGIN
  IF new.status <> 'completed' THEN
    RETURN new;
  END IF;

  IF old.status = 'completed' THEN
    RETURN new;
  END IF;

  IF new.winner_user_id IS NULL THEN
    RETURN new;
  END IF;

  v_modes := ARRAY['all', new.game_type];
  v_winner_user_id := new.winner_user_id;
  v_game_type := new.game_type;

  -- Get winner name
  SELECT COALESCE(p.username, 'Unknown') INTO v_winner_name
  FROM public.profiles p WHERE p.user_id = v_winner_user_id;

  FOR v_player IN
    SELECT rp.user_id
    FROM public.room_players rp
    WHERE rp.room_id = new.id
  LOOP
    v_is_winner := v_player.user_id = new.winner_user_id;

    -- Get loser info if this player lost
    IF NOT v_is_winner THEN
      v_loser_user_id := v_player.user_id;
      SELECT COALESCE(p.username, 'Unknown') INTO v_loser_name
      FROM public.profiles p WHERE p.user_id = v_loser_user_id;
    END IF;

    FOREACH v_mode IN ARRAY v_modes
    LOOP
      -- Get old streak before update
      SELECT current_win_streak INTO v_old_streak
      FROM public.duel_player_stats
      WHERE user_id = v_player.user_id AND game_type = v_mode;

      INSERT INTO public.duel_player_stats (
        user_id,
        game_type,
        wins,
        losses,
        matches_played,
        current_win_streak,
        best_win_streak
      ) VALUES (
        v_player.user_id,
        v_mode,
        CASE WHEN v_is_winner THEN 1 ELSE 0 END,
        CASE WHEN v_is_winner THEN 0 ELSE 1 END,
        1,
        CASE WHEN v_is_winner THEN 1 ELSE 0 END,
        CASE WHEN v_is_winner THEN 1 ELSE 0 END
      )
      ON CONFLICT (user_id, game_type)
      DO UPDATE SET
        wins = public.duel_player_stats.wins + excluded.wins,
        losses = public.duel_player_stats.losses + excluded.losses,
        matches_played = public.duel_player_stats.matches_played + 1,
        current_win_streak = CASE
          WHEN excluded.wins = 1 THEN public.duel_player_stats.current_win_streak + 1
          ELSE 0
        END,
        best_win_streak = GREATEST(
          public.duel_player_stats.best_win_streak,
          CASE
            WHEN excluded.wins = 1 THEN public.duel_player_stats.current_win_streak + 1
            ELSE public.duel_player_stats.best_win_streak
          END
        ),
        updated_at = now();

      -- Notify streak loss (only for 'all' game type to avoid duplicate messages)
      IF NOT v_is_winner AND v_mode = 'all' AND v_old_streak > 0 THEN
        PERFORM public.notify_streak_loss(v_loser_user_id, v_loser_name, v_winner_user_id, v_winner_name, v_old_streak, v_game_type);
      END IF;
    END LOOP;
  END LOOP;

  RETURN new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_1v1_room_completion() TO authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260220_1v1_win_streak_leaderboard.sql
-- -----------------------------------------------------------------------------

create table if not exists public.duel_player_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_type text not null check (game_type in ('all', 'quiz', 'matching')),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  matches_played integer not null default 0 check (matches_played >= 0),
  current_win_streak integer not null default 0 check (current_win_streak >= 0),
  best_win_streak integer not null default 0 check (best_win_streak >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_type)
);

create index if not exists idx_duel_player_stats_type_wins
  on public.duel_player_stats (game_type, wins desc, updated_at desc);

create index if not exists idx_duel_player_stats_type_streak
  on public.duel_player_stats (game_type, current_win_streak desc, updated_at desc);

alter table public.duel_player_stats enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'duel_player_stats'
      and policyname = 'duel_player_stats_read_authenticated'
  ) then
    create policy duel_player_stats_read_authenticated
    on public.duel_player_stats
    for select
    to authenticated
    using (true);
  end if;
end $$;

grant select on public.duel_player_stats to authenticated;

create or replace function public.recompute_duel_player_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_game_type text;
  v_record record;
  v_modes text[] := array['all', 'quiz', 'matching'];
  v_mode text;
  v_wins integer;
  v_losses integer;
  v_matches integer;
  v_current_streak integer;
  v_best_streak integer;
begin
  delete from public.duel_player_stats;

  for v_mode in select unnest(v_modes)
  loop
    for v_record in
      with user_pool as (
        select distinct rr.user_id
        from public.room_results rr
        join public.rooms r on r.id = rr.room_id
        where r.status = 'completed'
          and (v_mode = 'all' or r.game_type = v_mode)
      )
      select user_id
      from user_pool
    loop
      v_user_id := v_record.user_id;
      v_wins := 0;
      v_losses := 0;
      v_matches := 0;
      v_current_streak := 0;
      v_best_streak := 0;

      for v_game_type in
        select case when rr.is_winner then 'W' else 'L' end
        from public.room_results rr
        join public.rooms r on r.id = rr.room_id
        where rr.user_id = v_user_id
          and r.status = 'completed'
          and (v_mode = 'all' or r.game_type = v_mode)
        order by coalesce(r.ended_at, rr.finished_at), rr.finished_at, rr.room_id
      loop
        v_matches := v_matches + 1;
        if v_game_type = 'W' then
          v_wins := v_wins + 1;
          v_current_streak := v_current_streak + 1;
          v_best_streak := greatest(v_best_streak, v_current_streak);
        else
          v_losses := v_losses + 1;
          v_current_streak := 0;
        end if;
      end loop;

      insert into public.duel_player_stats (
        user_id,
        game_type,
        wins,
        losses,
        matches_played,
        current_win_streak,
        best_win_streak
      ) values (
        v_user_id,
        v_mode,
        v_wins,
        v_losses,
        v_matches,
        v_current_streak,
        v_best_streak
      );
    end loop;
  end loop;
end;
$$;

create or replace function public.process_1v1_room_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player record;
  v_mode text;
  v_modes text[];
  v_is_winner boolean;
begin
  if new.status <> 'completed' then
    return new;
  end if;

  if old.status = 'completed' then
    return new;
  end if;

  if new.winner_user_id is null then
    return new;
  end if;

  v_modes := array['all', new.game_type];

  for v_player in
    select rp.user_id
    from public.room_players rp
    where rp.room_id = new.id
  loop
    v_is_winner := v_player.user_id = new.winner_user_id;
    foreach v_mode in array v_modes
    loop
      insert into public.duel_player_stats (
        user_id,
        game_type,
        wins,
        losses,
        matches_played,
        current_win_streak,
        best_win_streak
      ) values (
        v_player.user_id,
        v_mode,
        case when v_is_winner then 1 else 0 end,
        case when v_is_winner then 0 else 1 end,
        1,
        case when v_is_winner then 1 else 0 end,
        case when v_is_winner then 1 else 0 end
      )
      on conflict (user_id, game_type)
      do update set
        wins = public.duel_player_stats.wins + excluded.wins,
        losses = public.duel_player_stats.losses + excluded.losses,
        matches_played = public.duel_player_stats.matches_played + 1,
        current_win_streak = case
          when excluded.wins = 1 then public.duel_player_stats.current_win_streak + 1
          else 0
        end,
        best_win_streak = greatest(
          public.duel_player_stats.best_win_streak,
          case
            when excluded.wins = 1 then public.duel_player_stats.current_win_streak + 1
            else public.duel_player_stats.best_win_streak
          end
        ),
        updated_at = now();
    end loop;
  end loop;

  return new;
end;
$$;

revoke all on function public.recompute_duel_player_stats() from public, anon, authenticated;
revoke all on function public.process_1v1_room_completion() from public, anon, authenticated;

drop trigger if exists trg_rooms_process_1v1_stats on public.rooms;
create trigger trg_rooms_process_1v1_stats
after update of status on public.rooms
for each row
execute function public.process_1v1_room_completion();

select public.recompute_duel_player_stats();


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260220_room_players_visibility_fix.sql
-- -----------------------------------------------------------------------------

create or replace function public.is_room_participant(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = coalesce(p_user_id, auth.uid())
  );
$$;

grant execute on function public.is_room_participant(uuid, uuid) to authenticated;

drop policy if exists room_players_select_room_participants on public.room_players;
create policy room_players_select_room_participants
on public.room_players
for select
using (public.is_room_participant(room_id, auth.uid()));


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260221_1v1_invite_lock_and_spectate_gate.sql
-- -----------------------------------------------------------------------------

-- Invite room locking + spectate gating:
-- 1) Invite-created rooms stay private while waiting (only invited users can join).
-- 2) Once both invited players ready and match starts, room becomes public for spectating.
-- 3) Spectate details are only visible for participants or public in-progress rooms.

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
  v_room public.rooms%rowtype;
  v_slot integer;
  v_players integer;
  v_code text := trim(coalesce(p_join_code, ''));
  v_is_invite_room boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_room_id is not null then
    select * into v_room
    from public.rooms
    where id = p_room_id;
  elsif v_code <> '' then
    select * into v_room
    from public.rooms
    where join_code = v_code;
  else
    raise exception 'Room id or join code required';
  end if;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Room is not joinable';
  end if;

  if exists (
    select 1 from public.room_players rp
    where rp.room_id = v_room.id and rp.user_id = v_uid
  ) then
    return v_room.id;
  end if;

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
        and (di.sender_user_id = v_uid or di.recipient_user_id = v_uid)
    ) then
      raise exception 'This room is invite-only';
    end if;
  elsif not v_room.is_public and v_code = '' then
    raise exception 'Private rooms require a join code';
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

grant execute on function public.join_1v1_room(uuid, text) to authenticated;

create or replace function public.set_1v1_ready(
  p_room_id uuid,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_ready_count integer := 0;
  v_player_count integer := 0;
  v_started_room_id uuid;
  v_status text;
  v_publish_for_spectators boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  update public.room_players
  set
    is_ready = p_ready,
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid;

  if not found then
    raise exception 'Not in room';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  if v_room.status = 'waiting' and v_player_count = 2 and v_ready_count = 2 then
    if to_regclass('public.duel_invites') is not null then
      select exists (
        select 1
        from public.duel_invites di
        where di.room_id = p_room_id
      )
      into v_publish_for_spectators;
    end if;

    update public.rooms
    set
      status = 'in_progress',
      started_at = now(),
      current_round = 1,
      is_public = case when v_publish_for_spectators then true else is_public end
    where id = p_room_id
      and status = 'waiting';

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', v_ready_count,
      'player_count', v_player_count,
      'rematch_started', false,
      'room_id', p_room_id
    );
  end if;

  if v_room.status = 'completed' and v_player_count = 2 and v_ready_count = 2 then
    v_started_room_id := public.rematch_1v1_room(p_room_id, null);
    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', true,
      'room_id', v_started_room_id
    );
  end if;

  select status into v_status
  from public.rooms
  where id = p_room_id;

  return jsonb_build_object(
    'status', coalesce(v_status, v_room.status),
    'ready_count', v_ready_count,
    'player_count', v_player_count,
    'rematch_started', false,
    'room_id', p_room_id
  );
end;
$$;

grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;

create or replace function public.get_1v1_room_details(p_room_id uuid)
returns table (
  room jsonb,
  players jsonb,
  results jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_can_view boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null then
    return;
  end if;

  v_can_view := public.is_room_participant(v_room.id, v_uid)
    or (v_room.is_public = true and v_room.status = 'in_progress');

  if not v_can_view then
    raise exception 'Room is private';
  end if;

  return query
  select
    row_to_json(r)::jsonb as room,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', rp.id,
          'room_id', rp.room_id,
          'user_id', rp.user_id,
          'slot_no', rp.slot_no,
          'is_ready', rp.is_ready,
          'score', rp.score,
          'total_time_ms', rp.total_time_ms,
          'fastest_round_ms', rp.fastest_round_ms,
          'current_round', rp.current_round
        )
        order by rp.slot_no asc
      )
      from public.room_players rp
      where rp.room_id = r.id
    ), '[]'::jsonb) as players,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', rr.id,
          'room_id', rr.room_id,
          'user_id', rr.user_id,
          'score', rr.score,
          'total_time_ms', rr.total_time_ms,
          'placement', rr.placement,
          'is_winner', rr.is_winner
        )
        order by rr.placement asc, rr.score desc
      )
      from public.room_results rr
      where rr.room_id = r.id
    ), '[]'::jsonb) as results
  from public.rooms r
  where r.id = p_room_id;
end;
$$;

grant execute on function public.get_1v1_room_details(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260221_1v1_invites.sql
-- -----------------------------------------------------------------------------

-- 1v1 direct invites:
-- - sender can invite an online user into a private room
-- - recipient gets a pending invite notification and can join/decline

create table if not exists public.duel_invites (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  game_type text not null check (game_type in ('quiz', 'matching')),
  category text not null check (category in ('all', 'pc', 'vc', 'hs', 'scenarios')),
  rounds integer not null check (rounds between 5 and 50),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

create index if not exists idx_duel_invites_recipient_pending
  on public.duel_invites (recipient_user_id, status, created_at desc);

create index if not exists idx_duel_invites_sender_pending
  on public.duel_invites (sender_user_id, status, created_at desc);

create unique index if not exists idx_duel_invites_one_pending_pair
  on public.duel_invites (sender_user_id, recipient_user_id)
  where status = 'pending';

alter table public.duel_invites enable row level security;

drop policy if exists duel_invites_select_participants on public.duel_invites;
create policy duel_invites_select_participants
on public.duel_invites
for select
using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

drop policy if exists duel_invites_insert_sender_only on public.duel_invites;
create policy duel_invites_insert_sender_only
on public.duel_invites
for insert
with check (auth.uid() = sender_user_id);

drop policy if exists duel_invites_update_participants on public.duel_invites;
create policy duel_invites_update_participants
on public.duel_invites
for update
using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id)
with check (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

create or replace function public.list_online_1v1_users(
  p_minutes_interval int default 5
)
returns table (
  user_id uuid,
  username text,
  avatar_path text,
  supporter_tier text,
  last_active timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    p.user_id,
    p.username,
    p.avatar_path,
    p.supporter_tier,
    p.last_active
  from public.profiles p
  where p.user_id <> v_uid
    and p.last_active is not null
    and p.last_active > now() - (greatest(1, least(coalesce(p_minutes_interval, 5), 60))::text || ' minutes')::interval
  order by p.last_active desc, p.username asc;
end;
$$;

create or replace function public.create_1v1_invite(
  p_target_user_id uuid,
  p_game_type text,
  p_category text,
  p_rounds integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target_online boolean := false;
  v_room_id uuid;
  v_invite_id uuid;
  v_game_type text := lower(trim(p_game_type));
  v_category text := lower(trim(p_category));
  v_rounds integer := greatest(5, least(coalesce(p_rounds, 10), 50));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid invite target';
  end if;

  if v_game_type not in ('quiz', 'matching') then
    raise exception 'Invalid game type';
  end if;

  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_game_type = 'matching' and v_category = 'scenarios' then
    v_category := 'all';
  end if;

  if v_game_type = 'matching' then
    v_rounds := 5;
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_target_user_id
      and p.last_active is not null
      and p.last_active > now() - interval '5 minutes'
  ) into v_target_online;

  if not v_target_online then
    raise exception 'User is not currently online';
  end if;

  update public.duel_invites
  set status = 'cancelled',
      responded_at = now()
  where sender_user_id = v_uid
    and recipient_user_id = p_target_user_id
    and status = 'pending';

  v_room_id := public.create_1v1_room(v_game_type, v_category, false, v_rounds);

  insert into public.duel_invites (
    sender_user_id,
    recipient_user_id,
    room_id,
    game_type,
    category,
    rounds,
    status,
    expires_at
  ) values (
    v_uid,
    p_target_user_id,
    v_room_id,
    v_game_type,
    v_category,
    v_rounds,
    'pending',
    now() + interval '5 minutes'
  )
  returning id into v_invite_id;

  return jsonb_build_object(
    'invite_id', v_invite_id,
    'room_id', v_room_id,
    'status', 'pending'
  );
end;
$$;

create or replace function public.list_pending_1v1_invites()
returns table (
  invite_id uuid,
  room_id uuid,
  sender_user_id uuid,
  sender_username text,
  sender_avatar_path text,
  game_type text,
  category text,
  rounds integer,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update public.duel_invites di
  set status = 'expired',
      responded_at = now()
  where di.recipient_user_id = v_uid
    and di.status = 'pending'
    and di.expires_at <= now();

  return query
  select
    di.id as invite_id,
    di.room_id,
    di.sender_user_id,
    coalesce(p.username, 'User ' || left(di.sender_user_id::text, 8)) as sender_username,
    coalesce(p.avatar_path, '') as sender_avatar_path,
    di.game_type,
    di.category,
    di.rounds,
    di.created_at,
    di.expires_at
  from public.duel_invites di
  left join public.profiles p on p.user_id = di.sender_user_id
  join public.rooms r on r.id = di.room_id
  where di.recipient_user_id = v_uid
    and di.status = 'pending'
    and di.expires_at > now()
    and r.status in ('waiting', 'in_progress')
  order by di.created_at desc
  limit 12;
end;
$$;

create or replace function public.respond_1v1_invite(
  p_invite_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.duel_invites%rowtype;
  v_room public.rooms%rowtype;
  v_room_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_invite
  from public.duel_invites
  where id = p_invite_id
    and recipient_user_id = v_uid
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Invite already handled';
  end if;

  if v_invite.expires_at <= now() then
    update public.duel_invites
    set status = 'expired',
        responded_at = now()
    where id = v_invite.id;
    raise exception 'Invite expired';
  end if;

  if not p_accept then
    update public.duel_invites
    set status = 'declined',
        responded_at = now()
    where id = v_invite.id;

    return jsonb_build_object(
      'accepted', false,
      'room_id', null,
      'status', 'declined'
    );
  end if;

  select *
  into v_room
  from public.rooms
  where id = v_invite.room_id
  for update;

  if v_room.id is null then
    update public.duel_invites
    set status = 'expired',
        responded_at = now()
    where id = v_invite.id;
    raise exception 'Invite room no longer exists';
  end if;

  if v_room.status not in ('waiting', 'in_progress') then
    update public.duel_invites
    set status = 'expired',
        responded_at = now()
    where id = v_invite.id;
    raise exception 'Invite room is no longer joinable';
  end if;

  begin
    v_room_id := public.join_1v1_room(v_invite.room_id, null);
  exception
    when others then
      update public.duel_invites
      set status = 'expired',
          responded_at = now()
      where id = v_invite.id;
      raise;
  end;

  update public.duel_invites
  set status = 'accepted',
      responded_at = now()
  where id = v_invite.id;

  return jsonb_build_object(
    'accepted', true,
    'room_id', v_room_id,
    'status', 'accepted'
  );
end;
$$;

grant select, insert, update on public.duel_invites to authenticated;

grant execute on function public.list_online_1v1_users(int) to authenticated;
grant execute on function public.create_1v1_invite(uuid, text, text, integer) to authenticated;
grant execute on function public.list_pending_1v1_invites() to authenticated;
grant execute on function public.respond_1v1_invite(uuid, boolean) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'duel_invites'
  ) then
    alter publication supabase_realtime add table public.duel_invites;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260221_1v1_ready_state_fix.sql
-- -----------------------------------------------------------------------------

-- Fix 1v1 rematch readiness bug:
-- - players were staying is_ready=true after a match started
-- - completed matches then showed immediate "2/2 agreed" and "Cancel"
-- This migration guarantees readiness is always reset whenever a room starts.

-- One-time cleanup for existing active/completed rooms.
update public.room_players rp
set is_ready = false
from public.rooms r
where rp.room_id = r.id
  and r.status in ('in_progress', 'completed')
  and rp.is_ready = true;

create or replace function public.clear_1v1_ready_on_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'in_progress' and old.status is distinct from new.status then
    update public.room_players
    set is_ready = false
    where room_id = new.id
      and is_ready = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rooms_clear_1v1_ready_on_start on public.rooms;
create trigger trg_rooms_clear_1v1_ready_on_start
after update of status on public.rooms
for each row
when (new.status = 'in_progress' and old.status is distinct from new.status)
execute function public.clear_1v1_ready_on_start();


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260221_1v1_rematch_vote_flow.sql
-- -----------------------------------------------------------------------------

-- 1v1 rematch flow hardening:
-- - Both players vote rematch (1/2, 2/2)
-- - Server starts rematch automatically when both agree
-- - Rematch regenerates a fresh question set and resets room state

drop function if exists public.set_1v1_ready(uuid, boolean);
drop function if exists public.rematch_1v1_room(uuid, text);

create or replace function public.rematch_1v1_room(
  p_room_id uuid,
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_category text;
  v_rounds integer;
  v_player_count integer;
  v_ready_count integer;
  v_question_set jsonb := '[]'::jsonb;
  v_pool jsonb := '[]'::jsonb;
  v_pool_count integer := 0;
  v_round integer;
  v_idx integer;
  v_item jsonb;
  v_round_pairs jsonb;
  v_choices text[];
  v_choice text;
  v_choice_json jsonb;
  v_correct_index integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if not exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = v_uid
  ) then
    raise exception 'Only room participants can request a rematch';
  end if;

  if v_room.status <> 'completed' then
    raise exception 'Rematch is available only after match completion';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count <> 2 then
    raise exception 'Rematch requires exactly two players';
  end if;

  if v_ready_count <> 2 then
    raise exception 'Both players must agree to rematch';
  end if;

  v_category := lower(trim(coalesce(nullif(p_category, ''), v_room.category)));
  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_room.game_type = 'matching' and v_category = 'scenarios' then
    v_category := 'all';
  end if;

  v_rounds := case
    when v_room.game_type = 'matching' then 5
    else greatest(5, least(coalesce(v_room.rounds, 10), 50))
  end;

  if v_room.game_type = 'quiz' then
    if v_category = 'scenarios' then
      with base as (
        select
          c.id,
          coalesce(nullif(trim(c.scenario), ''), trim(c.title)) as prompt,
          coalesce(nullif(trim(c.answer), ''), 'Use the most lawful option based on facts.') as correct_answer,
          coalesce(c.scenario_questions, '[]'::jsonb) as scenario_questions,
          coalesce(nullif(trim(c.explanation), ''), 'Use lawful authority and articulable facts.') as explanation
        from public.content_items c
        where c.is_published = true
          and c.type = 'scenario'
          and nullif(trim(coalesce(c.scenario, c.title)), '') is not null
        order by random()
        limit greatest(v_rounds * 8, 120)
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    else
      with base as (
        select
          c.id,
          trim(c.title) as title,
          trim(c.code_section) as code_section,
          coalesce(nullif(trim(c.explanation), ''), trim(c.question), trim(c.answer), '') as explanation
        from public.content_items c
        where c.is_published = true
          and c.type in ('code', 'question')
          and nullif(trim(c.title), '') is not null
          and nullif(trim(c.code_section), '') is not null
          and (
            v_category = 'all'
            or (v_category = 'pc' and lower(c.category) in ('pc', 'penal', 'penal code'))
            or (v_category = 'vc' and lower(c.category) in ('vc', 'vehicle', 'vehicle code'))
            or (v_category = 'hs' and lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety'))
          )
        order by random()
        limit greatest(v_rounds * 8, 220)
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    end if;

    if v_pool_count < v_rounds then
      raise exception 'Not enough content to generate % quiz rounds', v_rounds;
    end if;

    for v_round in 1..v_rounds loop
      v_item := v_pool -> (v_round - 1);

      if v_category = 'scenarios' then
        v_choices := array[]::text[];
        for v_choice in
          select value::text
          from jsonb_array_elements_text(coalesce(v_item->'scenario_questions', '[]'::jsonb))
        loop
          if length(trim(v_choice)) > 0 then
            v_choices := array_append(v_choices, trim(v_choice));
          end if;
        end loop;

        if coalesce(array_length(v_choices, 1), 0) < 2 then
          v_choices := array[
            (v_item->>'correct_answer'),
            'Document observations and seek corroborating evidence.',
            'Delay enforcement action until legal elements are established.',
            'Prioritize scene safety and gather witness statements.'
          ];
        end if;

        if not ((v_item->>'correct_answer') = any(v_choices)) then
          v_choices := array_append(v_choices, (v_item->>'correct_answer'));
        end if;

        v_choices := (
          select array_agg(value)
          from (
            select distinct unnest(v_choices) as value
          ) dedup
          where length(trim(value)) > 0
        );

        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (
            select value
            from unnest(v_choices) as value
            order by random()
            limit 4
          ) randomized
        );

        if jsonb_array_length(v_choice_json) < 2 then
          raise exception 'Unable to generate scenario choices';
        end if;

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'correct_answer') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', v_item->>'prompt',
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation'
          )
        );
      else
        v_choices := array[(v_item->>'title')];

        for v_choice in
          select elem->>'title'
          from jsonb_array_elements(v_pool) as elem
          where (elem->>'id') <> (v_item->>'id')
            and nullif(trim(elem->>'title'), '') is not null
          order by random()
          limit 3
        loop
          v_choices := array_append(v_choices, v_choice);
        end loop;

        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (
            select value
            from unnest(v_choices) as value
            where length(trim(value)) > 0
            order by random()
            limit 4
          ) randomized
        );

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'title') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', concat('What best matches ', coalesce(v_item->>'code_section', 'this code section'), '?'),
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation',
            'sourceLabel', v_item->>'code_section'
          )
        );
      end if;
    end loop;
  else
    with base as (
      select
        c.id,
        trim(c.code_section) as code_section,
        trim(c.title) as title
      from public.content_items c
      where c.is_published = true
        and c.type in ('code', 'question')
        and nullif(trim(c.title), '') is not null
        and nullif(trim(c.code_section), '') is not null
        and (
          v_category = 'all'
          or (v_category = 'pc' and lower(c.category) in ('pc', 'penal', 'penal code'))
          or (v_category = 'vc' and lower(c.category) in ('vc', 'vehicle', 'vehicle code'))
          or (v_category = 'hs' and lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety'))
        )
      order by random()
      limit greatest(v_rounds * 8, 180)
    )
    select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
    into v_pool, v_pool_count
    from base;

    if v_pool_count < (v_rounds * 3) then
      raise exception 'Not enough content to generate matching rounds';
    end if;

    for v_round in 1..v_rounds loop
      v_round_pairs := '[]'::jsonb;
      for v_idx in 1..3 loop
        v_item := v_pool -> (((v_round - 1) * 3) + (v_idx - 1));
        v_round_pairs := v_round_pairs || jsonb_build_array(
          jsonb_build_object(
            'pairId', gen_random_uuid(),
            'left', v_item->>'code_section',
            'right', v_item->>'title'
          )
        );
      end loop;

      v_question_set := v_question_set || jsonb_build_array(
        jsonb_build_object(
          'round', v_round,
          'pairs', v_round_pairs
        )
      );
    end loop;
  end if;

  delete from public.room_results where room_id = p_room_id;

  update public.room_players
  set
    is_ready = true,
    score = 0,
    total_time_ms = 0,
    fastest_round_ms = 0,
    current_round = 1,
    last_seen = now()
  where room_id = p_room_id;

  update public.rooms
  set
    question_set = v_question_set,
    category = v_category,
    rounds = v_rounds,
    status = 'in_progress',
    current_round = 1,
    winner_user_id = null,
    started_at = now(),
    ended_at = null,
    rematch_room_id = null
  where id = p_room_id;

  return p_room_id;
end;
$$;

create or replace function public.set_1v1_ready(
  p_room_id uuid,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_ready_count integer := 0;
  v_player_count integer := 0;
  v_started_room_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  update public.room_players
  set
    is_ready = p_ready,
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid;

  if not found then
    raise exception 'Not in room';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  if v_room.status = 'waiting' and v_player_count = 2 and v_ready_count = 2 then
    update public.rooms
    set
      status = 'in_progress',
      started_at = now(),
      current_round = 1
    where id = p_room_id
      and status = 'waiting';

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', v_ready_count,
      'player_count', v_player_count,
      'rematch_started', false,
      'room_id', p_room_id
    );
  end if;

  if v_room.status = 'completed' and v_player_count = 2 and v_ready_count = 2 then
    v_started_room_id := public.rematch_1v1_room(p_room_id, null);
    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', true,
      'room_id', v_started_room_id
    );
  end if;

  select status into v_status
  from public.rooms
  where id = p_room_id;

  return jsonb_build_object(
    'status', coalesce(v_status, v_room.status),
    'ready_count', v_ready_count,
    'player_count', v_player_count,
    'rematch_started', false,
    'room_id', p_room_id
  );
end;
$$;

grant execute on function public.rematch_1v1_room(uuid, text) to authenticated;
grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260221_1v1_waiting_room_chat.sql
-- -----------------------------------------------------------------------------

-- Private room chat for 1v1 waiting room (participants only).

create table if not exists public.duel_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_duel_room_messages_room_created
  on public.duel_room_messages (room_id, created_at desc);

alter table public.duel_room_messages enable row level security;

drop policy if exists duel_room_messages_select_participants on public.duel_room_messages;
create policy duel_room_messages_select_participants
on public.duel_room_messages
for select
using (public.is_room_participant(room_id, auth.uid()));

drop policy if exists duel_room_messages_insert_waiting_participants on public.duel_room_messages;
create policy duel_room_messages_insert_waiting_participants
on public.duel_room_messages
for insert
with check (
  auth.uid() = user_id
  and public.is_room_participant(room_id, auth.uid())
  and exists (
    select 1
    from public.rooms r
    where r.id = room_id
      and r.status = 'waiting'
  )
  and nullif(trim(message), '') is not null
  and char_length(trim(message)) between 1 and 240
);

create or replace function public.list_1v1_waiting_chat_messages(
  p_room_id uuid,
  p_limit integer default 60
)
returns table (
  id uuid,
  room_id uuid,
  user_id uuid,
  display_name text,
  message text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 60), 200));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_room_participant(p_room_id, v_uid) then
    raise exception 'Only room participants can view waiting-room chat';
  end if;

  return query
  with recent as (
    select
      m.id,
      m.room_id,
      m.user_id,
      m.display_name,
      m.message,
      m.created_at
    from public.duel_room_messages m
    where m.room_id = p_room_id
    order by m.created_at desc
    limit v_limit
  )
  select
    recent.id,
    recent.room_id,
    recent.user_id,
    recent.display_name,
    recent.message,
    recent.created_at
  from recent
  order by recent.created_at asc;
end;
$$;

create or replace function public.send_1v1_waiting_chat_message(
  p_room_id uuid,
  p_message text
)
returns table (
  id uuid,
  room_id uuid,
  user_id uuid,
  display_name text,
  message text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_message text := left(trim(coalesce(p_message, '')), 240);
  v_name text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_room_participant(p_room_id, v_uid) then
    raise exception 'Only room participants can send waiting-room chat messages';
  end if;

  if not exists (
    select 1
    from public.rooms r
    where r.id = p_room_id
      and r.status = 'waiting'
  ) then
    raise exception 'Chat is only available while waiting for the match to start';
  end if;

  if v_clean_message = '' then
    raise exception 'Message cannot be empty';
  end if;

  select coalesce(nullif(trim(p.username), ''), 'User ' || left(v_uid::text, 8))
  into v_name
  from public.profiles p
  where p.user_id = v_uid;

  if v_name is null then
    v_name := 'User ' || left(v_uid::text, 8);
  end if;

  return query
  insert into public.duel_room_messages (
    room_id,
    user_id,
    display_name,
    message
  ) values (
    p_room_id,
    v_uid,
    v_name,
    v_clean_message
  )
  returning
    duel_room_messages.id,
    duel_room_messages.room_id,
    duel_room_messages.user_id,
    duel_room_messages.display_name,
    duel_room_messages.message,
    duel_room_messages.created_at;
end;
$$;

grant select, insert on public.duel_room_messages to authenticated;
grant execute on function public.list_1v1_waiting_chat_messages(uuid, integer) to authenticated;
grant execute on function public.send_1v1_waiting_chat_message(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'duel_room_messages'
  ) then
    alter publication supabase_realtime add table public.duel_room_messages;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260221_active_1v1_rooms.sql
-- -----------------------------------------------------------------------------

-- List all active 1v1 rooms with player info
-- Shows waiting and in_progress rooms with player details

create or replace function public.list_active_1v1_rooms()
returns table (
  id uuid,
  game_type text,
  category text,
  rounds integer,
  created_at timestamptz,
  host_user_id uuid,
  status text,
  players jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_inactive_1v1_rooms();

  return query
  select
    r.id,
    r.game_type,
    r.category,
    r.rounds,
    r.created_at,
    r.host_user_id,
    r.status,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', rp.user_id,
        'display_name', rp.display_name,
        'agency', rp.agency,
        'is_host', rp.is_host,
        'score', rp.score,
        'ready', rp.ready
      )
    ) filter (where rp.user_id is not null), '[]'::jsonb) as players
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  where r.is_public = true
    and r.status in ('waiting', 'in_progress')
  group by r.id
  having count(rp.id) > 0
  order by
    case r.status
      when 'in_progress' then 0
      when 'waiting' then 1
      else 2
    end,
    r.created_at desc
  limit 50;
end;
$$;

grant execute on function public.list_active_1v1_rooms() to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260221_active_rooms_list.sql
-- -----------------------------------------------------------------------------

-- Add active rooms listing with player info
-- Shows waiting and in_progress rooms with player details

drop function if exists public.list_public_1v1_rooms();
create or replace function public.list_public_1v1_rooms()
returns table (
  id uuid,
  game_type text,
  category text,
  rounds integer,
  created_at timestamptz,
  host_user_id uuid,
  status text,
  players jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_inactive_1v1_rooms();

  return query
  select
    r.id,
    r.game_type,
    r.category,
    r.rounds,
    r.created_at,
    r.host_user_id,
    r.status,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', rp.user_id,
        'display_name', rp.display_name,
        'agency', rp.agency,
        'is_host', rp.is_host,
        'score', rp.score,
        'ready', rp.ready
      )
    ) filter (where rp.user_id is not null), '[]'::jsonb) as players
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  where r.is_public = true
    and r.status in ('waiting', 'in_progress')
  group by r.id
  having count(rp.id) > 0
  order by
    case r.status
      when 'in_progress' then 0
      when 'waiting' then 1
      else 2
    end,
    r.created_at desc
  limit 50;
end;
$$;

grant execute on function public.list_public_1v1_rooms() to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260221_get_public_room_players.sql
-- -----------------------------------------------------------------------------

-- Function to get public room players (bypasses RLS)
-- Used for displaying public room listings

create or replace function public.get_public_room_players()
returns table (
  room_id uuid,
  user_id uuid,
  display_name text,
  agency text,
  slot_no integer,
  is_host boolean,
  is_ready boolean,
  score integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    rp.room_id,
    rp.user_id,
    rp.display_name,
    rp.agency,
    rp.slot_no,
    rp.is_host,
    rp.ready,
    rp.score
  from public.room_players rp
  inner join public.rooms r on r.id = rp.room_id
  where r.is_public = true
  and r.status in ('waiting', 'in_progress');
end;
$$;

grant execute on function public.get_public_room_players() to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260221_get_room_details.sql
-- -----------------------------------------------------------------------------

-- Function to get room details for spectating (bypasses RLS)
-- Returns room, players, and results for a given room ID

create or replace function public.get_1v1_room_details(p_room_id uuid)
returns table (
  room jsonb,
  players jsonb,
  results jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    row_to_json(r)::jsonb as room,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', rp.id,
          'room_id', rp.room_id,
          'user_id', rp.user_id,
          'slot_no', rp.slot_no,
          'is_ready', rp.is_ready,
          'score', rp.score,
          'total_time_ms', rp.total_time_ms,
          'fastest_round_ms', rp.fastest_round_ms,
          'current_round', rp.current_round
        )
      ) filter (where rp.id is not null),
      '[]'::jsonb
    ) as players,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', rr.id,
          'room_id', rr.room_id,
          'user_id', rr.user_id,
          'score', rr.score,
          'total_time_ms', rr.total_time_ms,
          'placement', rr.placement,
          'is_winner', rr.is_winner
        )
      ) filter (where rr.id is not null),
      '[]'::jsonb
    ) as results
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  left join public.room_results rr on rr.room_id = r.id
  where r.id = p_room_id
  group by r.id;
end;
$$;

grant execute on function public.get_1v1_room_details(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260221_list_public_rooms_v2.sql
-- -----------------------------------------------------------------------------

-- Updated list_public_1v1_rooms to include player details and work with RLS
-- Uses security definer to bypass RLS and return all public room players

create or replace function public.list_public_1v1_rooms()
returns table (
  id uuid,
  game_type text,
  category text,
  rounds integer,
  created_at timestamptz,
  host_user_id uuid,
  status text,
  player_count integer,
  players jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_inactive_1v1_rooms();

  return query
  select
    r.id,
    r.game_type,
    r.category,
    r.rounds,
    r.created_at,
    r.host_user_id,
    r.status,
    count(rp.id)::int as player_count,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', rp.user_id,
        'display_name', rp.display_name,
        'agency', rp.agency,
        'is_host', rp.is_host,
        'ready', rp.ready,
        'score', rp.score
      )
    ) filter (where rp.user_id is not null), '[]'::jsonb) as players
  from public.rooms r
  left join public.room_players rp on rp.room_id = r.id
  where r.is_public = true
    and r.status in ('waiting', 'in_progress')
  group by r.id
  having count(rp.id) > 0
  or r.status = 'in_progress'
  order by
    case r.status
      when 'in_progress' then 0
      when 'waiting' then 1
      else 2
    end,
    r.created_at desc
  limit 50;
end;
$$;

grant execute on function public.list_public_1v1_rooms() to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260221_public_room_players.sql
-- -----------------------------------------------------------------------------

-- Allow viewing all room_players for public rooms (for public room listing)
-- This supplements the existing participant-only policy

drop policy if exists room_players_select_public on public.room_players;

create policy room_players_select_public
on public.room_players
for select
using (
  exists (
    select 1 from public.rooms r
    where r.id = room_players.room_id
    and r.is_public = true
  )
);


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260222_public_chat_retention_cleanup.sql
-- -----------------------------------------------------------------------------

-- Automatically remove public chat messages older than 48 hours.
-- Runs hourly via pg_cron and keeps cleanup server-side.

create extension if not exists pg_cron with schema extensions;

create or replace function public.cleanup_public_messages_48h()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.public_messages
  where created_at < now() - interval '48 hours';

  get diagnostics v_deleted = row_count;
  raise notice 'public_messages cleanup removed % rows', v_deleted;
  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.cleanup_public_messages_48h() from public;
revoke all on function public.cleanup_public_messages_48h() from anon, authenticated;
grant execute on function public.cleanup_public_messages_48h() to service_role;

do $$
declare
  job_record record;
begin
  for job_record in
    select jobid
    from cron.job
    where jobname = 'public_chat_cleanup_48h_hourly'
  loop
    perform cron.unschedule(job_record.jobid);
  end loop;
exception
  when undefined_table then
    null;
end;
$$;

select cron.schedule(
  'public_chat_cleanup_48h_hourly',
  '0 * * * *',
  $$select public.cleanup_public_messages_48h();$$
);

comment on function public.cleanup_public_messages_48h() is
  'Deletes rows from public_messages older than 48 hours. Scheduled hourly by pg_cron.';


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260223_1v1_category_pool_reuse.sql
-- -----------------------------------------------------------------------------

-- Keep 1v1 category content strict (PC/VC/HS) and reuse same-category pools
-- instead of failing or falling back when pool sizes are small.

create or replace function public.create_1v1_room(
  p_game_type text,
  p_category text,
  p_is_public boolean default true,
  p_rounds integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_join_code text;
  v_question_set jsonb := '[]'::jsonb;
  v_round integer;
  v_pool_count integer;
  v_pool jsonb := '[]'::jsonb;
  v_item jsonb;
  v_choices text[];
  v_choice text;
  v_choice_json jsonb;
  v_correct_index integer;
  v_records jsonb := '[]'::jsonb;
  v_round_pairs jsonb;
  v_idx integer;
  v_left text;
  v_right text;
  v_rounds integer := greatest(5, least(coalesce(p_rounds, 10), 50));
  v_category text := lower(trim(p_category));
  v_game_type text := lower(trim(p_game_type));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_game_type not in ('quiz', 'matching') then
    raise exception 'Invalid game type';
  end if;

  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_game_type = 'matching' and v_category = 'scenarios' then
    raise exception 'Matching does not support SCENARIOS';
  end if;

  if v_game_type = 'matching' then
    v_rounds := 5;
  end if;

  if v_game_type = 'quiz' then
    if v_category = 'scenarios' then
      with base as (
        select
          c.id,
          coalesce(nullif(trim(c.scenario), ''), trim(c.title)) as prompt,
          coalesce(nullif(trim(c.answer), ''), 'Use the most lawful option based on facts.') as correct_answer,
          coalesce(c.scenario_questions, '[]'::jsonb) as scenario_questions,
          coalesce(nullif(trim(c.explanation), ''), 'Use lawful authority and articulable facts.') as explanation
        from public.content_items c
        where c.is_published = true
          and c.type = 'scenario'
          and nullif(trim(coalesce(c.scenario, c.title)), '') is not null
        order by random()
        limit 120
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    else
      with base as (
        select
          c.id,
          trim(c.title) as title,
          trim(c.code_section) as code_section,
          coalesce(nullif(trim(c.explanation), ''), trim(c.question), trim(c.answer), '') as explanation
        from public.content_items c
        where c.is_published = true
          and c.type in ('code', 'question')
          and nullif(trim(c.title), '') is not null
          and nullif(trim(c.code_section), '') is not null
          and (
            v_category = 'all'
            or (
              v_category = 'pc'
              and (
                lower(c.category) in ('pc', 'penal', 'penal code', 'pc code', 'penal codes')
                or upper(trim(c.code_section)) like 'PC%'
              )
            )
            or (
              v_category = 'vc'
              and (
                lower(c.category) in ('vc', 'vehicle', 'vehicle code', 'vehicle codes', 'vc code')
                or upper(trim(c.code_section)) like 'VC%'
              )
            )
            or (
              v_category = 'hs'
              and (
                lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety', 'hs code', 'h&s code', 'health and safety code')
                or upper(trim(c.code_section)) like 'HS%'
                or upper(trim(c.code_section)) like 'H&S%'
              )
            )
          )
        order by random()
        limit 220
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    end if;

    if v_pool_count < 1 then
      raise exception 'Not enough content to generate quiz rounds for category %', v_category;
    end if;

    for v_round in 1..v_rounds loop
      v_item := v_pool -> ((v_round - 1) % v_pool_count);

      if v_category = 'scenarios' then
        v_choices := array[]::text[];
        for v_choice in
          select value::text
          from jsonb_array_elements_text(coalesce(v_item->'scenario_questions', '[]'::jsonb))
        loop
          if length(trim(v_choice)) > 0 then
            v_choices := array_append(v_choices, trim(v_choice));
          end if;
        end loop;

        if coalesce(array_length(v_choices, 1), 0) < 2 then
          v_choices := array[
            (v_item->>'correct_answer'),
            'Document observations and seek corroborating evidence.',
            'Delay enforcement action until legal elements are established.',
            'Prioritize scene safety and gather witness statements.'
          ];
        end if;

        if not ((v_item->>'correct_answer') = any(v_choices)) then
          v_choices := array_append(v_choices, (v_item->>'correct_answer'));
        end if;

        v_choices := (
          select array_agg(value)
          from (
            select distinct unnest(v_choices) as value
          ) dedup
          where length(trim(value)) > 0
        );

        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (
            select value
            from unnest(v_choices) as value
            order by random()
            limit 4
          ) randomized
        );

        if jsonb_array_length(v_choice_json) < 2 then
          raise exception 'Unable to generate scenario choices';
        end if;

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'correct_answer') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', v_item->>'prompt',
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation'
          )
        );
      else
        v_choices := array[(v_item->>'title')];

        for v_choice in
          select elem->>'title'
          from jsonb_array_elements(v_pool) as elem
          where (elem->>'id') <> (v_item->>'id')
            and nullif(trim(elem->>'title'), '') is not null
          order by random()
          limit 3
        loop
          v_choices := array_append(v_choices, v_choice);
        end loop;

        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (
            select value
            from unnest(v_choices) as value
            where length(trim(value)) > 0
            order by random()
            limit 4
          ) randomized
        );

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'title') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', concat('What best matches ', coalesce(v_item->>'code_section', 'this code section'), '?'),
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation',
            'sourceLabel', v_item->>'code_section'
          )
        );
      end if;
    end loop;
  else
    with base as (
      select
        c.id,
        trim(c.code_section) as code_section,
        trim(c.title) as title
      from public.content_items c
      where c.is_published = true
        and c.type in ('code', 'question')
        and nullif(trim(c.title), '') is not null
        and nullif(trim(c.code_section), '') is not null
        and (
          v_category = 'all'
          or (
            v_category = 'pc'
            and (
              lower(c.category) in ('pc', 'penal', 'penal code', 'pc code', 'penal codes')
              or upper(trim(c.code_section)) like 'PC%'
            )
          )
          or (
            v_category = 'vc'
            and (
              lower(c.category) in ('vc', 'vehicle', 'vehicle code', 'vehicle codes', 'vc code')
              or upper(trim(c.code_section)) like 'VC%'
            )
          )
          or (
            v_category = 'hs'
            and (
              lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety', 'hs code', 'h&s code', 'health and safety code')
              or upper(trim(c.code_section)) like 'HS%'
              or upper(trim(c.code_section)) like 'H&S%'
            )
          )
        )
      order by random()
      limit 180
    )
    select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
    into v_pool, v_pool_count
    from base;

    if v_pool_count < 1 then
      raise exception 'Not enough content to generate matching rounds for category %', v_category;
    end if;

    v_records := '[]'::jsonb;
    for v_round in 1..v_rounds loop
      v_round_pairs := '[]'::jsonb;
      for v_idx in 0..2 loop
        v_item := v_pool -> ((((v_round - 1) * 3) + v_idx) % v_pool_count);
        v_left := v_item->>'code_section';
        v_right := v_item->>'title';
        v_round_pairs := v_round_pairs || jsonb_build_array(
          jsonb_build_object(
            'pairId', gen_random_uuid(),
            'left', v_left,
            'right', v_right
          )
        );
      end loop;
      v_records := v_records || jsonb_build_array(
        jsonb_build_object(
          'round', v_round,
          'pairs', v_round_pairs
        )
      );
    end loop;
    v_question_set := v_records;
  end if;

  v_join_code := case when p_is_public then null else public.generate_room_join_code() end;

  insert into public.rooms (
    host_user_id,
    game_type,
    category,
    is_public,
    join_code,
    rounds,
    question_set,
    status,
    current_round
  ) values (
    v_uid,
    v_game_type,
    v_category,
    p_is_public,
    v_join_code,
    v_rounds,
    v_question_set,
    'waiting',
    1
  )
  returning id into v_room_id;

  insert into public.room_players (room_id, user_id, slot_no, is_ready)
  values (v_room_id, v_uid, 1, false);

  return v_room_id;
end;
$$;

grant execute on function public.create_1v1_room(text, text, boolean, integer) to authenticated;

create or replace function public.rematch_1v1_room(
  p_room_id uuid,
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_category text;
  v_rounds integer;
  v_player_count integer;
  v_ready_count integer;
  v_question_set jsonb := '[]'::jsonb;
  v_pool jsonb := '[]'::jsonb;
  v_pool_count integer := 0;
  v_round integer;
  v_idx integer;
  v_item jsonb;
  v_round_pairs jsonb;
  v_choices text[];
  v_choice text;
  v_choice_json jsonb;
  v_correct_index integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if not exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = v_uid
  ) then
    raise exception 'Only room participants can request a rematch';
  end if;

  if v_room.status <> 'completed' then
    raise exception 'Rematch is available only after match completion';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count <> 2 then
    raise exception 'Rematch requires exactly two players';
  end if;

  if v_ready_count <> 2 then
    raise exception 'Both players must agree to rematch';
  end if;

  v_category := lower(trim(coalesce(nullif(p_category, ''), v_room.category)));
  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_room.game_type = 'matching' and v_category = 'scenarios' then
    v_category := 'all';
  end if;

  v_rounds := case
    when v_room.game_type = 'matching' then 5
    else greatest(5, least(coalesce(v_room.rounds, 10), 50))
  end;

  if v_room.game_type = 'quiz' then
    if v_category = 'scenarios' then
      with base as (
        select
          c.id,
          coalesce(nullif(trim(c.scenario), ''), trim(c.title)) as prompt,
          coalesce(nullif(trim(c.answer), ''), 'Use the most lawful option based on facts.') as correct_answer,
          coalesce(c.scenario_questions, '[]'::jsonb) as scenario_questions,
          coalesce(nullif(trim(c.explanation), ''), 'Use lawful authority and articulable facts.') as explanation
        from public.content_items c
        where c.is_published = true
          and c.type = 'scenario'
          and nullif(trim(coalesce(c.scenario, c.title)), '') is not null
        order by random()
        limit greatest(v_rounds * 8, 120)
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    else
      with base as (
        select
          c.id,
          trim(c.title) as title,
          trim(c.code_section) as code_section,
          coalesce(nullif(trim(c.explanation), ''), trim(c.question), trim(c.answer), '') as explanation
        from public.content_items c
        where c.is_published = true
          and c.type in ('code', 'question')
          and nullif(trim(c.title), '') is not null
          and nullif(trim(c.code_section), '') is not null
          and (
            v_category = 'all'
            or (
              v_category = 'pc'
              and (
                lower(c.category) in ('pc', 'penal', 'penal code', 'pc code', 'penal codes')
                or upper(trim(c.code_section)) like 'PC%'
              )
            )
            or (
              v_category = 'vc'
              and (
                lower(c.category) in ('vc', 'vehicle', 'vehicle code', 'vehicle codes', 'vc code')
                or upper(trim(c.code_section)) like 'VC%'
              )
            )
            or (
              v_category = 'hs'
              and (
                lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety', 'hs code', 'h&s code', 'health and safety code')
                or upper(trim(c.code_section)) like 'HS%'
                or upper(trim(c.code_section)) like 'H&S%'
              )
            )
          )
        order by random()
        limit greatest(v_rounds * 8, 220)
      )
      select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
      into v_pool, v_pool_count
      from base;
    end if;

    if v_pool_count < 1 then
      raise exception 'Not enough content to generate quiz rounds for category %', v_category;
    end if;

    for v_round in 1..v_rounds loop
      v_item := v_pool -> ((v_round - 1) % v_pool_count);

      if v_category = 'scenarios' then
        v_choices := array[]::text[];
        for v_choice in
          select value::text
          from jsonb_array_elements_text(coalesce(v_item->'scenario_questions', '[]'::jsonb))
        loop
          if length(trim(v_choice)) > 0 then
            v_choices := array_append(v_choices, trim(v_choice));
          end if;
        end loop;

        if coalesce(array_length(v_choices, 1), 0) < 2 then
          v_choices := array[
            (v_item->>'correct_answer'),
            'Document observations and seek corroborating evidence.',
            'Delay enforcement action until legal elements are established.',
            'Prioritize scene safety and gather witness statements.'
          ];
        end if;

        if not ((v_item->>'correct_answer') = any(v_choices)) then
          v_choices := array_append(v_choices, (v_item->>'correct_answer'));
        end if;

        v_choices := (
          select array_agg(value)
          from (
            select distinct unnest(v_choices) as value
          ) dedup
          where length(trim(value)) > 0
        );

        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (
            select value
            from unnest(v_choices) as value
            order by random()
            limit 4
          ) randomized
        );

        if jsonb_array_length(v_choice_json) < 2 then
          raise exception 'Unable to generate scenario choices';
        end if;

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'correct_answer') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', v_item->>'prompt',
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation'
          )
        );
      else
        v_choices := array[(v_item->>'title')];

        for v_choice in
          select elem->>'title'
          from jsonb_array_elements(v_pool) as elem
          where (elem->>'id') <> (v_item->>'id')
            and nullif(trim(elem->>'title'), '') is not null
          order by random()
          limit 3
        loop
          v_choices := array_append(v_choices, v_choice);
        end loop;

        v_choice_json := (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from (
            select value
            from unnest(v_choices) as value
            where length(trim(value)) > 0
            order by random()
            limit 4
          ) randomized
        );

        v_correct_index := 0;
        for v_idx in 0..jsonb_array_length(v_choice_json) - 1 loop
          if (v_choice_json ->> v_idx) = (v_item->>'title') then
            v_correct_index := v_idx;
            exit;
          end if;
        end loop;

        v_question_set := v_question_set || jsonb_build_array(
          jsonb_build_object(
            'round', v_round,
            'prompt', concat('What best matches ', coalesce(v_item->>'code_section', 'this code section'), '?'),
            'choices', v_choice_json,
            'correctIndex', v_correct_index,
            'explanation', v_item->>'explanation',
            'sourceLabel', v_item->>'code_section'
          )
        );
      end if;
    end loop;
  else
    with base as (
      select
        c.id,
        trim(c.code_section) as code_section,
        trim(c.title) as title
      from public.content_items c
      where c.is_published = true
        and c.type in ('code', 'question')
        and nullif(trim(c.title), '') is not null
        and nullif(trim(c.code_section), '') is not null
        and (
          v_category = 'all'
          or (
            v_category = 'pc'
            and (
              lower(c.category) in ('pc', 'penal', 'penal code', 'pc code', 'penal codes')
              or upper(trim(c.code_section)) like 'PC%'
            )
          )
          or (
            v_category = 'vc'
            and (
              lower(c.category) in ('vc', 'vehicle', 'vehicle code', 'vehicle codes', 'vc code')
              or upper(trim(c.code_section)) like 'VC%'
            )
          )
          or (
            v_category = 'hs'
            and (
              lower(c.category) in ('hs', 'h&s', 'health', 'health & safety', 'health and safety', 'hs code', 'h&s code', 'health and safety code')
              or upper(trim(c.code_section)) like 'HS%'
              or upper(trim(c.code_section)) like 'H&S%'
            )
          )
        )
      order by random()
      limit greatest(v_rounds * 8, 180)
    )
    select coalesce(jsonb_agg(to_jsonb(base)), '[]'::jsonb), count(*)::int
    into v_pool, v_pool_count
    from base;

    if v_pool_count < 1 then
      raise exception 'Not enough content to generate matching rounds for category %', v_category;
    end if;

    for v_round in 1..v_rounds loop
      v_round_pairs := '[]'::jsonb;
      for v_idx in 1..3 loop
        v_item := v_pool -> ((((v_round - 1) * 3) + (v_idx - 1)) % v_pool_count);
        v_round_pairs := v_round_pairs || jsonb_build_array(
          jsonb_build_object(
            'pairId', gen_random_uuid(),
            'left', v_item->>'code_section',
            'right', v_item->>'title'
          )
        );
      end loop;

      v_question_set := v_question_set || jsonb_build_array(
        jsonb_build_object(
          'round', v_round,
          'pairs', v_round_pairs
        )
      );
    end loop;
  end if;

  delete from public.room_results where room_id = p_room_id;

  update public.room_players
  set
    is_ready = true,
    score = 0,
    total_time_ms = 0,
    fastest_round_ms = 0,
    current_round = 1,
    last_seen = now()
  where room_id = p_room_id;

  update public.rooms
  set
    question_set = v_question_set,
    category = v_category,
    rounds = v_rounds,
    status = 'in_progress',
    current_round = 1,
    winner_user_id = null,
    started_at = now(),
    ended_at = null,
    rematch_room_id = null
  where id = p_room_id;

  return p_room_id;
end;
$$;

grant execute on function public.rematch_1v1_room(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260223_game_attempt_history.sql
-- -----------------------------------------------------------------------------

create table if not exists public.game_attempt_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('study_test', 'matching', 'speed')),
  track_key text not null,
  filter text not null check (filter in ('all', 'penal', 'hs', 'vehicle')),
  duration int4,
  score int4 not null default 0,
  correct int4 not null default 0,
  incorrect int4 not null default 0,
  accuracy int4 not null default 0 check (accuracy >= 0 and accuracy <= 100),
  rank int4,
  created_at timestamptz not null default now()
);

create index if not exists idx_game_attempt_history_user_created
  on public.game_attempt_history (user_id, created_at desc);

create index if not exists idx_game_attempt_history_track_created
  on public.game_attempt_history (user_id, track_key, created_at desc);

create unique index if not exists idx_game_attempt_history_unique_point
  on public.game_attempt_history (user_id, track_key, created_at, score);

alter table public.game_attempt_history enable row level security;

drop policy if exists game_attempt_history_select_self on public.game_attempt_history;
create policy game_attempt_history_select_self
on public.game_attempt_history
for select
using (auth.uid() = user_id);

drop policy if exists game_attempt_history_insert_self on public.game_attempt_history;
create policy game_attempt_history_insert_self
on public.game_attempt_history
for insert
with check (auth.uid() = user_id);

grant select, insert on public.game_attempt_history to authenticated;

with track_rows as (
  select
    a.user_id,
    coalesce(a.updated_at, now()) as updated_at,
    kv.key as track_key,
    kv.value as track_value
  from public.app_state a
  cross join lateral jsonb_each(coalesce(a.profile_details->'stats'->'sessionTracks', '{}'::jsonb)) as kv
),
parsed_tracks as (
  select
    tr.user_id,
    tr.updated_at,
    tr.track_key,
    tr.track_value,
    case
      when tr.track_key like 'study_test|%' then 'study_test'
      when tr.track_key like 'matching|%' then 'matching'
      when tr.track_key like 'speed|%' then 'speed'
      else null
    end as mode,
    coalesce(nullif(substring(tr.track_key from '\|f=([^|]+)'), ''), 'all') as filter,
    nullif(substring(tr.track_key from '\|d=([^|]+)'), '')::int as duration
  from track_rows tr
),
score_points as (
  select
    pt.user_id,
    pt.mode,
    pt.track_key,
    pt.filter,
    pt.duration,
    pt.updated_at,
    sp.ordinality as score_index,
    coalesce(jsonb_array_length(coalesce(pt.track_value->'scoreHistory', '[]'::jsonb)), 0) as score_total,
    greatest(0, (sp.value)::int) as score,
    case
      when coalesce(pt.track_value->'accuracyHistory'->>((sp.ordinality - 1)::int), '') ~ '^-?\d+$'
        then greatest(0, least(100, (pt.track_value->'accuracyHistory'->>((sp.ordinality - 1)::int))::int))
      else 0
    end as accuracy
  from parsed_tracks pt
  cross join lateral jsonb_array_elements_text(coalesce(pt.track_value->'scoreHistory', '[]'::jsonb)) with ordinality as sp(value, ordinality)
  where pt.mode is not null
    and pt.filter in ('all', 'penal', 'hs', 'vehicle')
),
inserted_history as (
  insert into public.game_attempt_history (
    user_id,
    mode,
    track_key,
    filter,
    duration,
    score,
    correct,
    incorrect,
    accuracy,
    rank,
    created_at
  )
  select
    sp.user_id,
    sp.mode,
    sp.track_key,
    sp.filter,
    sp.duration,
    sp.score,
    0,
    0,
    sp.accuracy,
    null,
    sp.updated_at - ((sp.score_total - sp.score_index) * interval '45 seconds')
  from score_points sp
  on conflict do nothing
  returning 1
)
insert into public.game_attempt_history (
  user_id,
  mode,
  track_key,
  filter,
  duration,
  score,
  correct,
  incorrect,
  accuracy,
  rank,
  created_at
)
select
  pt.user_id,
  pt.mode,
  pt.track_key,
  pt.filter,
  pt.duration,
  greatest(0, coalesce((pt.track_value->'lastAttempt'->>'score')::int, 0)) as score,
  greatest(0, coalesce((pt.track_value->'lastAttempt'->>'correct')::int, 0)) as correct,
  greatest(0, coalesce((pt.track_value->'lastAttempt'->>'incorrect')::int, 0)) as incorrect,
  greatest(0, least(100, coalesce((pt.track_value->'lastAttempt'->>'accuracy')::int, 0))) as accuracy,
  case
    when coalesce(pt.track_value->'lastAttempt'->>'rank', '') ~ '^-?\d+$'
      then nullif((pt.track_value->'lastAttempt'->>'rank')::int, 0)
    else null
  end as rank,
  pt.updated_at
from parsed_tracks pt
where pt.mode is not null
  and pt.filter in ('all', 'penal', 'hs', 'vehicle')
  and pt.track_value ? 'lastAttempt'
  and not exists (
    select 1
    from score_points sp
    where sp.user_id = pt.user_id
      and sp.track_key = pt.track_key
  )
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260223_reset_user_progress_data.sql
-- -----------------------------------------------------------------------------

-- Reset all user-specific progress/stats data across the app.
-- Keeps account/profile identity intact while wiping progress history.

create or replace function public.reset_user_progress_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted integer := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if to_regclass('public.app_state') is not null then
    delete from public.app_state
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('app_state', v_deleted);
  end if;

  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('leaderboard', v_deleted);
  end if;

  if to_regclass('public.game_attempt_history') is not null then
    delete from public.game_attempt_history
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('game_attempt_history', v_deleted);
  end if;

  if to_regclass('public.duel_invites') is not null then
    delete from public.duel_invites
    where sender_user_id = v_uid
       or recipient_user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_invites', v_deleted);
  end if;

  if to_regclass('public.rooms') is not null then
    delete from public.rooms
    where host_user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('rooms_hosted', v_deleted);
  end if;

  if to_regclass('public.room_players') is not null then
    delete from public.room_players
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('room_players', v_deleted);
  end if;

  if to_regclass('public.room_results') is not null then
    delete from public.room_results
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('room_results', v_deleted);
  end if;

  if to_regclass('public.duel_room_messages') is not null then
    delete from public.duel_room_messages
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_room_messages', v_deleted);
  end if;

  if to_regclass('public.duel_player_stats') is not null then
    delete from public.duel_player_stats
    where user_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_player_stats', v_deleted);
  end if;

  return v_summary;
end;
$$;

revoke all on function public.reset_user_progress_data() from public;
revoke all on function public.reset_user_progress_data() from anon;
grant execute on function public.reset_user_progress_data() to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260224_owner_account_moderation.sql
-- -----------------------------------------------------------------------------

-- Owner account moderation:
-- - Ban account (removes from all leaderboards + blocks future score/progress writes)
-- - Delete account (hard delete from auth.users with cascading data removal)

-- Ensure owner-role table exists (for environments that haven't run the owner-role migration yet).
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'user_roles_select_own'
  ) then
    create policy user_roles_select_own
    on public.user_roles
    for select
    using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'user_roles_read_owner_only'
  ) then
    create policy user_roles_read_owner_only
    on public.user_roles
    for select
    using (role = 'owner');
  end if;
end $$;

create table if not exists public.banned_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_banned_users_created_at on public.banned_users (created_at desc);

alter table public.banned_users enable row level security;

drop policy if exists banned_users_select_self_or_owner on public.banned_users;
create policy banned_users_select_self_or_owner
on public.banned_users
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
);

drop policy if exists banned_users_insert_owner_only on public.banned_users;
create policy banned_users_insert_owner_only
on public.banned_users
for insert
with check (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
);

drop policy if exists banned_users_update_owner_only on public.banned_users;
create policy banned_users_update_owner_only
on public.banned_users
for update
using (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
);

drop policy if exists banned_users_delete_owner_only on public.banned_users;
create policy banned_users_delete_owner_only
on public.banned_users
for delete
using (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
);

grant select on public.banned_users to authenticated;
grant insert, update, delete on public.banned_users to authenticated;
revoke all on public.banned_users from anon;

create or replace function public.is_owner_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = p_user_id
      and r.role = 'owner'
  );
$$;

create or replace function public.is_user_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.banned_users b
    where b.user_id = p_user_id
  );
$$;

create or replace function public.owner_manage_account(
  p_target_user_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_deleted integer := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_owner_user(v_actor) then
    raise exception 'Owner role required';
  end if;

  if p_target_user_id is null then
    raise exception 'Target account is required';
  end if;

  if p_target_user_id = v_actor then
    raise exception 'You cannot moderate your own account';
  end if;

  if public.is_owner_user(p_target_user_id) then
    raise exception 'Owner accounts cannot be moderated from this action';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_target_user_id) then
    raise exception 'Target account not found';
  end if;

  if v_action not in ('ban', 'delete') then
    raise exception 'Unsupported moderation action: %', p_action;
  end if;

  if v_action = 'ban' then
    insert into public.banned_users (user_id, reason, created_at, created_by)
    values (p_target_user_id, nullif(trim(coalesce(p_reason, '')), ''), now(), v_actor)
    on conflict (user_id)
    do update
      set reason = excluded.reason,
          created_at = now(),
          created_by = v_actor;

    if to_regclass('public.app_state') is not null then
      delete from public.app_state where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('app_state', v_deleted);
    end if;

    if to_regclass('public.leaderboard') is not null then
      delete from public.leaderboard where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('leaderboard', v_deleted);
    end if;

    if to_regclass('public.duel_player_stats') is not null then
      delete from public.duel_player_stats where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_player_stats', v_deleted);
    end if;

    if to_regclass('public.game_attempt_history') is not null then
      delete from public.game_attempt_history where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('game_attempt_history', v_deleted);
    end if;

    if to_regclass('public.rooms') is not null then
      delete from public.rooms where host_user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('rooms_hosted', v_deleted);
    end if;

    if to_regclass('public.room_players') is not null then
      delete from public.room_players where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('room_players', v_deleted);
    end if;

    if to_regclass('public.room_results') is not null then
      delete from public.room_results where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('room_results', v_deleted);
    end if;

    if to_regclass('public.duel_invites') is not null then
      delete from public.duel_invites where sender_user_id = p_target_user_id or recipient_user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_invites', v_deleted);
    end if;

    if to_regclass('public.duel_room_messages') is not null then
      delete from public.duel_room_messages where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_room_messages', v_deleted);
    end if;

    if to_regclass('public.public_messages') is not null then
      delete from public.public_messages where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('public_messages', v_deleted);
    end if;

    return jsonb_build_object(
      'ok', true,
      'action', 'ban',
      'target_user_id', p_target_user_id,
      'summary', v_summary
    );
  end if;

  -- delete
  delete from auth.users
  where id = p_target_user_id;

  if not found then
    raise exception 'Target account not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'delete',
    'target_user_id', p_target_user_id
  );
end;
$$;

revoke all on function public.owner_manage_account(uuid, text, text) from public;
revoke all on function public.owner_manage_account(uuid, text, text) from anon;
grant execute on function public.owner_manage_account(uuid, text, text) to authenticated;

-- Compatibility wrapper for PostgREST/Supabase RPC argument ordering.
create or replace function public.owner_manage_account(
  p_action text,
  p_reason text,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regprocedure('public.owner_manage_account_impl(uuid,text,text)') is not null then
    return public.owner_manage_account_impl(p_target_user_id, p_action, p_reason);
  end if;

  if to_regprocedure('public.owner_manage_account(uuid,text,text)') is not null then
    return public.owner_manage_account(p_target_user_id, p_action, p_reason);
  end if;

  raise exception 'Base moderation function missing. Run baseline migration 00000000000000_leo_study_baseline.sql';
end;
$$;

revoke all on function public.owner_manage_account(text, text, uuid) from public;
revoke all on function public.owner_manage_account(text, text, uuid) from anon;
grant execute on function public.owner_manage_account(text, text, uuid) to authenticated;

-- Stable single-signature RPC entrypoint (avoids overload/schema-cache ambiguity).
create or replace function public.owner_moderate_account(
  p_action text,
  p_reason text,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_deleted integer := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_owner_user(v_actor) then
    raise exception 'Owner role required';
  end if;

  if p_target_user_id is null then
    raise exception 'Target account is required';
  end if;

  if p_target_user_id = v_actor then
    raise exception 'You cannot moderate your own account';
  end if;

  if public.is_owner_user(p_target_user_id) then
    raise exception 'Owner accounts cannot be moderated from this action';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_target_user_id) then
    raise exception 'Target account not found';
  end if;

  if v_action not in ('ban', 'delete') then
    raise exception 'Unsupported moderation action: %', p_action;
  end if;

  if v_action = 'ban' then
    insert into public.banned_users (user_id, reason, created_at, created_by)
    values (p_target_user_id, nullif(trim(coalesce(p_reason, '')), ''), now(), v_actor)
    on conflict (user_id)
    do update
      set reason = excluded.reason,
          created_at = now(),
          created_by = v_actor;

    if to_regclass('public.app_state') is not null then
      delete from public.app_state where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('app_state', v_deleted);
    end if;

    if to_regclass('public.leaderboard') is not null then
      delete from public.leaderboard where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('leaderboard', v_deleted);
    end if;

    if to_regclass('public.duel_player_stats') is not null then
      delete from public.duel_player_stats where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_player_stats', v_deleted);
    end if;

    if to_regclass('public.game_attempt_history') is not null then
      delete from public.game_attempt_history where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('game_attempt_history', v_deleted);
    end if;

    if to_regclass('public.rooms') is not null then
      delete from public.rooms where host_user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('rooms_hosted', v_deleted);
    end if;

    if to_regclass('public.room_players') is not null then
      delete from public.room_players where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('room_players', v_deleted);
    end if;

    if to_regclass('public.room_results') is not null then
      delete from public.room_results where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('room_results', v_deleted);
    end if;

    if to_regclass('public.duel_invites') is not null then
      delete from public.duel_invites where sender_user_id = p_target_user_id or recipient_user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_invites', v_deleted);
    end if;

    if to_regclass('public.duel_room_messages') is not null then
      delete from public.duel_room_messages where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_room_messages', v_deleted);
    end if;

    if to_regclass('public.public_messages') is not null then
      delete from public.public_messages where user_id = p_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('public_messages', v_deleted);
    end if;

    return jsonb_build_object(
      'ok', true,
      'action', 'ban',
      'target_user_id', p_target_user_id,
      'summary', v_summary
    );
  end if;

  delete from auth.users
  where id = p_target_user_id;

  if not found then
    raise exception 'Target account not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'delete',
    'target_user_id', p_target_user_id
  );
end;
$$;

revoke all on function public.owner_moderate_account(text, text, uuid) from public;
revoke all on function public.owner_moderate_account(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account(text, text, uuid) to authenticated;

-- Versioned stable RPC name for client calls (prevents schema-cache collisions with overloaded names).
create or replace function public.owner_moderate_account_v1(
  action text,
  reason text,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account(action, reason, target_user_id);
end;
$$;

revoke all on function public.owner_moderate_account_v1(text, text, uuid) from public;
revoke all on function public.owner_moderate_account_v1(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account_v1(text, text, uuid) to authenticated;

-- Restrictive "not banned" policies so banned users cannot write progress/scores.
do $$
begin
  if to_regclass('public.app_state') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_state' and policyname = 'app_state_block_banned_insert'
  ) then
    execute 'create policy app_state_block_banned_insert on public.app_state as restrictive for insert to authenticated with check (not public.is_user_banned(auth.uid()))';
  end if;

  if to_regclass('public.app_state') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_state' and policyname = 'app_state_block_banned_update'
  ) then
    execute 'create policy app_state_block_banned_update on public.app_state as restrictive for update to authenticated using (not public.is_user_banned(auth.uid())) with check (not public.is_user_banned(auth.uid()))';
  end if;

  if to_regclass('public.leaderboard') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leaderboard' and policyname = 'leaderboard_block_banned_insert'
  ) then
    execute 'create policy leaderboard_block_banned_insert on public.leaderboard as restrictive for insert to authenticated with check (not public.is_user_banned(auth.uid()))';
  end if;

  if to_regclass('public.leaderboard') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leaderboard' and policyname = 'leaderboard_block_banned_update'
  ) then
    execute 'create policy leaderboard_block_banned_update on public.leaderboard as restrictive for update to authenticated using (not public.is_user_banned(auth.uid())) with check (not public.is_user_banned(auth.uid()))';
  end if;

  if to_regclass('public.profiles') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_block_banned_update'
  ) then
    execute 'create policy profiles_block_banned_update on public.profiles as restrictive for update to authenticated using (not public.is_user_banned(auth.uid())) with check (not public.is_user_banned(auth.uid()))';
  end if;

  if to_regclass('public.public_messages') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'public_messages' and policyname = 'public_messages_block_banned_insert'
  ) then
    execute 'create policy public_messages_block_banned_insert on public.public_messages as restrictive for insert to authenticated with check (not public.is_user_banned(auth.uid()))';
  end if;
end $$;

-- Keep banned users out of "online now" lists and counters.
create or replace function public.get_online_users_count(minutes_interval int default 5)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_minutes int := greatest(1, least(coalesce(minutes_interval, 5), 60));
begin
  if to_regclass('public.profiles') is null then
    return 0;
  end if;

  execute
    'select count(*)::int
       from public.profiles p
      where p.last_active is not null
        and p.last_active > now() - ($1 || '' minutes'')::interval
        and not public.is_user_banned(p.user_id)'
  into v_count
  using v_minutes;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.list_online_1v1_users(
  p_minutes_interval int default 5
)
returns table (
  user_id uuid,
  username text,
  avatar_path text,
  supporter_tier text,
  last_active timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_minutes int := greatest(1, least(coalesce(p_minutes_interval, 5), 60));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if to_regclass('public.profiles') is null then
    return;
  end if;

  return query
  execute
    'select
        p.user_id,
        p.username,
        p.avatar_path,
        p.supporter_tier,
        p.last_active
      from public.profiles p
      where p.user_id <> $1
        and p.last_active is not null
        and p.last_active > now() - ($2 || '' minutes'')::interval
        and not public.is_user_banned(p.user_id)
      order by p.last_active desc, p.username asc'
  using v_uid, v_minutes;
end;
$$;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260224_owner_account_moderation_rpc_hotfix.sql
-- -----------------------------------------------------------------------------

-- Owner moderation RPC hotfix
-- Goal: provide one stable, non-overloaded RPC entrypoint that PostgREST can always resolve.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

create table if not exists public.banned_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.banned_users enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'banned_users'
      and policyname = 'banned_users_select_self_or_owner'
  ) then
    create policy banned_users_select_self_or_owner
    on public.banned_users
    for select
    using (
      auth.uid() = user_id
      or exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'banned_users'
      and policyname = 'banned_users_insert_owner_only'
  ) then
    create policy banned_users_insert_owner_only
    on public.banned_users
    for insert
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'banned_users'
      and policyname = 'banned_users_update_owner_only'
  ) then
    create policy banned_users_update_owner_only
    on public.banned_users
    for update
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    )
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'banned_users'
      and policyname = 'banned_users_delete_owner_only'
  ) then
    create policy banned_users_delete_owner_only
    on public.banned_users
    for delete
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;
end $$;

grant select on public.banned_users to authenticated;
grant insert, update, delete on public.banned_users to authenticated;

-- Remove ambiguous legacy overload that causes PostgREST RPC resolution failures.
drop function if exists public.owner_manage_account(text, text, uuid);

create or replace function public.is_owner_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = p_user_id
      and r.role = 'owner'
  );
$$;

create or replace function public.owner_cleanup_user_data_for_moderation(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  if to_regclass('public.app_state') is not null then
    delete from public.app_state where user_id = p_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('app_state', v_deleted);
  end if;

  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard where user_id = p_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('leaderboard', v_deleted);
  end if;

  if to_regclass('public.duel_player_stats') is not null then
    delete from public.duel_player_stats where user_id = p_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_player_stats', v_deleted);
  end if;

  if to_regclass('public.game_attempt_history') is not null then
    delete from public.game_attempt_history where user_id = p_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('game_attempt_history', v_deleted);
  end if;

  if to_regclass('public.rooms') is not null then
    delete from public.rooms where host_user_id = p_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('rooms_hosted', v_deleted);
  end if;

  if to_regclass('public.room_players') is not null then
    delete from public.room_players where user_id = p_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('room_players', v_deleted);
  end if;

  if to_regclass('public.room_results') is not null then
    delete from public.room_results where user_id = p_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('room_results', v_deleted);
  end if;

  if to_regclass('public.duel_invites') is not null then
    delete from public.duel_invites where sender_user_id = p_target_user_id or recipient_user_id = p_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_invites', v_deleted);
  end if;

  if to_regclass('public.duel_room_messages') is not null then
    delete from public.duel_room_messages where user_id = p_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_room_messages', v_deleted);
  end if;

  if to_regclass('public.public_messages') is not null then
    delete from public.public_messages where user_id = p_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('public_messages', v_deleted);
  end if;

  return v_summary;
end;
$$;

create or replace function public.owner_moderation_core_v1(
  p_target_user_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_summary jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_owner_user(v_actor) then
    raise exception 'Owner role required';
  end if;

  if p_target_user_id is null then
    raise exception 'Target account is required';
  end if;

  if p_target_user_id = v_actor then
    raise exception 'You cannot moderate your own account';
  end if;

  if public.is_owner_user(p_target_user_id) then
    raise exception 'Owner accounts cannot be moderated from this action';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_target_user_id) then
    raise exception 'Target account not found';
  end if;

  if v_action not in ('ban', 'delete') then
    raise exception 'Unsupported moderation action: %', p_action;
  end if;

  if v_action = 'ban' then
    insert into public.banned_users (user_id, reason, created_at, created_by)
    values (p_target_user_id, v_reason, now(), v_actor)
    on conflict (user_id)
    do update
      set reason = excluded.reason,
          created_at = now(),
          created_by = excluded.created_by;

    v_summary := public.owner_cleanup_user_data_for_moderation(p_target_user_id);

    return jsonb_build_object(
      'ok', true,
      'action', 'ban',
      'target_user_id', p_target_user_id,
      'summary', v_summary
    );
  end if;

  v_summary := public.owner_cleanup_user_data_for_moderation(p_target_user_id);

  delete from auth.users where id = p_target_user_id;
  if not found then
    raise exception 'Target account not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'delete',
    'target_user_id', p_target_user_id,
    'summary', v_summary
  );
end;
$$;

-- Stable RPC endpoint with explicit parameter names used by the web app.
create or replace function public.owner_moderate_account_json(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_raw text := trim(coalesce(p_payload ->> 'target_user_id', ''));
  v_target_user_id uuid;
  v_action text := lower(trim(coalesce(p_payload ->> 'action', '')));
  v_reason text := nullif(trim(coalesce(p_payload ->> 'reason', '')), '');
begin
  if p_payload is null then
    raise exception 'Payload is required';
  end if;

  if v_target_raw = '' then
    raise exception 'target_user_id is required';
  end if;

  begin
    v_target_user_id := v_target_raw::uuid;
  exception
    when others then
      raise exception 'target_user_id must be a valid uuid';
  end;

  return public.owner_moderation_core_v1(
    p_target_user_id => v_target_user_id,
    p_action => v_action,
    p_reason => v_reason
  );
end;
$$;

-- Backward-compatible RPC names used in older frontend builds.
create or replace function public.owner_moderate_account_v1(
  action text,
  reason text,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderation_core_v1(target_user_id, action, reason);
end;
$$;

create or replace function public.owner_moderate_account(
  p_action text,
  p_reason text,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderation_core_v1(p_target_user_id, p_action, p_reason);
end;
$$;

create or replace function public.owner_manage_account(
  p_target_user_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderation_core_v1(p_target_user_id, p_action, p_reason);
end;
$$;

revoke all on function public.owner_cleanup_user_data_for_moderation(uuid) from public;
revoke all on function public.owner_cleanup_user_data_for_moderation(uuid) from anon;
grant execute on function public.owner_cleanup_user_data_for_moderation(uuid) to authenticated;

revoke all on function public.owner_moderation_core_v1(uuid, text, text) from public;
revoke all on function public.owner_moderation_core_v1(uuid, text, text) from anon;
grant execute on function public.owner_moderation_core_v1(uuid, text, text) to authenticated;

revoke all on function public.owner_moderate_account_json(jsonb) from public;
revoke all on function public.owner_moderate_account_json(jsonb) from anon;
grant execute on function public.owner_moderate_account_json(jsonb) to authenticated;

revoke all on function public.owner_moderate_account_v1(text, text, uuid) from public;
revoke all on function public.owner_moderate_account_v1(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account_v1(text, text, uuid) to authenticated;

revoke all on function public.owner_moderate_account(text, text, uuid) from public;
revoke all on function public.owner_moderate_account(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account(text, text, uuid) to authenticated;

revoke all on function public.owner_manage_account(uuid, text, text) from public;
revoke all on function public.owner_manage_account(uuid, text, text) from anon;
grant execute on function public.owner_manage_account(uuid, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260224_owner_moderation_emergency_single_rpc.sql
-- -----------------------------------------------------------------------------

-- Emergency owner moderation RPC repair
-- Use when frontend shows:
-- "Owner moderation RPC is missing in Supabase..."
--
-- This creates ONE stable RPC used by the app:
--   public.owner_moderate_account_json(p_payload jsonb)
-- and keeps compatibility wrappers.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.banned_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.user_roles enable row level security;
alter table public.banned_users enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'user_roles_select_own'
  ) then
    create policy user_roles_select_own
    on public.user_roles
    for select
    using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'user_roles_read_owner_only'
  ) then
    create policy user_roles_read_owner_only
    on public.user_roles
    for select
    using (role = 'owner');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'banned_users'
      and policyname = 'banned_users_select_self_or_owner'
  ) then
    create policy banned_users_select_self_or_owner
    on public.banned_users
    for select
    using (
      auth.uid() = user_id
      or exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'banned_users'
      and policyname = 'banned_users_insert_owner_only'
  ) then
    create policy banned_users_insert_owner_only
    on public.banned_users
    for insert
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'banned_users'
      and policyname = 'banned_users_update_owner_only'
  ) then
    create policy banned_users_update_owner_only
    on public.banned_users
    for update
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    )
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'banned_users'
      and policyname = 'banned_users_delete_owner_only'
  ) then
    create policy banned_users_delete_owner_only
    on public.banned_users
    for delete
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;
end $$;

grant select on public.banned_users to authenticated;
grant insert, update, delete on public.banned_users to authenticated;

drop function if exists public.owner_manage_account(text, text, uuid);

create or replace function public.is_owner_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = p_user_id
      and r.role = 'owner'
  );
$$;

create or replace function public.owner_moderate_account_json(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_payload ->> 'action', '')));
  v_reason text := nullif(trim(coalesce(p_payload ->> 'reason', '')), '');
  v_target_user_id uuid;
  v_target_raw text := trim(coalesce(p_payload ->> 'target_user_id', ''));
  v_deleted int := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_owner_user(v_actor) then
    raise exception 'Owner role required';
  end if;

  if p_payload is null then
    raise exception 'Payload is required';
  end if;

  if v_target_raw = '' then
    raise exception 'target_user_id is required';
  end if;

  begin
    v_target_user_id := v_target_raw::uuid;
  exception
    when others then
      raise exception 'target_user_id must be a valid uuid';
  end;

  if v_target_user_id = v_actor then
    raise exception 'You cannot moderate your own account';
  end if;

  if public.is_owner_user(v_target_user_id) then
    raise exception 'Owner accounts cannot be moderated from this action';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_target_user_id) then
    raise exception 'Target account not found';
  end if;

  if v_action not in ('ban', 'delete') then
    raise exception 'Unsupported moderation action: %', v_action;
  end if;

  if v_action = 'ban' then
    insert into public.banned_users (user_id, reason, created_at, created_by)
    values (v_target_user_id, v_reason, now(), v_actor)
    on conflict (user_id)
    do update
      set reason = excluded.reason,
          created_at = now(),
          created_by = excluded.created_by;

    if to_regclass('public.app_state') is not null then
      delete from public.app_state where user_id = v_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('app_state', v_deleted);
    end if;

    if to_regclass('public.leaderboard') is not null then
      delete from public.leaderboard where user_id = v_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('leaderboard', v_deleted);
    end if;

    if to_regclass('public.duel_player_stats') is not null then
      delete from public.duel_player_stats where user_id = v_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_player_stats', v_deleted);
    end if;

    if to_regclass('public.game_attempt_history') is not null then
      delete from public.game_attempt_history where user_id = v_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('game_attempt_history', v_deleted);
    end if;

    if to_regclass('public.rooms') is not null then
      delete from public.rooms where host_user_id = v_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('rooms_hosted', v_deleted);
    end if;

    if to_regclass('public.room_players') is not null then
      delete from public.room_players where user_id = v_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('room_players', v_deleted);
    end if;

    if to_regclass('public.room_results') is not null then
      delete from public.room_results where user_id = v_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('room_results', v_deleted);
    end if;

    if to_regclass('public.duel_invites') is not null then
      delete from public.duel_invites where sender_user_id = v_target_user_id or recipient_user_id = v_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_invites', v_deleted);
    end if;

    if to_regclass('public.duel_room_messages') is not null then
      delete from public.duel_room_messages where user_id = v_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_room_messages', v_deleted);
    end if;

    if to_regclass('public.public_messages') is not null then
      delete from public.public_messages where user_id = v_target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('public_messages', v_deleted);
    end if;

    return jsonb_build_object(
      'ok', true,
      'action', 'ban',
      'target_user_id', v_target_user_id,
      'summary', v_summary
    );
  end if;

  if to_regclass('public.app_state') is not null then
    delete from public.app_state where user_id = v_target_user_id;
  end if;
  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard where user_id = v_target_user_id;
  end if;
  if to_regclass('public.duel_player_stats') is not null then
    delete from public.duel_player_stats where user_id = v_target_user_id;
  end if;
  if to_regclass('public.game_attempt_history') is not null then
    delete from public.game_attempt_history where user_id = v_target_user_id;
  end if;
  if to_regclass('public.rooms') is not null then
    delete from public.rooms where host_user_id = v_target_user_id;
  end if;
  if to_regclass('public.room_players') is not null then
    delete from public.room_players where user_id = v_target_user_id;
  end if;
  if to_regclass('public.room_results') is not null then
    delete from public.room_results where user_id = v_target_user_id;
  end if;
  if to_regclass('public.duel_invites') is not null then
    delete from public.duel_invites where sender_user_id = v_target_user_id or recipient_user_id = v_target_user_id;
  end if;
  if to_regclass('public.duel_room_messages') is not null then
    delete from public.duel_room_messages where user_id = v_target_user_id;
  end if;
  if to_regclass('public.public_messages') is not null then
    delete from public.public_messages where user_id = v_target_user_id;
  end if;

  delete from auth.users where id = v_target_user_id;
  if not found then
    raise exception 'Target account not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'delete',
    'target_user_id', v_target_user_id
  );
end;
$$;

create or replace function public.owner_moderate_account_v1(
  action text,
  reason text,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_json(
    jsonb_build_object(
      'action', action,
      'reason', reason,
      'target_user_id', target_user_id::text
    )
  );
end;
$$;

create or replace function public.owner_moderate_account(
  p_action text,
  p_reason text,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_v1(p_action, p_reason, p_target_user_id);
end;
$$;

create or replace function public.owner_manage_account(
  p_target_user_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_v1(p_action, p_reason, p_target_user_id);
end;
$$;

revoke all on function public.owner_moderate_account_json(jsonb) from public;
revoke all on function public.owner_moderate_account_json(jsonb) from anon;
grant execute on function public.owner_moderate_account_json(jsonb) to authenticated;

revoke all on function public.owner_moderate_account_v1(text, text, uuid) from public;
revoke all on function public.owner_moderate_account_v1(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account_v1(text, text, uuid) to authenticated;

revoke all on function public.owner_moderate_account(text, text, uuid) from public;
revoke all on function public.owner_moderate_account(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account(text, text, uuid) to authenticated;

revoke all on function public.owner_manage_account(uuid, text, text) from public;
revoke all on function public.owner_manage_account(uuid, text, text) from anon;
grant execute on function public.owner_manage_account(uuid, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260224_owner_moderation_minimal_last_resort.sql
-- -----------------------------------------------------------------------------

-- LAST RESORT OWNER MODERATION REPAIR
-- This script is intentionally minimal and resilient.
-- It guarantees a callable RPC endpoint for owner moderation:
--   public.owner_moderate_account_rpc(target_user_id uuid, action text, reason text)

create table if not exists public.user_roles (
  user_id uuid primary key,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.banned_users (
  user_id uuid primary key,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid
);

alter table public.user_roles enable row level security;
alter table public.banned_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_roles' and policyname='user_roles_select_own'
  ) then
    create policy user_roles_select_own
    on public.user_roles
    for select
    using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='banned_users' and policyname='banned_users_select_self_or_owner'
  ) then
    create policy banned_users_select_self_or_owner
    on public.banned_users
    for select
    using (
      auth.uid() = user_id
      or exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and lower(r.role) = 'owner'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='banned_users' and policyname='banned_users_write_owner_only'
  ) then
    create policy banned_users_write_owner_only
    on public.banned_users
    for all
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and lower(r.role) = 'owner'
      )
    )
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and lower(r.role) = 'owner'
      )
    );
  end if;
end $$;

grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.banned_users to authenticated;

create or replace function public.owner_moderate_account_rpc(
  target_user_id uuid,
  action text,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(action, '')));
  v_reason text := nullif(trim(coalesce(reason, '')), '');
  v_deleted integer := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.user_roles r
    where r.user_id = v_actor
      and lower(r.role) = 'owner'
  ) then
    raise exception 'Owner role required';
  end if;

  if target_user_id is null then
    raise exception 'Target account is required';
  end if;

  if target_user_id = v_actor then
    raise exception 'You cannot moderate your own account';
  end if;

  if v_action not in ('ban', 'delete') then
    raise exception 'Unsupported moderation action: %', action;
  end if;

  insert into public.banned_users (user_id, reason, created_at, created_by)
  values (target_user_id, v_reason, now(), v_actor)
  on conflict (user_id)
  do update
    set reason = excluded.reason,
        created_at = now(),
        created_by = excluded.created_by;

  if to_regclass('public.app_state') is not null then
    delete from public.app_state where user_id = target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('app_state', v_deleted);
  end if;

  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard where user_id = target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('leaderboard', v_deleted);
  end if;

  if to_regclass('public.duel_player_stats') is not null then
    delete from public.duel_player_stats where user_id = target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_player_stats', v_deleted);
  end if;

  if to_regclass('public.game_attempt_history') is not null then
    delete from public.game_attempt_history where user_id = target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('game_attempt_history', v_deleted);
  end if;

  if to_regclass('public.rooms') is not null then
    delete from public.rooms where host_user_id = target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('rooms_hosted', v_deleted);
  end if;

  if to_regclass('public.room_players') is not null then
    delete from public.room_players where user_id = target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('room_players', v_deleted);
  end if;

  if to_regclass('public.room_results') is not null then
    delete from public.room_results where user_id = target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('room_results', v_deleted);
  end if;

  if to_regclass('public.duel_invites') is not null then
    delete from public.duel_invites where sender_user_id = target_user_id or recipient_user_id = target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_invites', v_deleted);
  end if;

  if to_regclass('public.duel_room_messages') is not null then
    delete from public.duel_room_messages where user_id = target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_room_messages', v_deleted);
  end if;

  if to_regclass('public.public_messages') is not null then
    delete from public.public_messages where user_id = target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('public_messages', v_deleted);
  end if;

  if v_action = 'delete' then
    begin
      delete from auth.users where id = target_user_id;
    exception
      when others then
        -- keep as banned+purged even if auth.users hard delete is unavailable
        null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'target_user_id', target_user_id,
    'summary', v_summary
  );
end;
$$;

create or replace function public.owner_moderate_account_json(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid := (p_payload ->> 'target_user_id')::uuid;
  v_action text := coalesce(p_payload ->> 'action', '');
  v_reason text := p_payload ->> 'reason';
begin
  return public.owner_moderate_account_rpc(v_target, v_action, v_reason);
end;
$$;

create or replace function public.owner_moderate_account_v1(
  action text,
  reason text,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_rpc(target_user_id, action, reason);
end;
$$;

create or replace function public.owner_moderate_account(
  p_action text,
  p_reason text,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_rpc(p_target_user_id, p_action, p_reason);
end;
$$;

create or replace function public.owner_manage_account(
  p_target_user_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_rpc(p_target_user_id, p_action, p_reason);
end;
$$;

revoke all on function public.owner_moderate_account_rpc(uuid, text, text) from public;
revoke all on function public.owner_moderate_account_rpc(uuid, text, text) from anon;
grant execute on function public.owner_moderate_account_rpc(uuid, text, text) to authenticated;

revoke all on function public.owner_moderate_account_json(jsonb) from public;
revoke all on function public.owner_moderate_account_json(jsonb) from anon;
grant execute on function public.owner_moderate_account_json(jsonb) to authenticated;

revoke all on function public.owner_moderate_account_v1(text, text, uuid) from public;
revoke all on function public.owner_moderate_account_v1(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account_v1(text, text, uuid) to authenticated;

revoke all on function public.owner_moderate_account(text, text, uuid) from public;
revoke all on function public.owner_moderate_account(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account(text, text, uuid) to authenticated;

revoke all on function public.owner_manage_account(uuid, text, text) from public;
revoke all on function public.owner_manage_account(uuid, text, text) from anon;
grant execute on function public.owner_manage_account(uuid, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260224_owner_moderation_public_rpc_repair.sql
-- -----------------------------------------------------------------------------

-- PUBLIC RPC REPAIR (owner-gated internally)
-- Purpose:
-- 1) Ensure owner moderation RPC always appears in PostgREST schema cache.
-- 2) Avoid "Could not find the function ... in the schema cache" failures.
--
-- Security model:
-- - Function execute is granted broadly so PostgREST can resolve it for every role.
-- - Function itself enforces owner check before any mutation.

create table if not exists public.user_roles (
  user_id uuid primary key,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.banned_users (
  user_id uuid primary key,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid
);

alter table public.user_roles enable row level security;
alter table public.banned_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_roles' and policyname='user_roles_select_own'
  ) then
    create policy user_roles_select_own
    on public.user_roles
    for select
    using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='banned_users' and policyname='banned_users_select_self_or_owner'
  ) then
    create policy banned_users_select_self_or_owner
    on public.banned_users
    for select
    using (
      auth.uid() = user_id
      or exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and lower(r.role) = 'owner'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='banned_users' and policyname='banned_users_write_owner_only'
  ) then
    create policy banned_users_write_owner_only
    on public.banned_users
    for all
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and lower(r.role) = 'owner'
      )
    )
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and lower(r.role) = 'owner'
      )
    );
  end if;
end $$;

grant select on public.user_roles to anon, authenticated;
grant select, insert, update, delete on public.banned_users to anon, authenticated;

create or replace function public.owner_moderate_account_json(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_target_user_id uuid := (p_payload ->> 'target_user_id')::uuid;
  v_action text := lower(trim(coalesce(p_payload ->> 'action', '')));
  v_reason text := nullif(trim(coalesce(p_payload ->> 'reason', '')), '');
  v_deleted integer := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.user_roles r
    where r.user_id = v_actor
      and lower(r.role) = 'owner'
  ) then
    raise exception 'Owner role required';
  end if;

  if v_target_user_id is null then
    raise exception 'Target account is required';
  end if;

  if v_target_user_id = v_actor then
    raise exception 'You cannot moderate your own account';
  end if;

  if v_action not in ('ban', 'delete') then
    raise exception 'Unsupported moderation action: %', v_action;
  end if;

  insert into public.banned_users (user_id, reason, created_at, created_by)
  values (v_target_user_id, v_reason, now(), v_actor)
  on conflict (user_id)
  do update
    set reason = excluded.reason,
        created_at = now(),
        created_by = excluded.created_by;

  if to_regclass('public.app_state') is not null then
    delete from public.app_state where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('app_state', v_deleted);
  end if;

  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('leaderboard', v_deleted);
  end if;

  if to_regclass('public.duel_player_stats') is not null then
    delete from public.duel_player_stats where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_player_stats', v_deleted);
  end if;

  if to_regclass('public.game_attempt_history') is not null then
    delete from public.game_attempt_history where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('game_attempt_history', v_deleted);
  end if;

  if to_regclass('public.rooms') is not null then
    delete from public.rooms where host_user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('rooms_hosted', v_deleted);
  end if;

  if to_regclass('public.room_players') is not null then
    delete from public.room_players where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('room_players', v_deleted);
  end if;

  if to_regclass('public.room_results') is not null then
    delete from public.room_results where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('room_results', v_deleted);
  end if;

  if to_regclass('public.duel_invites') is not null then
    delete from public.duel_invites where sender_user_id = v_target_user_id or recipient_user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_invites', v_deleted);
  end if;

  if to_regclass('public.duel_room_messages') is not null then
    delete from public.duel_room_messages where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('duel_room_messages', v_deleted);
  end if;

  if to_regclass('public.public_messages') is not null then
    delete from public.public_messages where user_id = v_target_user_id;
    get diagnostics v_deleted = row_count;
    v_summary := v_summary || jsonb_build_object('public_messages', v_deleted);
  end if;

  if v_action = 'delete' then
    begin
      delete from auth.users where id = v_target_user_id;
    exception
      when others then
        null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'target_user_id', v_target_user_id,
    'summary', v_summary
  );
end;
$$;

create or replace function public.owner_moderate_account_rpc(
  target_user_id uuid,
  action text,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_json(
    jsonb_build_object(
      'target_user_id', target_user_id::text,
      'action', action,
      'reason', reason
    )
  );
end;
$$;

create or replace function public.owner_moderate_account_v1(
  action text,
  reason text,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_rpc(target_user_id, action, reason);
end;
$$;

create or replace function public.owner_moderate_account(
  p_action text,
  p_reason text,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_rpc(p_target_user_id, p_action, p_reason);
end;
$$;

create or replace function public.owner_manage_account(
  p_target_user_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_rpc(p_target_user_id, p_action, p_reason);
end;
$$;

grant execute on function public.owner_moderate_account_json(jsonb) to public, anon, authenticated;
grant execute on function public.owner_moderate_account_rpc(uuid, text, text) to public, anon, authenticated;
grant execute on function public.owner_moderate_account_v1(text, text, uuid) to public, anon, authenticated;
grant execute on function public.owner_moderate_account(text, text, uuid) to public, anon, authenticated;
grant execute on function public.owner_manage_account(uuid, text, text) to public, anon, authenticated;

select pg_notify('pgrst', 'reload schema');


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260224_owner_moderation_rpc_v2.sql
-- -----------------------------------------------------------------------------

-- Owner moderation v2
-- Adds a uniquely named RPC to avoid any legacy overload/schema-cache conflicts.
-- RPC name used by app: public.owner_moderate_account_rpc(target_user_id uuid, action text, reason text)

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.banned_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.user_roles enable row level security;
alter table public.banned_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_roles' and policyname='user_roles_select_own'
  ) then
    create policy user_roles_select_own
    on public.user_roles
    for select
    using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_roles' and policyname='user_roles_read_owner_only'
  ) then
    create policy user_roles_read_owner_only
    on public.user_roles
    for select
    using (role = 'owner');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='banned_users' and policyname='banned_users_select_self_or_owner'
  ) then
    create policy banned_users_select_self_or_owner
    on public.banned_users
    for select
    using (
      auth.uid() = user_id
      or exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='banned_users' and policyname='banned_users_insert_owner_only'
  ) then
    create policy banned_users_insert_owner_only
    on public.banned_users
    for insert
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='banned_users' and policyname='banned_users_update_owner_only'
  ) then
    create policy banned_users_update_owner_only
    on public.banned_users
    for update
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    )
    with check (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='banned_users' and policyname='banned_users_delete_owner_only'
  ) then
    create policy banned_users_delete_owner_only
    on public.banned_users
    for delete
    using (
      exists (
        select 1
        from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'owner'
      )
    );
  end if;
end $$;

grant select on public.banned_users to authenticated;
grant insert, update, delete on public.banned_users to authenticated;

create or replace function public.is_owner_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = p_user_id
      and r.role = 'owner'
  );
$$;

create or replace function public.owner_moderate_account_rpc(
  target_user_id uuid,
  action text,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(action, '')));
  v_reason text := nullif(trim(coalesce(reason, '')), '');
  v_deleted integer := 0;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_owner_user(v_actor) then
    raise exception 'Owner role required';
  end if;

  if target_user_id is null then
    raise exception 'Target account is required';
  end if;

  if target_user_id = v_actor then
    raise exception 'You cannot moderate your own account';
  end if;

  if public.is_owner_user(target_user_id) then
    raise exception 'Owner accounts cannot be moderated from this action';
  end if;

  if not exists (select 1 from auth.users u where u.id = target_user_id) then
    raise exception 'Target account not found';
  end if;

  if v_action not in ('ban', 'delete') then
    raise exception 'Unsupported moderation action: %', action;
  end if;

  if v_action = 'ban' then
    insert into public.banned_users (user_id, reason, created_at, created_by)
    values (target_user_id, v_reason, now(), v_actor)
    on conflict (user_id)
    do update
      set reason = excluded.reason,
          created_at = now(),
          created_by = excluded.created_by;

    if to_regclass('public.app_state') is not null then
      delete from public.app_state where user_id = target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('app_state', v_deleted);
    end if;
    if to_regclass('public.leaderboard') is not null then
      delete from public.leaderboard where user_id = target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('leaderboard', v_deleted);
    end if;
    if to_regclass('public.duel_player_stats') is not null then
      delete from public.duel_player_stats where user_id = target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_player_stats', v_deleted);
    end if;
    if to_regclass('public.game_attempt_history') is not null then
      delete from public.game_attempt_history where user_id = target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('game_attempt_history', v_deleted);
    end if;
    if to_regclass('public.rooms') is not null then
      delete from public.rooms where host_user_id = target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('rooms_hosted', v_deleted);
    end if;
    if to_regclass('public.room_players') is not null then
      delete from public.room_players where user_id = target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('room_players', v_deleted);
    end if;
    if to_regclass('public.room_results') is not null then
      delete from public.room_results where user_id = target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('room_results', v_deleted);
    end if;
    if to_regclass('public.duel_invites') is not null then
      delete from public.duel_invites where sender_user_id = target_user_id or recipient_user_id = target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_invites', v_deleted);
    end if;
    if to_regclass('public.duel_room_messages') is not null then
      delete from public.duel_room_messages where user_id = target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('duel_room_messages', v_deleted);
    end if;
    if to_regclass('public.public_messages') is not null then
      delete from public.public_messages where user_id = target_user_id;
      get diagnostics v_deleted = row_count;
      v_summary := v_summary || jsonb_build_object('public_messages', v_deleted);
    end if;

    return jsonb_build_object(
      'ok', true,
      'action', 'ban',
      'target_user_id', target_user_id,
      'summary', v_summary
    );
  end if;

  if to_regclass('public.app_state') is not null then
    delete from public.app_state where user_id = target_user_id;
  end if;
  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard where user_id = target_user_id;
  end if;
  if to_regclass('public.duel_player_stats') is not null then
    delete from public.duel_player_stats where user_id = target_user_id;
  end if;
  if to_regclass('public.game_attempt_history') is not null then
    delete from public.game_attempt_history where user_id = target_user_id;
  end if;
  if to_regclass('public.rooms') is not null then
    delete from public.rooms where host_user_id = target_user_id;
  end if;
  if to_regclass('public.room_players') is not null then
    delete from public.room_players where user_id = target_user_id;
  end if;
  if to_regclass('public.room_results') is not null then
    delete from public.room_results where user_id = target_user_id;
  end if;
  if to_regclass('public.duel_invites') is not null then
    delete from public.duel_invites where sender_user_id = target_user_id or recipient_user_id = target_user_id;
  end if;
  if to_regclass('public.duel_room_messages') is not null then
    delete from public.duel_room_messages where user_id = target_user_id;
  end if;
  if to_regclass('public.public_messages') is not null then
    delete from public.public_messages where user_id = target_user_id;
  end if;

  delete from auth.users where id = target_user_id;
  if not found then
    raise exception 'Target account not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'delete',
    'target_user_id', target_user_id
  );
end;
$$;

-- Compatibility wrappers used by older builds.
create or replace function public.owner_moderate_account_json(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
  v_action text := lower(trim(coalesce(p_payload ->> 'action', '')));
  v_reason text := nullif(trim(coalesce(p_payload ->> 'reason', '')), '');
begin
  if p_payload is null then
    raise exception 'Payload is required';
  end if;
  v_target := (p_payload ->> 'target_user_id')::uuid;
  return public.owner_moderate_account_rpc(v_target, v_action, v_reason);
end;
$$;

create or replace function public.owner_moderate_account_v1(
  action text,
  reason text,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_rpc(target_user_id, action, reason);
end;
$$;

create or replace function public.owner_moderate_account(
  p_action text,
  p_reason text,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_rpc(p_target_user_id, p_action, p_reason);
end;
$$;

create or replace function public.owner_manage_account(
  p_target_user_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.owner_moderate_account_rpc(p_target_user_id, p_action, p_reason);
end;
$$;

revoke all on function public.owner_moderate_account_rpc(uuid, text, text) from public;
revoke all on function public.owner_moderate_account_rpc(uuid, text, text) from anon;
grant execute on function public.owner_moderate_account_rpc(uuid, text, text) to authenticated;

revoke all on function public.owner_moderate_account_json(jsonb) from public;
revoke all on function public.owner_moderate_account_json(jsonb) from anon;
grant execute on function public.owner_moderate_account_json(jsonb) to authenticated;

revoke all on function public.owner_moderate_account_v1(text, text, uuid) from public;
revoke all on function public.owner_moderate_account_v1(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account_v1(text, text, uuid) to authenticated;

revoke all on function public.owner_moderate_account(text, text, uuid) from public;
revoke all on function public.owner_moderate_account(text, text, uuid) from anon;
grant execute on function public.owner_moderate_account(text, text, uuid) to authenticated;

revoke all on function public.owner_manage_account(uuid, text, text) from public;
revoke all on function public.owner_manage_account(uuid, text, text) from anon;
grant execute on function public.owner_manage_account(uuid, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260225_public_chat_reactions.sql
-- -----------------------------------------------------------------------------

-- Shared emoji reactions for public chat messages
-- Run in Supabase SQL editor (or via migrations) before deploying client changes.

create table if not exists public.public_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.public_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(trim(emoji)) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists idx_public_message_reactions_message_id
  on public.public_message_reactions (message_id);

create index if not exists idx_public_message_reactions_created_at
  on public.public_message_reactions (created_at desc);

alter table public.public_message_reactions enable row level security;

drop policy if exists public_message_reactions_select_all on public.public_message_reactions;
create policy public_message_reactions_select_all
  on public.public_message_reactions
  for select
  using (true);

drop policy if exists public_message_reactions_insert_own on public.public_message_reactions;
create policy public_message_reactions_insert_own
  on public.public_message_reactions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists public_message_reactions_delete_own on public.public_message_reactions;
create policy public_message_reactions_delete_own
  on public.public_message_reactions
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.public_message_reactions to anon, authenticated;
grant insert, delete on public.public_message_reactions to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.public_message_reactions;
exception
  when duplicate_object then null;
end;
$$;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260225_repair_abel_matching_30_penal.sql
-- -----------------------------------------------------------------------------

-- One-time hard repair for the known bad row:
-- Matching + 30s + penal with erroneous score 1720.
-- Finds the same user's best prior attempt in game_attempt_history and restores it.
-- If no prior attempt exists, deletes the bad leaderboard row.

with bad_row as (
  select l.id, l.user_id, l.score, l.created_at
  from public.leaderboard l
  where l.game = 'Matching'
    and l.match_duration = 30
    and l.match_filter = 'penal'
    and l.score = 1720
  order by l.created_at desc
  limit 1
),
prior_attempt as (
  select
    a.user_id,
    a.score,
    greatest(1, coalesce(nullif(a.correct, 0), floor(a.score / 10)))::int as round,
    a.created_at
  from public.game_attempt_history a
  join bad_row b on b.user_id = a.user_id
  where a.mode = 'matching'
    and a.duration = 30
    and a.filter = 'penal'
    and a.score < b.score
    and a.created_at < b.created_at
  order by a.score desc, a.created_at desc
  limit 1
),
updated as (
  update public.leaderboard l
  set
    score = p.score,
    round = p.round,
    created_at = least(l.created_at, p.created_at)
  from bad_row b
  join prior_attempt p on true
  where l.id = b.id
  returning l.id
)
delete from public.leaderboard l
using bad_row b
where l.id = b.id
  and not exists (select 1 from updated);


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260225_repair_abel_matching_30_penal_1625.sql
-- -----------------------------------------------------------------------------

-- One-time repair: remove bad Abel score (1625) from Matching 30s Penal leaderboard.
-- Behavior:
-- 1) Prefer the row owned by user "abel" (if public.profiles exists).
-- 2) If not resolvable, fallback to latest matching row with score=1625 for this mode.
-- 3) Restore prior attempt from game_attempt_history when available; otherwise delete row.

do $$
declare
  v_target_id uuid;
  v_target_user_id uuid;
begin
  if to_regclass('public.leaderboard') is null then
    raise exception 'public.leaderboard table not found';
  end if;

  -- Preferred lookup: Abel by username (if profiles table exists).
  if to_regclass('public.profiles') is not null then
    select l.id, l.user_id
    into v_target_id, v_target_user_id
    from public.leaderboard l
    join public.profiles p on p.user_id = l.user_id
    where l.game = 'Matching'
      and l.match_duration = 30
      and l.match_filter = 'penal'
      and l.score = 1625
      and lower(coalesce(p.username, '')) = 'abel'
    order by l.created_at desc
    limit 1;
  end if;

  -- Fallback lookup if profile table missing / username row not found.
  if v_target_id is null then
    select l.id, l.user_id
    into v_target_id, v_target_user_id
    from public.leaderboard l
    where l.game = 'Matching'
      and l.match_duration = 30
      and l.match_filter = 'penal'
      and l.score = 1625
    order by l.created_at desc
    limit 1;
  end if;

  if v_target_id is null then
    raise notice 'No Matching 30s Penal row with score 1625 found. No changes made.';
    return;
  end if;

  if to_regclass('public.game_attempt_history') is not null then
    with target_row as (
      select l.id, l.user_id, l.score, l.created_at
      from public.leaderboard l
      where l.id = v_target_id
      limit 1
    ),
    prior_attempt as (
      select
        a.user_id,
        a.score,
        greatest(1, coalesce(nullif(a.correct, 0), floor(a.score / 10)))::int as round,
        a.created_at
      from public.game_attempt_history a
      join target_row t on t.user_id = a.user_id
      where a.mode = 'matching'
        and a.duration = 30
        and a.filter = 'penal'
        and a.score < t.score
        and a.created_at < t.created_at
      order by a.score desc, a.created_at desc
      limit 1
    ),
    restored as (
      update public.leaderboard l
      set
        score = p.score,
        round = p.round,
        created_at = least(l.created_at, p.created_at)
      from prior_attempt p
      where l.id = v_target_id
      returning l.id
    )
    delete from public.leaderboard l
    where l.id = v_target_id
      and not exists (select 1 from restored);
  else
    -- If game_attempt_history does not exist, just remove the bad row.
    delete from public.leaderboard where id = v_target_id;
  end if;

  raise notice 'Repair complete for leaderboard row % (user %).', v_target_id, v_target_user_id;
end $$;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260226_app_settings_global_banner.sql
-- -----------------------------------------------------------------------------

-- Owner-managed global banner fields for cross-site announcements

alter table public.app_settings
  add column if not exists banner_enabled boolean not null default false,
  add column if not exists banner_level text not null default 'notice',
  add column if not exists banner_message text not null default '',
  add column if not exists banner_scroll boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_settings_banner_level_check'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_banner_level_check
      check (banner_level in ('courteous', 'notice', 'urgent'));
  end if;
end $$;

update public.app_settings
set
  banner_enabled = coalesce(banner_enabled, false),
  banner_level = case
    when banner_level in ('courteous', 'notice', 'urgent') then banner_level
    else 'notice'
  end,
  banner_message = coalesce(banner_message, ''),
  banner_scroll = coalesce(banner_scroll, false)
where true;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260226_app_settings_global_banner_scroll_controls.sql
-- -----------------------------------------------------------------------------

-- Owner-managed banner scroll controls (speed + repeat count)

alter table public.app_settings
  add column if not exists banner_scroll_speed integer not null default 20,
  add column if not exists banner_scroll_repeat integer not null default 2;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_settings_banner_scroll_speed_check'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_banner_scroll_speed_check
      check (banner_scroll_speed between 6 and 60);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_settings_banner_scroll_repeat_check'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_banner_scroll_repeat_check
      check (banner_scroll_repeat between 1 and 8);
  end if;
end $$;

update public.app_settings
set
  banner_scroll_speed = least(60, greatest(6, coalesce(banner_scroll_speed, 20))),
  banner_scroll_repeat = least(8, greatest(1, coalesce(banner_scroll_repeat, 2)))
where true;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260226_app_state_clobber_guard.sql
-- -----------------------------------------------------------------------------

-- Guard against accidental app_state clobbering where non-empty progress
-- gets overwritten by default/empty client state.

create or replace function public.guard_app_state_progress_clobber()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_perf_count integer := coalesce(jsonb_object_length(coalesce(old.performance, '{}'::jsonb)), 0);
  new_perf_count integer := coalesce(jsonb_object_length(coalesce(new.performance, '{}'::jsonb)), 0);
  old_best_streak integer := coalesce(old.best_streak, 0);
  new_best_streak integer := coalesce(new.best_streak, 0);
  old_stats jsonb := coalesce(old.profile_details -> 'stats', '{}'::jsonb);
  new_stats jsonb := coalesce(new.profile_details -> 'stats', '{}'::jsonb);
  old_study_seconds integer := coalesce((old_stats ->> 'studySeconds')::integer, 0);
  new_study_seconds integer := coalesce((new_stats ->> 'studySeconds')::integer, 0);
  old_study_day_streak integer := coalesce((old_stats ->> 'studyDayStreak')::integer, 0);
  new_study_day_streak integer := coalesce((new_stats ->> 'studyDayStreak')::integer, 0);
  old_flashcards integer := coalesce((old_stats ->> 'flashcardsReviewed')::integer, 0);
  new_flashcards integer := coalesce((new_stats ->> 'flashcardsReviewed')::integer, 0);
  old_scenarios integer := coalesce((old_stats ->> 'scenariosReviewed')::integer, 0);
  new_scenarios integer := coalesce((new_stats ->> 'scenariosReviewed')::integer, 0);
begin
  if old_perf_count > 0 and new_perf_count = 0 then
    new.performance := old.performance;
  end if;

  if old_best_streak > 0 and new_best_streak = 0 then
    new.best_streak := old.best_streak;
  end if;

  if (
    (old_study_seconds > 0 and new_study_seconds = 0) or
    (old_study_day_streak > 0 and new_study_day_streak = 0) or
    (old_flashcards > 0 and new_flashcards = 0) or
    (old_scenarios > 0 and new_scenarios = 0)
  ) then
    new.profile_details := jsonb_set(
      coalesce(new.profile_details, '{}'::jsonb),
      '{stats}',
      old_stats,
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_app_state_progress_clobber on public.app_state;
create trigger trg_guard_app_state_progress_clobber
before update on public.app_state
for each row
execute function public.guard_app_state_progress_clobber();


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260226_leaderboard_only_reset.sql
-- -----------------------------------------------------------------------------

-- Global leaderboard reset that preserves user progress and per-user stats.
-- Use this instead of any progress-reset SQL when you only want rankings cleared.

create or replace function public.reset_global_leaderboard_only()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_leaderboard integer := 0;
  v_is_owner boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if to_regclass('public.user_roles') is not null then
    select exists (
      select 1
      from public.user_roles
      where user_id = auth.uid()
        and role = 'owner'
    )
    into v_is_owner;
  end if;

  if not v_is_owner then
    raise exception 'Only owner can reset global leaderboard.';
  end if;

  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard
    where true;
    get diagnostics v_deleted_leaderboard = row_count;
  end if;

  return jsonb_build_object(
    'leaderboard_rows_deleted', v_deleted_leaderboard,
    'app_state_preserved', true,
    'duel_player_stats_preserved', true,
    'game_attempt_history_preserved', true
  );
end;
$$;

revoke all on function public.reset_global_leaderboard_only() from public;
revoke all on function public.reset_global_leaderboard_only() from anon;
grant execute on function public.reset_global_leaderboard_only() to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260226_leaderboard_only_reset_include_high_scores.sql
-- -----------------------------------------------------------------------------

-- Update leaderboard-only reset:
-- - clear global leaderboard rows
-- - clear per-user app_state.high_scores
-- - preserve user study progress/stats (performance + profile_details + best_streak)

create or replace function public.reset_global_leaderboard_only()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_leaderboard integer := 0;
  v_reset_high_scores integer := 0;
  v_is_owner boolean := false;
  v_uid uuid := auth.uid();
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_sql_editor boolean := current_user in ('postgres', 'supabase_admin');
  v_is_service_role boolean := v_jwt_role = 'service_role';
begin
  if not v_is_sql_editor and not v_is_service_role then
    if v_uid is null then
      raise exception 'Not authenticated';
    end if;

    if to_regclass('public.user_roles') is not null then
      select exists (
        select 1
        from public.user_roles
        where user_id = v_uid
          and role = 'owner'
      )
      into v_is_owner;
    end if;

    if not v_is_owner then
      raise exception 'Only owner can reset global leaderboard.';
    end if;
  end if;

  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard
    where true;
    get diagnostics v_deleted_leaderboard = row_count;
  end if;

  if to_regclass('public.app_state') is not null then
    update public.app_state a
    set high_scores = (
      select coalesce(
        jsonb_object_agg(score_key, to_jsonb(0)),
        '{}'::jsonb
      )
      from jsonb_each(coalesce(a.high_scores, '{}'::jsonb)) as scores(score_key, score_value)
    ),
    updated_at = now();
    get diagnostics v_reset_high_scores = row_count;
  end if;

  return jsonb_build_object(
    'leaderboard_rows_deleted', v_deleted_leaderboard,
    'users_high_scores_reset', v_reset_high_scores,
    'performance_preserved', true,
    'profile_details_preserved', true,
    'best_streak_preserved', true,
    'duel_player_stats_preserved', true,
    'game_attempt_history_preserved', true
  );
end;
$$;

revoke all on function public.reset_global_leaderboard_only() from public;
revoke all on function public.reset_global_leaderboard_only() from anon;
grant execute on function public.reset_global_leaderboard_only() to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260226_leaderboard_only_reset_sql_editor_fix.sql
-- -----------------------------------------------------------------------------

-- Hotfix: allow running leaderboard-only reset from Supabase SQL editor
-- while still enforcing owner checks for app-authenticated users.

create or replace function public.reset_global_leaderboard_only()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_leaderboard integer := 0;
  v_is_owner boolean := false;
  v_uid uuid := auth.uid();
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_sql_editor boolean := current_user in ('postgres', 'supabase_admin');
  v_is_service_role boolean := v_jwt_role = 'service_role';
begin
  -- SQL editor (postgres) and service-role callers are allowed directly.
  -- Normal authenticated users must be owner.
  if not v_is_sql_editor and not v_is_service_role then
    if v_uid is null then
      raise exception 'Not authenticated';
    end if;

    if to_regclass('public.user_roles') is not null then
      select exists (
        select 1
        from public.user_roles
        where user_id = v_uid
          and role = 'owner'
      )
      into v_is_owner;
    end if;

    if not v_is_owner then
      raise exception 'Only owner can reset global leaderboard.';
    end if;
  end if;

  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard
    where true;
    get diagnostics v_deleted_leaderboard = row_count;
  end if;

  return jsonb_build_object(
    'leaderboard_rows_deleted', v_deleted_leaderboard,
    'app_state_preserved', true,
    'duel_player_stats_preserved', true,
    'game_attempt_history_preserved', true
  );
end;
$$;

revoke all on function public.reset_global_leaderboard_only() from public;
revoke all on function public.reset_global_leaderboard_only() from anon;
grant execute on function public.reset_global_leaderboard_only() to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260226_public_chat_reaction_visibility_fix.sql
-- -----------------------------------------------------------------------------

-- Public chat reaction visibility hardening
-- Ensures every signed-in user can see all reactions in realtime.

create table if not exists public.public_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.public_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(trim(emoji)) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists idx_public_message_reactions_message_id
  on public.public_message_reactions (message_id);

create index if not exists idx_public_message_reactions_created_at
  on public.public_message_reactions (created_at desc);

alter table public.public_message_reactions enable row level security;
alter table public.public_message_reactions replica identity full;

drop policy if exists public_message_reactions_select_all on public.public_message_reactions;
create policy public_message_reactions_select_all
  on public.public_message_reactions
  for select
  to anon, authenticated
  using (true);

drop policy if exists public_message_reactions_insert_own on public.public_message_reactions;
create policy public_message_reactions_insert_own
  on public.public_message_reactions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists public_message_reactions_delete_own on public.public_message_reactions;
create policy public_message_reactions_delete_own
  on public.public_message_reactions
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.public_message_reactions to anon, authenticated;
grant insert, delete on public.public_message_reactions to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.public_message_reactions;
exception
  when duplicate_object then null;
end;
$$;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260227_bug_reports.sql
-- -----------------------------------------------------------------------------

-- Bug reporting inbox
-- - Any authenticated user can submit a bug report
-- - Users can read their own reports
-- - Owners can read/update/delete every report

create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reporter_name text not null default 'User',
  reporter_email text,
  page_path text not null default '/home',
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'urgent')),
  summary text not null,
  details text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  owner_note text,
  user_agent text,
  viewport text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bug_reports_reporter on public.bug_reports (reporter_user_id, created_at desc);
create index if not exists idx_bug_reports_status_created on public.bug_reports (status, created_at desc);
create index if not exists idx_bug_reports_severity_created on public.bug_reports (severity, created_at desc);

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bug_reports_updated_at on public.bug_reports;
create trigger trg_bug_reports_updated_at
before update on public.bug_reports
for each row
execute function public.set_timestamp_updated_at();

alter table public.bug_reports enable row level security;

drop policy if exists bug_reports_select_own_or_owner on public.bug_reports;
create policy bug_reports_select_own_or_owner
on public.bug_reports
for select
to authenticated
using (
  reporter_user_id = auth.uid()
  or exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
);

drop policy if exists bug_reports_insert_own on public.bug_reports;
create policy bug_reports_insert_own
on public.bug_reports
for insert
to authenticated
with check (reporter_user_id = auth.uid());

drop policy if exists bug_reports_update_owner_only on public.bug_reports;
create policy bug_reports_update_owner_only
on public.bug_reports
for update
to authenticated
using (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
);

drop policy if exists bug_reports_delete_owner_only on public.bug_reports;
create policy bug_reports_delete_owner_only
on public.bug_reports
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'owner'
  )
);

grant select, insert on public.bug_reports to authenticated;
grant update, delete on public.bug_reports to authenticated;
revoke all on public.bug_reports from anon;

-- Realtime support for owner inbox and user status updates
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.bug_reports;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END
$$;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260305_weekly_leaderboard.sql
-- -----------------------------------------------------------------------------

create table if not exists public.weekly_leaderboard (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null check (game in ('Matching', 'Speed Test')),
  week_start timestamptz not null,
  match_duration int4 not null,
  match_filter text not null check (match_filter in ('all', 'penal', 'hs', 'vehicle')),
  score integer not null default 0,
  round integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists weekly_leaderboard_user_game_week_mode_key
  on public.weekly_leaderboard (user_id, game, week_start, match_duration, match_filter);

create index if not exists weekly_leaderboard_week_mode_rank_idx
  on public.weekly_leaderboard (week_start desc, game, match_duration, match_filter, score desc, round desc, updated_at desc);

alter table public.weekly_leaderboard enable row level security;

drop policy if exists weekly_leaderboard_select_all on public.weekly_leaderboard;
create policy weekly_leaderboard_select_all
on public.weekly_leaderboard
for select
using (true);

drop policy if exists weekly_leaderboard_insert_self on public.weekly_leaderboard;
create policy weekly_leaderboard_insert_self
on public.weekly_leaderboard
for insert
with check (auth.uid() = user_id);

drop policy if exists weekly_leaderboard_update_self on public.weekly_leaderboard;
create policy weekly_leaderboard_update_self
on public.weekly_leaderboard
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.weekly_leaderboard to authenticated;

create or replace function public.upsert_weekly_leaderboard(
  p_user_id uuid,
  p_game text,
  p_week_start timestamptz,
  p_match_duration int,
  p_match_filter text,
  p_score int,
  p_round int,
  p_attempted_at timestamptz default now()
)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.weekly_leaderboard (
    user_id,
    game,
    week_start,
    match_duration,
    match_filter,
    score,
    round,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_game,
    p_week_start,
    p_match_duration,
    p_match_filter,
    greatest(0, coalesce(p_score, 0)),
    greatest(0, coalesce(p_round, 0)),
    coalesce(p_attempted_at, now()),
    coalesce(p_attempted_at, now())
  )
  on conflict (user_id, game, week_start, match_duration, match_filter)
  do update set
    score = greatest(public.weekly_leaderboard.score, excluded.score),
    round = case
      when excluded.score > public.weekly_leaderboard.score then excluded.round
      when excluded.score = public.weekly_leaderboard.score then greatest(public.weekly_leaderboard.round, excluded.round)
      else public.weekly_leaderboard.round
    end,
    updated_at = greatest(public.weekly_leaderboard.updated_at, excluded.updated_at);
end;
$$;

revoke all on function public.upsert_weekly_leaderboard(uuid, text, timestamptz, int, text, int, int, timestamptz) from public;
revoke all on function public.upsert_weekly_leaderboard(uuid, text, timestamptz, int, text, int, int, timestamptz) from anon;
grant execute on function public.upsert_weekly_leaderboard(uuid, text, timestamptz, int, text, int, int, timestamptz) to authenticated;

with weekly_candidates as (
  select
    gah.user_id,
    case
      when gah.mode = 'matching' then 'Matching'
      when gah.mode = 'speed' then 'Speed Test'
      else null
    end as game,
    (date_trunc('week', gah.created_at at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles') as week_start,
    coalesce(gah.duration, 0) as match_duration,
    gah.filter as match_filter,
    greatest(0, coalesce(gah.score, 0)) as score,
    greatest(0, coalesce(gah.correct, 0) + coalesce(gah.incorrect, 0)) as round,
    gah.created_at
  from public.game_attempt_history gah
  where gah.mode in ('matching', 'speed')
    and gah.filter in ('all', 'penal', 'hs', 'vehicle')
    and gah.duration is not null
),
ranked as (
  select
    weekly_candidates.*,
    row_number() over (
      partition by user_id, game, week_start, match_duration, match_filter
      order by score desc, round desc, created_at desc
    ) as row_num
  from weekly_candidates
  where game is not null
)
insert into public.weekly_leaderboard (
  user_id,
  game,
  week_start,
  match_duration,
  match_filter,
  score,
  round,
  created_at,
  updated_at
)
select
  ranked.user_id,
  ranked.game,
  ranked.week_start,
  ranked.match_duration,
  ranked.match_filter,
  ranked.score,
  ranked.round,
  ranked.created_at,
  ranked.created_at
from ranked
where ranked.row_num = 1
on conflict (user_id, game, week_start, match_duration, match_filter)
do update set
  score = greatest(public.weekly_leaderboard.score, excluded.score),
  round = case
    when excluded.score > public.weekly_leaderboard.score then excluded.round
    when excluded.score = public.weekly_leaderboard.score then greatest(public.weekly_leaderboard.round, excluded.round)
    else public.weekly_leaderboard.round
  end,
  updated_at = greatest(public.weekly_leaderboard.updated_at, excluded.updated_at);

create or replace function public.reset_global_leaderboard_only()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_leaderboard integer := 0;
  v_deleted_weekly_leaderboard integer := 0;
  v_reset_high_scores integer := 0;
  v_is_owner boolean := false;
  v_uid uuid := auth.uid();
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_sql_editor boolean := current_user in ('postgres', 'supabase_admin');
  v_is_service_role boolean := v_jwt_role = 'service_role';
begin
  if not v_is_sql_editor and not v_is_service_role then
    if v_uid is null then
      raise exception 'Not authenticated';
    end if;

    if to_regclass('public.user_roles') is not null then
      select exists (
        select 1
        from public.user_roles
        where user_id = v_uid
          and role = 'owner'
      )
      into v_is_owner;
    end if;

    if not v_is_owner then
      raise exception 'Only owner can reset global leaderboard.';
    end if;
  end if;

  if to_regclass('public.leaderboard') is not null then
    delete from public.leaderboard
    where true;
    get diagnostics v_deleted_leaderboard = row_count;
  end if;

  if to_regclass('public.weekly_leaderboard') is not null then
    delete from public.weekly_leaderboard
    where true;
    get diagnostics v_deleted_weekly_leaderboard = row_count;
  end if;

  if to_regclass('public.app_state') is not null then
    update public.app_state a
    set high_scores = (
      select coalesce(
        jsonb_object_agg(score_key, to_jsonb(0)),
        '{}'::jsonb
      )
      from jsonb_each(coalesce(a.high_scores, '{}'::jsonb)) as scores(score_key, score_value)
    ),
    updated_at = now();
    get diagnostics v_reset_high_scores = row_count;
  end if;

  return jsonb_build_object(
    'leaderboard_rows_deleted', v_deleted_leaderboard,
    'weekly_leaderboard_rows_deleted', v_deleted_weekly_leaderboard,
    'users_high_scores_reset', v_reset_high_scores,
    'performance_preserved', true,
    'profile_details_preserved', true,
    'best_streak_preserved', true,
    'duel_player_stats_preserved', true,
    'game_attempt_history_preserved', true
  );
end;
$$;

revoke all on function public.reset_global_leaderboard_only() from public;
revoke all on function public.reset_global_leaderboard_only() from anon;
grant execute on function public.reset_global_leaderboard_only() to authenticated;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260318_content_items_tmas_metadata.sql
-- -----------------------------------------------------------------------------

alter table public.content_items
  add column if not exists tmas_set text not null default 'tmas1'
    check (tmas_set in ('tmas1', 'tmas2')),
  add column if not exists scenario_sub_questions jsonb not null default '[]'::jsonb;

update public.content_items
set tmas_set = 'tmas1'
where type = 'scenario'
  and (tmas_set is null or btrim(tmas_set) = '');

drop index if exists public.uq_content_items_scenario_text;

create unique index if not exists uq_content_items_scenario_text
  on public.content_items (lower(category), lower(scenario), lower(tmas_set))
  where type = 'scenario' and scenario is not null;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260505_code_blaster_leaderboard_support.sql
-- -----------------------------------------------------------------------------

-- Let Code Blaster use the same attempt history and weekly leaderboard pipes
-- as Matching and Speed Test. Safe to re-run.

do $$
declare
  v_constraint_name text;
begin
  if to_regclass('public.game_attempt_history') is not null then
    select c.conname
    into v_constraint_name
    from pg_constraint c
    where c.conrelid = 'public.game_attempt_history'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%mode%'
      and pg_get_constraintdef(c.oid) like '%study_test%'
      and pg_get_constraintdef(c.oid) like '%matching%'
      and pg_get_constraintdef(c.oid) like '%speed%'
    limit 1;

    if v_constraint_name is not null then
      execute format('alter table public.game_attempt_history drop constraint %I', v_constraint_name);
    end if;

    alter table public.game_attempt_history
      add constraint game_attempt_history_mode_check
      check (mode in ('study_test', 'matching', 'speed', 'blaster'));
  end if;

  if to_regclass('public.weekly_leaderboard') is not null then
    select c.conname
    into v_constraint_name
    from pg_constraint c
    where c.conrelid = 'public.weekly_leaderboard'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%game%'
      and pg_get_constraintdef(c.oid) like '%Matching%'
      and pg_get_constraintdef(c.oid) like '%Speed Test%'
    limit 1;

    if v_constraint_name is not null then
      execute format('alter table public.weekly_leaderboard drop constraint %I', v_constraint_name);
    end if;

    alter table public.weekly_leaderboard
      add constraint weekly_leaderboard_game_check
      check (game in ('Matching', 'Speed Test', 'Code Blaster'));
  end if;
end $$;

with weekly_candidates as (
  select
    gah.user_id,
    case
      when gah.mode = 'matching' then 'Matching'
      when gah.mode = 'speed' then 'Speed Test'
      when gah.mode = 'blaster' then 'Code Blaster'
      else null
    end as game,
    (date_trunc('week', gah.created_at at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles') as week_start,
    coalesce(gah.duration, 0) as match_duration,
    gah.filter as match_filter,
    greatest(0, coalesce(gah.score, 0)) as score,
    greatest(0, coalesce(gah.correct, 0) + coalesce(gah.incorrect, 0)) as round,
    gah.created_at
  from public.game_attempt_history gah
  where gah.mode in ('matching', 'speed', 'blaster')
    and gah.filter in ('all', 'penal', 'hs', 'vehicle')
    and gah.duration is not null
),
ranked as (
  select
    weekly_candidates.*,
    row_number() over (
      partition by user_id, game, week_start, match_duration, match_filter
      order by score desc, round desc, created_at desc
    ) as row_num
  from weekly_candidates
  where game is not null
)
insert into public.weekly_leaderboard (
  user_id,
  game,
  week_start,
  match_duration,
  match_filter,
  score,
  round,
  created_at,
  updated_at
)
select
  ranked.user_id,
  ranked.game,
  ranked.week_start,
  ranked.match_duration,
  ranked.match_filter,
  ranked.score,
  ranked.round,
  ranked.created_at,
  ranked.created_at
from ranked
where ranked.row_num = 1
on conflict (user_id, game, week_start, match_duration, match_filter)
do update set
  score = greatest(public.weekly_leaderboard.score, excluded.score),
  round = case
    when excluded.score > public.weekly_leaderboard.score then excluded.round
    when excluded.score = public.weekly_leaderboard.score then greatest(public.weekly_leaderboard.round, excluded.round)
    else public.weekly_leaderboard.round
  end,
  updated_at = greatest(public.weekly_leaderboard.updated_at, excluded.updated_at);

select pg_notify('pgrst', 'reload schema');


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260506_1v1_fair_winner_tiebreak.sql
-- -----------------------------------------------------------------------------

-- Harden 1v1 winner selection so exact ties become draws instead of favoring
-- the player who joined first. Also removes stale result rows from rooms that
-- were reset for rematch and are no longer completed.

alter table public.room_players
  add column if not exists fastest_round_ms bigint not null default 0;

delete from public.room_results rr
using public.rooms r
where rr.room_id = r.id
  and r.status <> 'completed';

create or replace function public.submit_1v1_round(
  p_room_id uuid,
  p_round integer,
  p_correct boolean,
  p_elapsed_ms integer,
  p_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_points integer;
  v_elapsed bigint;
  v_rounds integer;
  v_players_finished integer;
  v_total_players integer;
  v_winner uuid := null;
  v_results jsonb := '[]'::jsonb;
  v_row record;
  v_first record;
  v_second record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'completed' then
    for v_row in
      select user_id, score, total_time_ms, fastest_round_ms, current_round
      from public.room_players
      where room_id = p_room_id
      order by slot_no
    loop
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'user_id', v_row.user_id,
          'score', v_row.score,
          'total_time_ms', v_row.total_time_ms,
          'fastest_round_ms', v_row.fastest_round_ms,
          'current_round', v_row.current_round
        )
      );
    end loop;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id,
      'players', v_results
    );
  end if;

  if v_room.status <> 'in_progress' then
    raise exception 'Room is not active';
  end if;

  if v_room.started_at is null or now() < (v_room.started_at + interval '3 seconds') then
    raise exception 'Match countdown active';
  end if;

  if p_round is null or p_round < 1 then
    raise exception 'Invalid round';
  end if;

  v_rounds := greatest(1, coalesce(v_room.rounds, 1));
  v_elapsed := greatest(0, least(coalesce(p_elapsed_ms, 0), 300000));

  if v_room.game_type = 'matching' and p_correct and p_points is not null then
    v_points := greatest(0, least(p_points, 1000));
  else
    v_points := case when p_correct then 100 else 0 end;
  end if;

  update public.room_players
  set
    score = score + v_points,
    total_time_ms = total_time_ms + v_elapsed,
    fastest_round_ms = case
      when v_elapsed <= 0 then fastest_round_ms
      when fastest_round_ms <= 0 then v_elapsed
      else least(fastest_round_ms, v_elapsed)
    end,
    current_round = least(p_round + 1, v_rounds + 1),
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round = p_round;

  if not found then
    raise exception 'Round already submitted or player not in room';
  end if;

  select
    count(*)::int,
    count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 then
    select ranked.*
    into v_first
    from (
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
      from public.room_players rp
      where rp.room_id = p_room_id
      order by rp.score desc, rp.total_time_ms asc, fastest_norm asc
      limit 1
    ) ranked;

    select ranked.*
    into v_second
    from (
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
      from public.room_players rp
      where rp.room_id = p_room_id
      order by rp.score desc, rp.total_time_ms asc, fastest_norm asc
      offset 1
      limit 1
    ) ranked;

    if v_second.user_id is null then
      v_winner := v_first.user_id;
    elsif v_first.score <> v_second.score then
      v_winner := v_first.user_id;
    elsif v_first.total_time_ms <> v_second.total_time_ms then
      v_winner := v_first.user_id;
    elsif v_first.fastest_norm <> v_second.fastest_norm then
      v_winner := v_first.user_id;
    else
      v_winner := null;
    end if;

    delete from public.room_results where room_id = p_room_id;

    for v_row in
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        rp.fastest_round_ms,
        row_number() over (
          order by rp.score desc,
                   rp.total_time_ms asc,
                   case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end asc
        ) as rank_position
      from public.room_players rp
      where rp.room_id = p_room_id
      order by rank_position
    loop
      insert into public.room_results (
        room_id,
        user_id,
        score,
        total_time_ms,
        placement,
        is_winner
      ) values (
        p_room_id,
        v_row.user_id,
        v_row.score,
        v_row.total_time_ms,
        case when v_winner is null then 1 else v_row.rank_position end,
        (v_winner is not null and v_row.user_id = v_winner)
      );
    end loop;

    update public.rooms
    set
      status = 'completed',
      winner_user_id = v_winner,
      ended_at = now(),
      current_round = v_rounds
    where id = p_room_id
      and status = 'in_progress';

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  else
    update public.rooms
    set current_round = greatest(current_round, least(p_round + 1, v_rounds))
    where id = p_room_id
      and status = 'in_progress';
  end if;

  v_results := '[]'::jsonb;
  for v_row in
    select user_id, score, total_time_ms, fastest_round_ms, current_round
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'user_id', v_row.user_id,
        'score', v_row.score,
        'total_time_ms', v_row.total_time_ms,
        'fastest_round_ms', v_row.fastest_round_ms,
        'current_round', v_row.current_round
      )
    );
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id),
    'players', v_results
  );
end;
$$;

grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;
notify pgrst, 'reload schema';


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260506_1v1_invite_room_publish_fix.sql
-- -----------------------------------------------------------------------------

-- Ensure invite-created 1v1 rooms become visible for spectating after both
-- invited players ready up and the match starts.

create or replace function public.set_1v1_ready(
  p_room_id uuid,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_ready_count integer := 0;
  v_player_count integer := 0;
  v_started_room_id uuid;
  v_status text;
  v_publish_for_spectators boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  update public.room_players
  set
    is_ready = p_ready,
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid;

  if not found then
    raise exception 'Not in room';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  if v_room.status = 'waiting' and v_player_count = 2 and v_ready_count = 2 then
    if to_regclass('public.duel_invites') is not null then
      select exists (
        select 1
        from public.duel_invites di
        where di.room_id = p_room_id
      )
      into v_publish_for_spectators;
    end if;

    update public.rooms
    set
      status = 'in_progress',
      started_at = now(),
      current_round = 1,
      is_public = case when v_publish_for_spectators then true else is_public end,
      join_code = case when v_publish_for_spectators then null else join_code end
    where id = p_room_id
      and status = 'waiting';

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', v_ready_count,
      'player_count', v_player_count,
      'rematch_started', false,
      'room_id', p_room_id
    );
  end if;

  if v_room.status = 'completed' and v_player_count = 2 and v_ready_count = 2 then
    v_started_room_id := public.rematch_1v1_room(p_room_id, null);
    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', true,
      'room_id', v_started_room_id
    );
  end if;

  select status into v_status
  from public.rooms
  where id = p_room_id;

  return jsonb_build_object(
    'status', coalesce(v_status, v_room.status),
    'ready_count', v_ready_count,
    'player_count', v_player_count,
    'rematch_started', false,
    'room_id', p_room_id
  );
end;
$$;

grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;

select pg_notify('pgrst', 'reload schema');


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260507_1v1_forfeit_winner_guard.sql
-- -----------------------------------------------------------------------------

-- Prevent stale client timers from forfeiting a player who already completed all
-- 1v1 rounds. If a forfeit arrives after both players finished, finalize by the
-- normal tie-break order: score -> total time -> fastest single round -> draw.

alter table public.room_players
  add column if not exists fastest_round_ms bigint not null default 0;

create or replace function public.finish_1v1_room_by_score(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_winner uuid := null;
  v_results jsonb := '[]'::jsonb;
  v_row record;
  v_first record;
  v_second record;
begin
  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select ranked.* into v_first
  from (
    select
      rp.user_id,
      rp.score,
      rp.total_time_ms,
      case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, rp.total_time_ms asc, fastest_norm asc
    limit 1
  ) ranked;

  select ranked.* into v_second
  from (
    select
      rp.user_id,
      rp.score,
      rp.total_time_ms,
      case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, rp.total_time_ms asc, fastest_norm asc
    offset 1
    limit 1
  ) ranked;

  if v_first.user_id is null then
    raise exception 'No players found';
  elsif v_second.user_id is null then
    v_winner := v_first.user_id;
  elsif v_first.score <> v_second.score then
    v_winner := v_first.user_id;
  elsif v_first.total_time_ms <> v_second.total_time_ms then
    v_winner := v_first.user_id;
  elsif v_first.fastest_norm <> v_second.fastest_norm then
    v_winner := v_first.user_id;
  else
    v_winner := null;
  end if;

  delete from public.room_results where room_id = p_room_id;

  for v_row in
    select
      rp.user_id,
      rp.score,
      rp.total_time_ms,
      rp.fastest_round_ms,
      row_number() over (
        order by rp.score desc,
                 rp.total_time_ms asc,
                 case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end asc
      ) as rank_position
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rank_position
  loop
    insert into public.room_results (
      room_id,
      user_id,
      score,
      total_time_ms,
      placement,
      is_winner
    ) values (
      p_room_id,
      v_row.user_id,
      v_row.score,
      v_row.total_time_ms,
      case when v_winner is null then 1 else v_row.rank_position end,
      (v_winner is not null and v_row.user_id = v_winner)
    );
  end loop;

  update public.rooms
  set status = 'completed',
      winner_user_id = v_winner,
      ended_at = coalesce(ended_at, now()),
      current_round = coalesce(rounds, current_round)
  where id = p_room_id;

  update public.room_players
  set is_ready = false
  where room_id = p_room_id;

  for v_row in
    select user_id, score, total_time_ms, fastest_round_ms, current_round
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'user_id', v_row.user_id,
        'score', v_row.score,
        'total_time_ms', v_row.total_time_ms,
        'fastest_round_ms', v_row.fastest_round_ms,
        'current_round', v_row.current_round
      )
    );
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', 'completed',
    'winner_user_id', v_winner,
    'players', v_results
  );
end;
$$;

revoke all on function public.finish_1v1_room_by_score(uuid) from public, anon, authenticated;

create or replace function public.forfeit_1v1_match(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_self public.room_players%rowtype;
  v_opponent public.room_players%rowtype;
  v_remaining_players integer := 0;
  v_players_finished integer := 0;
  v_total_players integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select * into v_self
  from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  if v_self.id is null then
    raise exception 'Not in room';
  end if;

  if v_room.status = 'waiting' then
    delete from public.room_players
    where room_id = p_room_id
      and user_id = v_uid;

    select count(*)::int into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    if v_remaining_players = 0 then
      update public.rooms
      set status = 'cancelled', ended_at = now()
      where id = p_room_id;
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', (select status from public.rooms where id = p_room_id),
      'winner_user_id', null
    );
  end if;

  if v_room.status <> 'in_progress' then
    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id
    );
  end if;

  select count(*)::int,
         count(*) filter (where current_round > greatest(1, coalesce(v_room.rounds, 1)))::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  -- Stale browser timers can fire after a player has already answered the final
  -- question. Do not let that overwrite a valid 100% finish as a forfeit loss.
  if v_self.current_round > greatest(1, coalesce(v_room.rounds, 1)) then
    if v_total_players = 2 and v_players_finished = 2 then
      return public.finish_1v1_room_by_score(p_room_id);
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id,
      'ignored', true,
      'reason', 'player_already_finished'
    );
  end if;

  select * into v_opponent
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_uid
  order by slot_no
  limit 1;

  update public.room_players
  set current_round = greatest(current_round, v_room.rounds + 1),
      last_seen = now()
  where id = v_self.id;

  if v_opponent.id is not null then
    update public.room_players
    set current_round = greatest(current_round, v_room.rounds + 1),
        last_seen = now()
    where id = v_opponent.id;

    delete from public.room_results where room_id = p_room_id;

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_opponent.user_id, v_opponent.score, v_opponent.total_time_ms, 1, true);

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_self.user_id, v_self.score, v_self.total_time_ms, 2, false);

    update public.rooms
    set status = 'completed',
        winner_user_id = v_opponent.user_id,
        ended_at = now(),
        current_round = v_room.rounds
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  else
    update public.rooms
    set status = 'cancelled', ended_at = now(), current_round = v_room.rounds
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id)
  );
end;
$$;

grant execute on function public.forfeit_1v1_match(uuid) to authenticated;
notify pgrst, 'reload schema';

-- Repair any already-completed 1v1 rooms where a stale forfeit result made a
-- lower score beat a higher score, then rebuild 1v1 stats from room_results.
do $$
declare
  v_room record;
  v_winner uuid;
  v_first record;
  v_second record;
  v_row record;
begin
  for v_room in
    select id, winner_user_id
    from public.rooms
    where status = 'completed'
      and exists (select 1 from public.room_players where room_id = rooms.id)
  loop
    select ranked.* into v_first
    from (
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
      from public.room_players rp
      where rp.room_id = v_room.id
      order by rp.score desc, rp.total_time_ms asc, fastest_norm asc
      limit 1
    ) ranked;

    select ranked.* into v_second
    from (
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
      from public.room_players rp
      where rp.room_id = v_room.id
      order by rp.score desc, rp.total_time_ms asc, fastest_norm asc
      offset 1
      limit 1
    ) ranked;

    if v_first.user_id is null then
      continue;
    elsif v_second.user_id is null then
      v_winner := v_first.user_id;
    elsif v_first.score <> v_second.score then
      v_winner := v_first.user_id;
    elsif v_first.total_time_ms <> v_second.total_time_ms then
      v_winner := v_first.user_id;
    elsif v_first.fastest_norm <> v_second.fastest_norm then
      v_winner := v_first.user_id;
    else
      v_winner := null;
    end if;

    if v_room.winner_user_id is distinct from v_winner then
      delete from public.room_results where room_id = v_room.id;

      for v_row in
        select
          rp.user_id,
          rp.score,
          rp.total_time_ms,
          row_number() over (
            order by rp.score desc,
                     rp.total_time_ms asc,
                     case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end asc
          ) as rank_position
        from public.room_players rp
        where rp.room_id = v_room.id
        order by rank_position
      loop
        insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
        values (
          v_room.id,
          v_row.user_id,
          v_row.score,
          v_row.total_time_ms,
          case when v_winner is null then 1 else v_row.rank_position end,
          (v_winner is not null and v_row.user_id = v_winner)
        );
      end loop;

      update public.rooms
      set winner_user_id = v_winner
      where id = v_room.id;
    end if;
  end loop;

  if to_regclass('public.duel_player_stats') is not null then
    delete from public.duel_player_stats where true;

    with ordered_matches as (
      select
        rr.user_id,
        'all'::text as game_type,
        r.created_at,
        (rr.user_id = r.winner_user_id) as won
      from public.room_results rr
      join public.rooms r on r.id = rr.room_id
      where r.status = 'completed'
        and r.winner_user_id is not null
      union all
      select
        rr.user_id,
        r.game_type::text as game_type,
        r.created_at,
        (rr.user_id = r.winner_user_id) as won
      from public.room_results rr
      join public.rooms r on r.id = rr.room_id
      where r.status = 'completed'
        and r.winner_user_id is not null
    ), grouped as (
      select
        user_id,
        game_type,
        count(*)::int as matches_played,
        count(*) filter (where won)::int as wins,
        count(*) filter (where not won)::int as losses
      from ordered_matches
      group by user_id, game_type
    ), last_losses as (
      select
        user_id,
        game_type,
        max(created_at) filter (where not won) as last_loss_at
      from ordered_matches
      group by user_id, game_type
    ), current_streaks as (
      select
        g.user_id,
        g.game_type,
        count(om.*) filter (where om.won)::int as current_win_streak
      from grouped g
      left join last_losses ll on ll.user_id = g.user_id and ll.game_type = g.game_type
      left join ordered_matches om on om.user_id = g.user_id
        and om.game_type = g.game_type
        and om.won
        and (ll.last_loss_at is null or om.created_at > ll.last_loss_at)
      group by g.user_id, g.game_type
    ), streak_scan as (
      select
        user_id,
        game_type,
        won,
        sum(case when won then 0 else 1 end) over (
          partition by user_id, game_type order by created_at rows unbounded preceding
        ) as loss_group
      from ordered_matches
    ), best_streaks as (
      select user_id, game_type, coalesce(max(streak_len), 0)::int as best_win_streak
      from (
        select user_id, game_type, loss_group, count(*) filter (where won)::int as streak_len
        from streak_scan
        group by user_id, game_type, loss_group
      ) streaks
      group by user_id, game_type
    )
    insert into public.duel_player_stats (
      user_id,
      game_type,
      wins,
      losses,
      matches_played,
      current_win_streak,
      best_win_streak,
      updated_at
    )
    select
      g.user_id,
      g.game_type,
      g.wins,
      g.losses,
      g.matches_played,
      coalesce(cs.current_win_streak, 0),
      coalesce(bs.best_win_streak, 0),
      now()
    from grouped g
    left join current_streaks cs on cs.user_id = g.user_id and cs.game_type = g.game_type
    left join best_streaks bs on bs.user_id = g.user_id and bs.game_type = g.game_type;
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260507_zz_1v1_finish_order_tiebreak.sql
-- -----------------------------------------------------------------------------

-- Make 1v1 ties fair by using server-side finish order after score.
-- This intentionally runs after the stale-forfeit guard migration so rematches
-- and late browser timers cannot make the last finisher win.

alter table public.room_players
  add column if not exists fastest_round_ms bigint not null default 0,
  add column if not exists finished_at timestamptz;

-- Stale rematch/waiting results should never count toward records.
delete from public.room_results rr
using public.rooms r
where rr.room_id = r.id
  and r.status <> 'completed';

create or replace function public.finish_1v1_room_by_score(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_winner uuid := null;
  v_results jsonb := '[]'::jsonb;
  v_row record;
  v_first record;
  v_second record;
begin
  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select ranked.* into v_first
  from (
    select
      rp.user_id,
      rp.score,
      rp.total_time_ms,
      coalesce(rp.finished_at, rp.last_seen, 'infinity'::timestamptz) as finish_norm,
      case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, finish_norm asc, rp.total_time_ms asc, fastest_norm asc
    limit 1
  ) ranked;

  select ranked.* into v_second
  from (
    select
      rp.user_id,
      rp.score,
      rp.total_time_ms,
      coalesce(rp.finished_at, rp.last_seen, 'infinity'::timestamptz) as finish_norm,
      case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, finish_norm asc, rp.total_time_ms asc, fastest_norm asc
    offset 1
    limit 1
  ) ranked;

  if v_first.user_id is null then
    raise exception 'No players found';
  elsif v_second.user_id is null then
    v_winner := v_first.user_id;
  elsif v_first.score <> v_second.score then
    v_winner := v_first.user_id;
  elsif v_first.finish_norm is distinct from v_second.finish_norm then
    v_winner := v_first.user_id;
  elsif v_first.total_time_ms <> v_second.total_time_ms then
    v_winner := v_first.user_id;
  elsif v_first.fastest_norm <> v_second.fastest_norm then
    v_winner := v_first.user_id;
  else
    v_winner := null;
  end if;

  delete from public.room_results where room_id = p_room_id;

  for v_row in
    select
      rp.user_id,
      rp.score,
      rp.total_time_ms,
      rp.fastest_round_ms,
      rp.finished_at,
      row_number() over (
        order by rp.score desc,
                 coalesce(rp.finished_at, rp.last_seen, 'infinity'::timestamptz) asc,
                 rp.total_time_ms asc,
                 case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end asc
      ) as rank_position
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rank_position
  loop
    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (
      p_room_id,
      v_row.user_id,
      v_row.score,
      v_row.total_time_ms,
      case when v_winner is null then 1 else v_row.rank_position end,
      (v_winner is not null and v_row.user_id = v_winner)
    );
  end loop;

  update public.rooms
  set status = 'completed',
      winner_user_id = v_winner,
      ended_at = coalesce(ended_at, now()),
      current_round = coalesce(rounds, current_round)
  where id = p_room_id;

  update public.room_players
  set is_ready = false
  where room_id = p_room_id;

  for v_row in
    select user_id, score, total_time_ms, fastest_round_ms, current_round, finished_at
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'user_id', v_row.user_id,
      'score', v_row.score,
      'total_time_ms', v_row.total_time_ms,
      'fastest_round_ms', v_row.fastest_round_ms,
      'current_round', v_row.current_round,
      'finished_at', v_row.finished_at
    ));
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', 'completed',
    'winner_user_id', v_winner,
    'players', v_results
  );
end;
$$;

revoke all on function public.finish_1v1_room_by_score(uuid) from public, anon, authenticated;

create or replace function public.submit_1v1_round(
  p_room_id uuid,
  p_round integer,
  p_correct boolean,
  p_elapsed_ms integer,
  p_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_points integer;
  v_elapsed bigint;
  v_rounds integer;
  v_players_finished integer;
  v_total_players integer;
  v_winner uuid := null;
  v_results jsonb := '[]'::jsonb;
  v_row record;
  v_first record;
  v_second record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'completed' then
    for v_row in
      select user_id, score, total_time_ms, fastest_round_ms, current_round, finished_at
      from public.room_players
      where room_id = p_room_id
      order by slot_no
    loop
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'user_id', v_row.user_id,
        'score', v_row.score,
        'total_time_ms', v_row.total_time_ms,
        'fastest_round_ms', v_row.fastest_round_ms,
        'current_round', v_row.current_round,
        'finished_at', v_row.finished_at
      ));
    end loop;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id,
      'players', v_results
    );
  end if;

  if v_room.status <> 'in_progress' then
    raise exception 'Room is not active';
  end if;

  if v_room.started_at is null or now() < (v_room.started_at + interval '3 seconds') then
    raise exception 'Match countdown active';
  end if;

  if p_round is null or p_round < 1 then
    raise exception 'Invalid round';
  end if;

  v_rounds := greatest(1, coalesce(v_room.rounds, 1));
  v_elapsed := greatest(0, least(coalesce(p_elapsed_ms, 0), 300000));

  if v_room.game_type = 'matching' and p_correct and p_points is not null then
    v_points := greatest(0, least(p_points, 1000));
  else
    v_points := case when p_correct then 100 else 0 end;
  end if;

  update public.room_players
  set
    score = score + v_points,
    total_time_ms = total_time_ms + v_elapsed,
    fastest_round_ms = case
      when v_elapsed <= 0 then fastest_round_ms
      when fastest_round_ms <= 0 then v_elapsed
      else least(fastest_round_ms, v_elapsed)
    end,
    current_round = least(p_round + 1, v_rounds + 1),
    finished_at = case
      when p_round >= v_rounds then coalesce(finished_at, now())
      else finished_at
    end,
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round = p_round;

  if not found then
    raise exception 'Round already submitted or player not in room';
  end if;

  select count(*)::int,
         count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 then
    select ranked.* into v_first
    from (
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        coalesce(rp.finished_at, rp.last_seen, 'infinity'::timestamptz) as finish_norm,
        case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
      from public.room_players rp
      where rp.room_id = p_room_id
      order by rp.score desc, finish_norm asc, rp.total_time_ms asc, fastest_norm asc
      limit 1
    ) ranked;

    select ranked.* into v_second
    from (
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        coalesce(rp.finished_at, rp.last_seen, 'infinity'::timestamptz) as finish_norm,
        case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
      from public.room_players rp
      where rp.room_id = p_room_id
      order by rp.score desc, finish_norm asc, rp.total_time_ms asc, fastest_norm asc
      offset 1
      limit 1
    ) ranked;

    if v_second.user_id is null then
      v_winner := v_first.user_id;
    elsif v_first.score <> v_second.score then
      v_winner := v_first.user_id;
    elsif v_first.finish_norm is distinct from v_second.finish_norm then
      v_winner := v_first.user_id;
    elsif v_first.total_time_ms <> v_second.total_time_ms then
      v_winner := v_first.user_id;
    elsif v_first.fastest_norm <> v_second.fastest_norm then
      v_winner := v_first.user_id;
    else
      v_winner := null;
    end if;

    delete from public.room_results where room_id = p_room_id;

    for v_row in
      select
        rp.user_id,
        rp.score,
        rp.total_time_ms,
        rp.fastest_round_ms,
        rp.finished_at,
        row_number() over (
          order by rp.score desc,
                   coalesce(rp.finished_at, rp.last_seen, 'infinity'::timestamptz) asc,
                   rp.total_time_ms asc,
                   case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end asc
        ) as rank_position
      from public.room_players rp
      where rp.room_id = p_room_id
      order by rank_position
    loop
      insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
      values (
        p_room_id,
        v_row.user_id,
        v_row.score,
        v_row.total_time_ms,
        case when v_winner is null then 1 else v_row.rank_position end,
        (v_winner is not null and v_row.user_id = v_winner)
      );
    end loop;

    update public.rooms
    set status = 'completed',
        winner_user_id = v_winner,
        ended_at = now(),
        current_round = v_rounds
    where id = p_room_id
      and status = 'in_progress';

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  else
    update public.rooms
    set current_round = greatest(current_round, least(p_round + 1, v_rounds))
    where id = p_room_id
      and status = 'in_progress';
  end if;

  v_results := '[]'::jsonb;
  for v_row in
    select user_id, score, total_time_ms, fastest_round_ms, current_round, finished_at
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'user_id', v_row.user_id,
      'score', v_row.score,
      'total_time_ms', v_row.total_time_ms,
      'fastest_round_ms', v_row.fastest_round_ms,
      'current_round', v_row.current_round,
      'finished_at', v_row.finished_at
    ));
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id),
    'players', v_results
  );
end;
$$;

grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;

create or replace function public.forfeit_1v1_match(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_self public.room_players%rowtype;
  v_opponent public.room_players%rowtype;
  v_remaining_players integer := 0;
  v_players_finished integer := 0;
  v_total_players integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select * into v_self
  from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  if v_self.id is null then
    raise exception 'Not in room';
  end if;

  if v_room.status = 'waiting' then
    delete from public.room_players
    where room_id = p_room_id
      and user_id = v_uid;

    select count(*)::int into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    if v_remaining_players = 0 then
      update public.rooms
      set status = 'cancelled', ended_at = now()
      where id = p_room_id;
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', (select status from public.rooms where id = p_room_id),
      'winner_user_id', null
    );
  end if;

  if v_room.status <> 'in_progress' then
    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id
    );
  end if;

  select count(*)::int,
         count(*) filter (where current_round > greatest(1, coalesce(v_room.rounds, 1)))::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  -- Stale browser timers can fire after a player already answered the final
  -- question. Ignore that instead of turning a valid finish into a forfeit.
  if v_self.current_round > greatest(1, coalesce(v_room.rounds, 1)) then
    if v_total_players = 2 and v_players_finished = 2 then
      return public.finish_1v1_room_by_score(p_room_id);
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id,
      'ignored', true,
      'reason', 'player_already_finished'
    );
  end if;

  select * into v_opponent
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_uid
  order by slot_no
  limit 1;

  update public.room_players
  set current_round = greatest(current_round, v_room.rounds + 1),
      finished_at = coalesce(finished_at, now()),
      last_seen = now()
  where id = v_self.id;

  if v_opponent.id is not null then
    update public.room_players
    set current_round = greatest(current_round, v_room.rounds + 1),
        finished_at = coalesce(finished_at, now()),
        last_seen = now()
    where id = v_opponent.id;

    delete from public.room_results where room_id = p_room_id;

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_opponent.user_id, v_opponent.score, v_opponent.total_time_ms, 1, true);

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_self.user_id, v_self.score, v_self.total_time_ms, 2, false);

    update public.rooms
    set status = 'completed',
        winner_user_id = v_opponent.user_id,
        ended_at = now(),
        current_round = v_room.rounds
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  else
    update public.rooms
    set status = 'cancelled', ended_at = now(), current_round = v_room.rounds
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id)
  );
end;
$$;

grant execute on function public.forfeit_1v1_match(uuid) to authenticated;

create or replace function public.get_1v1_room_details(p_room_id uuid)
returns table (
  room jsonb,
  players jsonb,
  results jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    row_to_json(r)::jsonb as room,
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
  where r.id = p_room_id;
end;
$$;

grant execute on function public.get_1v1_room_details(uuid) to authenticated;

-- Recalculate completed 1v1 rooms with the same fair tiebreaker. Rooms that do
-- not have finish timestamps still fall back to answer-time and fastest-round.
do $$
declare
  v_room record;
begin
  for v_room in
    select id
    from public.rooms
    where status = 'completed'
      and exists (select 1 from public.room_players where room_id = rooms.id)
  loop
    perform public.finish_1v1_room_by_score(v_room.id);
  end loop;
end $$;

-- Rebuild duel stats from completed rooms only, after stale rows are removed.
delete from public.duel_player_stats;

insert into public.duel_player_stats (
  user_id,
  game_type,
  wins,
  losses,
  matches_played,
  current_win_streak,
  best_win_streak,
  updated_at
)
with ordered_results as (
  select
    rr.user_id,
    r.game_type,
    rr.is_winner,
    coalesce(r.ended_at, rr.finished_at, rr.created_at) as played_at
  from public.room_results rr
  join public.rooms r on r.id = rr.room_id
  where r.status = 'completed'
),
streak_groups as (
  select
    *,
    count(*) filter (where not is_winner) over (
      partition by user_id, game_type
      order by played_at
      rows between unbounded preceding and current row
    ) as loss_group
  from ordered_results
),
win_streaks as (
  select
    user_id,
    game_type,
    played_at,
    is_winner,
    case
      when is_winner then count(*) filter (where is_winner) over (
        partition by user_id, game_type, loss_group
        order by played_at
        rows between unbounded preceding and current row
      )
      else 0
    end as streak_value
  from streak_groups
),
latest as (
  select distinct on (user_id, game_type)
    user_id,
    game_type,
    streak_value as current_win_streak
  from win_streaks
  order by user_id, game_type, played_at desc
),
totals as (
  select
    user_id,
    game_type,
    count(*) filter (where is_winner)::int as wins,
    count(*) filter (where not is_winner)::int as losses,
    count(*)::int as matches_played
  from ordered_results
  group by user_id, game_type
),
bests as (
  select user_id, game_type, max(streak_value)::int as best_win_streak
  from win_streaks
  group by user_id, game_type
)
select
  totals.user_id,
  totals.game_type,
  totals.wins,
  totals.losses,
  totals.matches_played,
  coalesce(latest.current_win_streak, 0),
  coalesce(bests.best_win_streak, 0),
  now()
from totals
left join latest using (user_id, game_type)
left join bests using (user_id, game_type);

notify pgrst, 'reload schema';


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260508_1v1_lobby_sync_countdown.sql
-- -----------------------------------------------------------------------------

-- Make 1v1 match starts fair for both clients.
-- The ready/rematch RPCs now store started_at a few seconds in the future,
-- and round submission is blocked only until that shared server timestamp.

do $$
declare
  v_function_sql text;
  v_updated_sql text;
begin
  if to_regprocedure('public.set_1v1_ready(uuid, boolean)') is not null then
    v_function_sql := pg_get_functiondef('public.set_1v1_ready(uuid, boolean)'::regprocedure);
    v_updated_sql := replace(v_function_sql, 'started_at = now(),', 'started_at = now() + interval ''3 seconds'',');

    if v_updated_sql = v_function_sql then
      raise notice 'set_1v1_ready did not contain the expected started_at assignment.';
    else
      execute v_updated_sql;
    end if;
  end if;

  if to_regprocedure('public.rematch_1v1_room(uuid, text)') is not null then
    v_function_sql := pg_get_functiondef('public.rematch_1v1_room(uuid, text)'::regprocedure);
    v_updated_sql := replace(v_function_sql, 'started_at = now(),', 'started_at = now() + interval ''3 seconds'',');

    if v_updated_sql = v_function_sql then
      raise notice 'rematch_1v1_room did not contain the expected started_at assignment.';
    else
      execute v_updated_sql;
    end if;
  end if;

  if to_regprocedure('public.submit_1v1_round(uuid, integer, boolean, integer, integer)') is not null then
    v_function_sql := pg_get_functiondef('public.submit_1v1_round(uuid, integer, boolean, integer, integer)'::regprocedure);
    v_updated_sql := replace(
      v_function_sql,
      'if v_room.started_at is null or now() < (v_room.started_at + interval ''3 seconds'') then',
      'if v_room.started_at is null or now() < v_room.started_at then'
    );

    if v_updated_sql = v_function_sql then
      raise notice 'submit_1v1_round did not contain the expected countdown guard.';
    else
      execute v_updated_sql;
    end if;
  end if;
end $$;

grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;
grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;

select pg_notify('pgrst', 'reload schema');


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260512182637_leveling_performance_indexes.sql
-- -----------------------------------------------------------------------------

-- Keep level and leaderboard refreshes snappy without indexing large app_state JSON blobs.
create index if not exists leaderboard_score_rank_idx
  on public.leaderboard (score desc, round desc, created_at desc);

create index if not exists leaderboard_user_score_lookup_idx
  on public.leaderboard (user_id, score desc, created_at desc);

create index if not exists weekly_leaderboard_week_score_rank_idx
  on public.weekly_leaderboard (week_start, score desc, round desc, updated_at desc);

-- If the project has the public app_state read policy used by the home/leveling
-- widgets, remove the older self-only select policy so Postgres does not evaluate
-- two permissive SELECT policies for every app_state leaderboard read.
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_state'
      and policyname = 'app_state_read_all'
  ) then
    drop policy if exists app_state_select_self on public.app_state;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260512233325_1v1_fresh_start_and_leave_cleanup.sql
-- -----------------------------------------------------------------------------

-- Harden 1v1 room reuse:
-- 1) Leaving a completed/cancelled room no longer reopens it as a waiting lobby.
-- 2) Starting a waiting room always hands both players into a fresh in-progress room,
--    which regenerates question_set and resets player progress/answers.

create or replace function public.leave_1v1_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_remaining_players integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'in_progress' then
    raise exception 'Cannot leave an active match. Use forfeit instead.';
  end if;

  delete from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  select count(*)::int
  into v_remaining_players
  from public.room_players
  where room_id = p_room_id;

  if v_room.status = 'waiting' then
    if v_remaining_players = 0 then
      update public.rooms
      set status = 'cancelled',
          current_round = 1,
          started_at = null,
          winner_user_id = null,
          ended_at = now(),
          rematch_room_id = null,
          updated_at = now()
      where id = p_room_id;

      if to_regclass('public.duel_invites') is not null then
        update public.duel_invites
        set status = 'cancelled',
            responded_at = now()
        where room_id = p_room_id
          and status = 'pending';
      end if;

      return jsonb_build_object(
        'room_id', p_room_id,
        'status', 'cancelled',
        'player_count', 0
      );
    end if;

    update public.room_players
    set is_ready = false,
        score = 0,
        total_time_ms = 0,
        fastest_round_ms = 0,
        current_round = 1,
        last_seen = now()
    where room_id = p_room_id;

    update public.rooms
    set status = 'waiting',
        current_round = 1,
        started_at = null,
        winner_user_id = null,
        ended_at = null,
        updated_at = now()
    where id = p_room_id;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', 'waiting',
      'player_count', v_remaining_players
    );
  end if;

  -- Completed/cancelled rooms must stay closed. Previously this reopened old
  -- matches as waiting rooms, which reused old questions and stale player rounds.
  update public.room_players
  set is_ready = false,
      last_seen = now()
  where room_id = p_room_id;

  update public.rooms
  set rematch_room_id = null,
      updated_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', v_room.status,
    'player_count', v_remaining_players,
    'message', case when v_remaining_players < 2 then 'Opponent left the lobby. Rematch cancelled.' else null end
  );
end;
$$;

grant execute on function public.leave_1v1_room(uuid) to authenticated;

create or replace function public.cleanup_inactive_1v1_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  with stale_rooms as (
    select r.id
    from public.rooms r
    where (
      r.status = 'waiting'
      and r.created_at <= now() - interval '5 minutes'
      and not exists (
        select 1
        from public.room_players rp
        where rp.room_id = r.id
          and rp.last_seen >= now() - interval '5 minutes'
      )
    ) or (
      r.status = 'in_progress'
      and coalesce(r.started_at, r.updated_at, r.created_at) <= now() - interval '2 hours'
      and not exists (
        select 1
        from public.room_players rp
        where rp.room_id = r.id
          and rp.last_seen >= now() - interval '10 minutes'
      )
    ) or (
      r.status in ('completed', 'cancelled')
      and coalesce(r.ended_at, r.updated_at, r.created_at) <= now() - interval '5 minutes'
      and r.rematch_room_id is null
    )
  )
  delete from public.rooms r
  using stale_rooms s
  where r.id = s.id;

  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
end;
$$;

grant execute on function public.cleanup_inactive_1v1_rooms() to authenticated;

create or replace function public.set_1v1_ready(p_room_id uuid, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_ready_count integer := 0;
  v_player_count integer := 0;
  v_started_room_id uuid;
  v_status text;
  v_started_at timestamptz;
  v_publish_for_spectators boolean := false;
  v_rounds integer := 10;
  v_player record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'completed' and v_room.rematch_room_id is not null then
    select count(*)::int
    into v_player_count
    from public.room_players
    where room_id = v_room.rematch_room_id;

    if v_player_count = 2 and exists (
      select 1
      from public.rooms r
      where r.id = v_room.rematch_room_id
        and r.status in ('waiting', 'in_progress')
    ) then
      select started_at
      into v_started_at
      from public.rooms
      where id = v_room.rematch_room_id;

      return jsonb_build_object(
        'status', 'in_progress',
        'ready_count', 2,
        'player_count', 2,
        'rematch_started', true,
        'room_id', v_room.rematch_room_id,
        'started_at', v_started_at
      );
    end if;

    update public.rooms
    set status = 'cancelled',
        ended_at = now(),
        updated_at = now()
    where id = v_room.rematch_room_id
      and status in ('waiting', 'in_progress');

    update public.rooms
    set rematch_room_id = null,
        updated_at = now()
    where id = p_room_id;

    update public.room_players
    set is_ready = false,
        last_seen = now()
    where room_id = p_room_id;

    select count(*)::int
    into v_player_count
    from public.room_players
    where room_id = p_room_id;

    return jsonb_build_object(
      'status', 'completed',
      'ready_count', 0,
      'player_count', v_player_count,
      'rematch_started', false,
      'rematch_cancelled', true,
      'room_id', p_room_id,
      'message', 'Opponent left the rematch. Rematch cancelled.'
    );
  end if;

  update public.room_players
  set
    is_ready = p_ready,
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid;

  if not found then
    raise exception 'Not in room';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  if v_room.status = 'waiting' and v_player_count = 2 and v_ready_count = 2 then
    if to_regclass('public.duel_invites') is not null then
      select exists (
        select 1
        from public.duel_invites di
        where di.room_id = p_room_id
      )
      into v_publish_for_spectators;
    end if;

    v_started_at := now() + interval '4 seconds';
    v_rounds := case
      when v_room.game_type = 'matching' then 5
      else greatest(5, least(coalesce(v_room.rounds, 10), 50))
    end;

    -- Build a brand-new room/question_set for every start. This prevents stale
    -- completed/rematch lobbies from reusing old questions or answered rounds.
    v_started_room_id := public.create_1v1_room(
      v_room.game_type,
      v_room.category,
      coalesce(v_room.is_public, false) or v_publish_for_spectators,
      v_rounds
    );

    delete from public.room_players
    where room_id = v_started_room_id;

    for v_player in
      select user_id, slot_no
      from public.room_players
      where room_id = p_room_id
      order by slot_no
    loop
      insert into public.room_players (
        room_id,
        user_id,
        slot_no,
        is_ready,
        score,
        total_time_ms,
        fastest_round_ms,
        current_round,
        last_seen
      ) values (
        v_started_room_id,
        v_player.user_id,
        v_player.slot_no,
        false,
        0,
        0,
        0,
        1,
        now()
      )
      on conflict (room_id, user_id)
      do update set
        slot_no = excluded.slot_no,
        is_ready = false,
        score = 0,
        total_time_ms = 0,
        fastest_round_ms = 0,
        current_round = 1,
        last_seen = now();
    end loop;

    update public.rooms
    set status = 'in_progress',
        started_at = v_started_at,
        current_round = 1,
        is_public = coalesce(v_room.is_public, false) or v_publish_for_spectators,
        join_code = case when coalesce(v_room.is_public, false) or v_publish_for_spectators then null else join_code end,
        ended_at = null,
        winner_user_id = null,
        updated_at = now()
    where id = v_started_room_id;

    update public.room_players
    set is_ready = false,
        last_seen = now()
    where room_id = p_room_id;

    update public.rooms
    set status = 'cancelled',
        rematch_room_id = v_started_room_id,
        ended_at = now(),
        updated_at = now()
    where id = p_room_id;

    if to_regclass('public.duel_invites') is not null then
      update public.duel_invites
      set room_id = v_started_room_id
      where room_id = p_room_id
        and status in ('pending', 'accepted');
    end if;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', false,
      'room_id', v_started_room_id,
      'started_at', v_started_at
    );
  end if;

  if v_room.status = 'completed' and v_player_count = 2 and v_ready_count = 2 then
    v_started_room_id := public.rematch_1v1_room(p_room_id, null);

    select started_at
    into v_started_at
    from public.rooms
    where id = v_started_room_id;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', true,
      'room_id', v_started_room_id,
      'started_at', v_started_at
    );
  end if;

  select status, started_at
  into v_status, v_started_at
  from public.rooms
  where id = p_room_id;

  return jsonb_build_object(
    'status', coalesce(v_status, v_room.status),
    'ready_count', v_ready_count,
    'player_count', v_player_count,
    'rematch_started', false,
    'room_id', p_room_id,
    'started_at', v_started_at
  );
end;
$$;

grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;

-- Clean currently reopened stale rooms caused by the old leave behavior.
update public.rooms r
set status = 'cancelled',
    ended_at = coalesce(r.ended_at, now()),
    rematch_room_id = null,
    updated_at = now()
where r.status = 'waiting'
  and exists (
    select 1
    from public.room_players rp
    where rp.room_id = r.id
      and (
        rp.current_round > 1
        or rp.score > 0
        or rp.total_time_ms > 0
        or rp.fastest_round_ms > 0
      )
  );

update public.room_players rp
set is_ready = false,
    last_seen = now()
where exists (
  select 1
  from public.rooms r
  where r.id = rp.room_id
    and r.status in ('cancelled', 'completed')
);

select public.cleanup_inactive_1v1_rooms();

select pg_notify('pgrst', 'reload schema');


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260512_1v1_cancel_abandoned_rematch.sql
-- -----------------------------------------------------------------------------

-- If one player accepts a rematch and the other leaves, do not hand the
-- remaining player into a stale/empty rematch room.

do $$
declare
  v_sql text;
  v_next_sql text;
begin
  v_sql := pg_get_functiondef('public.rematch_1v1_room(uuid, text)'::regprocedure);
  v_next_sql := replace(
    v_sql,
$old$
  if v_room.rematch_room_id is not null then
    return v_room.rematch_room_id;
  end if;
$old$,
$new$
  if v_room.rematch_room_id is not null then
    select count(*)::int
    into v_player_count
    from public.room_players
    where room_id = v_room.rematch_room_id;

    if v_player_count = 2 and exists (
      select 1
      from public.rooms r
      where r.id = v_room.rematch_room_id
        and r.status in ('waiting', 'in_progress')
    ) then
      return v_room.rematch_room_id;
    end if;

    update public.rooms
    set rematch_room_id = null,
        updated_at = now()
    where id = p_room_id;

    update public.rooms
    set status = 'cancelled',
        ended_at = now(),
        updated_at = now()
    where id = v_room.rematch_room_id
      and status in ('waiting', 'in_progress');

    update public.room_players
    set is_ready = false,
        last_seen = now()
    where room_id = p_room_id;

    raise exception 'Opponent left the rematch. Rematch cancelled.';
  end if;
$new$
  );

  if v_next_sql = v_sql and position('Opponent left the rematch. Rematch cancelled.' in v_sql) = 0 then
    raise exception 'Could not patch rematch_1v1_room stale rematch guard';
  end if;

  if v_next_sql <> v_sql then
    execute v_next_sql;
  end if;

  v_sql := pg_get_functiondef('public.set_1v1_ready(uuid, boolean)'::regprocedure);
  v_next_sql := replace(
    v_sql,
$old$
  if v_room.status = 'completed' and v_room.rematch_room_id is not null then
    select started_at
    into v_started_at
    from public.rooms
    where id = v_room.rematch_room_id;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', true,
      'room_id', v_room.rematch_room_id,
      'started_at', v_started_at
    );
  end if;
$old$,
$new$
  if v_room.status = 'completed' and v_room.rematch_room_id is not null then
    select count(*)::int
    into v_player_count
    from public.room_players
    where room_id = v_room.rematch_room_id;

    if v_player_count = 2 and exists (
      select 1
      from public.rooms r
      where r.id = v_room.rematch_room_id
        and r.status in ('waiting', 'in_progress')
    ) then
      select started_at
      into v_started_at
      from public.rooms
      where id = v_room.rematch_room_id;

      return jsonb_build_object(
        'status', 'in_progress',
        'ready_count', 2,
        'player_count', 2,
        'rematch_started', true,
        'room_id', v_room.rematch_room_id,
        'started_at', v_started_at
      );
    end if;

    update public.rooms
    set status = 'cancelled',
        ended_at = now(),
        updated_at = now()
    where id = v_room.rematch_room_id
      and status in ('waiting', 'in_progress');

    update public.rooms
    set rematch_room_id = null,
        updated_at = now()
    where id = p_room_id;

    update public.room_players
    set is_ready = false,
        last_seen = now()
    where room_id = p_room_id;

    select count(*)::int
    into v_player_count
    from public.room_players
    where room_id = p_room_id;

    return jsonb_build_object(
      'status', 'completed',
      'ready_count', 0,
      'player_count', v_player_count,
      'rematch_started', false,
      'rematch_cancelled', true,
      'room_id', p_room_id,
      'message', 'Opponent left the rematch. Rematch cancelled.'
    );
  end if;
$new$
  );

  if v_next_sql = v_sql and position('rematch_cancelled' in v_sql) = 0 then
    raise exception 'Could not patch set_1v1_ready stale rematch guard';
  end if;

  if v_next_sql <> v_sql then
    execute v_next_sql;
  end if;
end $$;

grant execute on function public.rematch_1v1_room(uuid, text) to authenticated;
grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;

select pg_notify('pgrst', 'reload schema');


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260512_1v1_fresh_rematch_rooms.sql
-- -----------------------------------------------------------------------------

-- Make 1v1 rematches use a brand-new room instead of mutating the completed room.
-- The completed room keeps its results, both players vote there, and once both agree
-- they are handed off to a fresh in_progress room with a shared future started_at.

create or replace function public.rematch_1v1_room(
  p_room_id uuid,
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_self public.room_players%rowtype;
  v_opponent public.room_players%rowtype;
  v_category text;
  v_rounds integer;
  v_ready_count integer := 0;
  v_player_count integer := 0;
  v_new_room_id uuid;
  v_start_at timestamptz := now() + interval '4 seconds';
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.rematch_room_id is not null then
    return v_room.rematch_room_id;
  end if;

  if v_room.status <> 'completed' then
    raise exception 'Rematch is available only after match completion';
  end if;

  select *
  into v_self
  from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  if v_self.id is null then
    raise exception 'Only room participants can request a rematch';
  end if;

  select *
  into v_opponent
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_uid
  order by slot_no
  limit 1;

  if v_opponent.id is null then
    raise exception 'Opponent has left this match';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count <> 2 then
    raise exception 'Rematch requires exactly two players';
  end if;

  if v_ready_count <> 2 then
    raise exception 'Both players must agree to rematch';
  end if;

  v_category := lower(trim(coalesce(nullif(p_category, ''), v_room.category)));
  if v_category not in ('all', 'pc', 'vc', 'hs', 'scenarios') then
    raise exception 'Invalid category';
  end if;

  if v_room.game_type = 'matching' and v_category = 'scenarios' then
    v_category := 'all';
  end if;

  v_rounds := case
    when v_room.game_type = 'matching' then 5
    else greatest(5, least(coalesce(v_room.rounds, 10), 50))
  end;

  v_new_room_id := public.create_1v1_room(v_room.game_type, v_category, coalesce(v_room.is_public, false), v_rounds);

  update public.room_players
  set
    slot_no = v_self.slot_no,
    is_ready = false,
    score = 0,
    total_time_ms = 0,
    fastest_round_ms = 0,
    current_round = 1,
    last_seen = now()
  where room_id = v_new_room_id
    and user_id = v_uid;

  insert into public.room_players (
    room_id,
    user_id,
    slot_no,
    is_ready,
    score,
    total_time_ms,
    fastest_round_ms,
    current_round,
    last_seen
  )
  values (
    v_new_room_id,
    v_opponent.user_id,
    v_opponent.slot_no,
    false,
    0,
    0,
    0,
    1,
    now()
  )
  on conflict (room_id, user_id)
  do update set
    slot_no = excluded.slot_no,
    is_ready = false,
    score = 0,
    total_time_ms = 0,
    fastest_round_ms = 0,
    current_round = 1,
    last_seen = now();

  update public.rooms
  set
    status = 'in_progress',
    current_round = 1,
    started_at = v_start_at,
    ended_at = null,
    winner_user_id = null,
    join_code = case when coalesce(is_public, false) then null else join_code end,
    updated_at = now()
  where id = v_new_room_id;

  update public.room_players
  set is_ready = false,
      last_seen = now()
  where room_id = p_room_id;

  update public.rooms
  set rematch_room_id = v_new_room_id,
      updated_at = now()
  where id = p_room_id;

  return v_new_room_id;
end;
$$;

create or replace function public.set_1v1_ready(
  p_room_id uuid,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_ready_count integer := 0;
  v_player_count integer := 0;
  v_started_room_id uuid;
  v_status text;
  v_started_at timestamptz;
  v_publish_for_spectators boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'completed' and v_room.rematch_room_id is not null then
    select started_at
    into v_started_at
    from public.rooms
    where id = v_room.rematch_room_id;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', true,
      'room_id', v_room.rematch_room_id,
      'started_at', v_started_at
    );
  end if;

  update public.room_players
  set
    is_ready = p_ready,
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid;

  if not found then
    raise exception 'Not in room';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  if v_room.status = 'waiting' and v_player_count = 2 and v_ready_count = 2 then
    if to_regclass('public.duel_invites') is not null then
      select exists (
        select 1
        from public.duel_invites di
        where di.room_id = p_room_id
      )
      into v_publish_for_spectators;
    end if;

    v_started_at := now() + interval '4 seconds';

    update public.rooms
    set
      status = 'in_progress',
      started_at = v_started_at,
      current_round = 1,
      is_public = case when v_publish_for_spectators then true else is_public end,
      join_code = case when v_publish_for_spectators then null else join_code end,
      updated_at = now()
    where id = p_room_id
      and status = 'waiting';

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', v_ready_count,
      'player_count', v_player_count,
      'rematch_started', false,
      'room_id', p_room_id,
      'started_at', v_started_at
    );
  end if;

  if v_room.status = 'completed' and v_player_count = 2 and v_ready_count = 2 then
    v_started_room_id := public.rematch_1v1_room(p_room_id, null);

    select started_at
    into v_started_at
    from public.rooms
    where id = v_started_room_id;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', true,
      'room_id', v_started_room_id,
      'started_at', v_started_at
    );
  end if;

  select status, started_at
  into v_status, v_started_at
  from public.rooms
  where id = p_room_id;

  return jsonb_build_object(
    'status', coalesce(v_status, v_room.status),
    'ready_count', v_ready_count,
    'player_count', v_player_count,
    'rematch_started', false,
    'room_id', p_room_id,
    'started_at', v_started_at
  );
end;
$$;

do $$
declare
  v_function_sql text;
  v_updated_sql text;
begin
  if to_regprocedure('public.submit_1v1_round(uuid, integer, boolean, integer, integer)') is not null then
    v_function_sql := pg_get_functiondef('public.submit_1v1_round(uuid, integer, boolean, integer, integer)'::regprocedure);
    v_updated_sql := replace(
      v_function_sql,
      'if v_room.started_at is null or now() < (v_room.started_at + interval ''3 seconds'') then',
      'if v_room.started_at is null or now() < v_room.started_at then'
    );
    if v_updated_sql <> v_function_sql then
      execute v_updated_sql;
    end if;
  end if;
end $$;

grant execute on function public.rematch_1v1_room(uuid, text) to authenticated;
grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated;
grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;

select pg_notify('pgrst', 'reload schema');


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260513_1v1_forfeit_and_invite_avatar_hardening.sql
-- -----------------------------------------------------------------------------

-- Harden 1v1 starts and forfeits:
-- - keep per-player finish timestamps available to the app
-- - prevent stale timers or very early broken starts from recording fake 0-0 wins
-- - return finished_at in 1v1 snapshots so clients stay in sync

alter table public.room_players
  add column if not exists fastest_round_ms bigint not null default 0,
  add column if not exists finished_at timestamptz;

create or replace function public.finish_1v1_room_by_score(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_winner uuid := null;
  v_results jsonb := '[]'::jsonb;
  v_row record;
  v_first record;
  v_second record;
begin
  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select ranked.* into v_first
  from (
    select
      rp.user_id,
      rp.score,
      rp.total_time_ms,
      coalesce(rp.finished_at, rp.last_seen, 'infinity'::timestamptz) as finish_norm,
      case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, finish_norm asc, rp.total_time_ms asc, fastest_norm asc
    limit 1
  ) ranked;

  select ranked.* into v_second
  from (
    select
      rp.user_id,
      rp.score,
      rp.total_time_ms,
      coalesce(rp.finished_at, rp.last_seen, 'infinity'::timestamptz) as finish_norm,
      case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end as fastest_norm
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rp.score desc, finish_norm asc, rp.total_time_ms asc, fastest_norm asc
    offset 1
    limit 1
  ) ranked;

  if v_first.user_id is null then
    raise exception 'No players found';
  elsif v_second.user_id is null then
    v_winner := v_first.user_id;
  elsif v_first.score <> v_second.score then
    v_winner := v_first.user_id;
  elsif v_first.finish_norm is distinct from v_second.finish_norm then
    v_winner := v_first.user_id;
  elsif v_first.total_time_ms <> v_second.total_time_ms then
    v_winner := v_first.user_id;
  elsif v_first.fastest_norm <> v_second.fastest_norm then
    v_winner := v_first.user_id;
  else
    v_winner := null;
  end if;

  delete from public.room_results where room_id = p_room_id;

  for v_row in
    select
      rp.user_id,
      rp.score,
      rp.total_time_ms,
      rp.fastest_round_ms,
      rp.finished_at,
      row_number() over (
        order by rp.score desc,
                 coalesce(rp.finished_at, rp.last_seen, 'infinity'::timestamptz) asc,
                 rp.total_time_ms asc,
                 case when rp.fastest_round_ms > 0 then rp.fastest_round_ms else 2147483647 end asc
      ) as rank_position
    from public.room_players rp
    where rp.room_id = p_room_id
    order by rank_position
  loop
    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (
      p_room_id,
      v_row.user_id,
      v_row.score,
      v_row.total_time_ms,
      case when v_winner is null then 1 else v_row.rank_position end,
      (v_winner is not null and v_row.user_id = v_winner)
    );
  end loop;

  update public.rooms
  set status = 'completed',
      winner_user_id = v_winner,
      ended_at = coalesce(ended_at, now()),
      current_round = coalesce(rounds, current_round),
      updated_at = now()
  where id = p_room_id;

  update public.room_players
  set is_ready = false
  where room_id = p_room_id;

  for v_row in
    select user_id, score, total_time_ms, fastest_round_ms, current_round, finished_at
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'user_id', v_row.user_id,
      'score', v_row.score,
      'total_time_ms', v_row.total_time_ms,
      'fastest_round_ms', v_row.fastest_round_ms,
      'current_round', v_row.current_round,
      'finished_at', v_row.finished_at
    ));
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', 'completed',
    'winner_user_id', v_winner,
    'players', v_results
  );
end;
$$;

revoke all on function public.finish_1v1_room_by_score(uuid) from public, anon, authenticated;

create or replace function public.submit_1v1_round(
  p_room_id uuid,
  p_round integer,
  p_correct boolean,
  p_elapsed_ms integer,
  p_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_points integer;
  v_elapsed bigint;
  v_rounds integer;
  v_players_finished integer;
  v_total_players integer;
  v_results jsonb := '[]'::jsonb;
  v_row record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'completed' then
    for v_row in
      select user_id, score, total_time_ms, fastest_round_ms, current_round, finished_at
      from public.room_players
      where room_id = p_room_id
      order by slot_no
    loop
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'user_id', v_row.user_id,
        'score', v_row.score,
        'total_time_ms', v_row.total_time_ms,
        'fastest_round_ms', v_row.fastest_round_ms,
        'current_round', v_row.current_round,
        'finished_at', v_row.finished_at
      ));
    end loop;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id,
      'players', v_results
    );
  end if;

  if v_room.status <> 'in_progress' then
    raise exception 'Room is not active';
  end if;

  if v_room.started_at is null or now() < v_room.started_at then
    raise exception 'Match countdown active';
  end if;

  if p_round is null or p_round < 1 then
    raise exception 'Invalid round';
  end if;

  v_rounds := greatest(1, coalesce(v_room.rounds, 1));
  v_elapsed := greatest(0, least(coalesce(p_elapsed_ms, 0), 300000));

  if v_room.game_type = 'matching' and p_correct and p_points is not null then
    v_points := greatest(0, least(p_points, 1000));
  else
    v_points := case when p_correct then 100 else 0 end;
  end if;

  update public.room_players
  set
    score = score + v_points,
    total_time_ms = total_time_ms + v_elapsed,
    fastest_round_ms = case
      when v_elapsed <= 0 then fastest_round_ms
      when fastest_round_ms <= 0 then v_elapsed
      else least(fastest_round_ms, v_elapsed)
    end,
    current_round = least(p_round + 1, v_rounds + 1),
    finished_at = case
      when p_round >= v_rounds then coalesce(finished_at, now())
      else finished_at
    end,
    last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid
    and current_round = p_round;

  if not found then
    raise exception 'Round already submitted or player not in room';
  end if;

  select count(*)::int,
         count(*) filter (where current_round > v_rounds)::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total_players = 2 and v_players_finished = 2 then
    return public.finish_1v1_room_by_score(p_room_id);
  end if;

  update public.rooms
  set current_round = greatest(current_round, least(p_round + 1, v_rounds)),
      updated_at = now()
  where id = p_room_id
    and status = 'in_progress';

  for v_row in
    select user_id, score, total_time_ms, fastest_round_ms, current_round, finished_at
    from public.room_players
    where room_id = p_room_id
    order by slot_no
  loop
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'user_id', v_row.user_id,
      'score', v_row.score,
      'total_time_ms', v_row.total_time_ms,
      'fastest_round_ms', v_row.fastest_round_ms,
      'current_round', v_row.current_round,
      'finished_at', v_row.finished_at
    ));
  end loop;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id),
    'players', v_results
  );
end;
$$;

grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated;

create or replace function public.forfeit_1v1_match(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_self public.room_players%rowtype;
  v_opponent public.room_players%rowtype;
  v_remaining_players integer := 0;
  v_players_finished integer := 0;
  v_total_players integer := 0;
  v_no_answers boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  select * into v_self
  from public.room_players
  where room_id = p_room_id
    and user_id = v_uid;

  if v_self.id is null then
    raise exception 'Not in room';
  end if;

  if v_room.status = 'waiting' then
    delete from public.room_players
    where room_id = p_room_id
      and user_id = v_uid;

    select count(*)::int into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    if v_remaining_players = 0 then
      update public.rooms
      set status = 'cancelled', ended_at = now(), updated_at = now()
      where id = p_room_id;
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', (select status from public.rooms where id = p_room_id),
      'winner_user_id', null
    );
  end if;

  if v_room.status <> 'in_progress' then
    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id
    );
  end if;

  select count(*)::int,
         count(*) filter (where current_round > greatest(1, coalesce(v_room.rounds, 1)))::int
  into v_total_players, v_players_finished
  from public.room_players
  where room_id = p_room_id;

  if v_self.current_round > greatest(1, coalesce(v_room.rounds, 1)) then
    if v_total_players = 2 and v_players_finished = 2 then
      return public.finish_1v1_room_by_score(p_room_id);
    end if;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', v_room.status,
      'winner_user_id', v_room.winner_user_id,
      'ignored', true,
      'reason', 'player_already_finished'
    );
  end if;

  select not exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and (
        rp.current_round > 1
        or rp.score <> 0
        or rp.total_time_ms <> 0
        or rp.fastest_round_ms <> 0
      )
  ) into v_no_answers;

  if v_room.started_at is not null
    and now() < v_room.started_at + interval '10 seconds'
    and v_no_answers
  then
    update public.rooms
    set status = 'cancelled',
        winner_user_id = null,
        ended_at = now(),
        current_round = 1,
        updated_at = now()
    where id = p_room_id;

    update public.room_players
    set is_ready = false,
        last_seen = now()
    where room_id = p_room_id;

    delete from public.room_results where room_id = p_room_id;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', 'cancelled',
      'winner_user_id', null,
      'ignored', true,
      'reason', 'early_no_answers'
    );
  end if;

  select * into v_opponent
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_uid
  order by slot_no
  limit 1;

  update public.room_players
  set current_round = greatest(current_round, v_room.rounds + 1),
      finished_at = coalesce(finished_at, now()),
      last_seen = now()
  where id = v_self.id;

  if v_opponent.id is not null then
    update public.room_players
    set current_round = greatest(current_round, v_room.rounds + 1),
        finished_at = coalesce(finished_at, now()),
        last_seen = now()
    where id = v_opponent.id;

    delete from public.room_results where room_id = p_room_id;

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_opponent.user_id, v_opponent.score, v_opponent.total_time_ms, 1, true);

    insert into public.room_results (room_id, user_id, score, total_time_ms, placement, is_winner)
    values (p_room_id, v_self.user_id, v_self.score, v_self.total_time_ms, 2, false);

    update public.rooms
    set status = 'completed',
        winner_user_id = v_opponent.user_id,
        ended_at = now(),
        current_round = v_room.rounds,
        updated_at = now()
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  else
    update public.rooms
    set status = 'cancelled',
        ended_at = now(),
        current_round = v_room.rounds,
        updated_at = now()
    where id = p_room_id;

    update public.room_players
    set is_ready = false
    where room_id = p_room_id;
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', (select status from public.rooms where id = p_room_id),
    'winner_user_id', (select winner_user_id from public.rooms where id = p_room_id)
  );
end;
$$;

grant execute on function public.forfeit_1v1_match(uuid) to authenticated;

create or replace function public.get_1v1_room_details(p_room_id uuid)
returns table (
  room jsonb,
  players jsonb,
  results jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    row_to_json(r)::jsonb as room,
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
  where r.id = p_room_id;
end;
$$;

grant execute on function public.get_1v1_room_details(uuid) to authenticated;

with broken_rooms as (
  select r.id
  from public.rooms r
  where r.status = 'completed'
    and r.started_at is not null
    and r.ended_at is not null
    and r.ended_at < r.started_at + interval '10 seconds'
    and exists (
      select 1
      from public.room_players rp
      where rp.room_id = r.id
      group by rp.room_id
      having count(*) = 2
        and bool_and(rp.score = 0)
        and bool_and(rp.total_time_ms = 0)
        and bool_and(rp.current_round > r.rounds)
    )
)
delete from public.room_results rr
using broken_rooms br
where rr.room_id = br.id;

with broken_rooms as (
  select r.id
  from public.rooms r
  where r.status = 'completed'
    and r.started_at is not null
    and r.ended_at is not null
    and r.ended_at < r.started_at + interval '10 seconds'
    and exists (
      select 1
      from public.room_players rp
      where rp.room_id = r.id
      group by rp.room_id
      having count(*) = 2
        and bool_and(rp.score = 0)
        and bool_and(rp.total_time_ms = 0)
        and bool_and(rp.current_round > r.rounds)
    )
)
update public.rooms r
set status = 'cancelled',
    winner_user_id = null,
    current_round = 1,
    updated_at = now()
from broken_rooms br
where r.id = br.id;

notify pgrst, 'reload schema';


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260513_1v1_rpc_execute_grant_hardening.sql
-- -----------------------------------------------------------------------------

-- Restrict 1v1 SECURITY DEFINER RPCs to signed-in users only.
-- The functions already check auth.uid(), but removing PUBLIC/anon execute keeps
-- the RPC surface aligned with the app's signed-in 1v1 flow.

revoke all on function public.create_1v1_invite(uuid, text, text, integer) from public, anon;
grant execute on function public.create_1v1_invite(uuid, text, text, integer) to authenticated, service_role;

revoke all on function public.respond_1v1_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_1v1_invite(uuid, boolean) to authenticated, service_role;

revoke all on function public.list_pending_1v1_invites() from public, anon;
grant execute on function public.list_pending_1v1_invites() to authenticated, service_role;

revoke all on function public.list_online_1v1_users(integer) from public, anon;
grant execute on function public.list_online_1v1_users(integer) to authenticated, service_role;

revoke all on function public.create_1v1_room(text, text, boolean) from public, anon;
grant execute on function public.create_1v1_room(text, text, boolean) to authenticated, service_role;

revoke all on function public.create_1v1_room(text, text, boolean, integer) from public, anon;
grant execute on function public.create_1v1_room(text, text, boolean, integer) to authenticated, service_role;

revoke all on function public.join_1v1_room(uuid, text) from public, anon;
grant execute on function public.join_1v1_room(uuid, text) to authenticated, service_role;

revoke all on function public.leave_1v1_room(uuid) from public, anon;
grant execute on function public.leave_1v1_room(uuid) to authenticated, service_role;

revoke all on function public.delete_1v1_room(uuid) from public, anon;
grant execute on function public.delete_1v1_room(uuid) to authenticated, service_role;

revoke all on function public.list_public_1v1_rooms() from public, anon;
grant execute on function public.list_public_1v1_rooms() to authenticated, service_role;

revoke all on function public.get_1v1_room_details(uuid) from public, anon;
grant execute on function public.get_1v1_room_details(uuid) to authenticated, service_role;

revoke all on function public.set_1v1_ready(uuid, boolean) from public, anon;
grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated, service_role;

revoke all on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) from public, anon;
grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated, service_role;

revoke all on function public.forfeit_1v1_match(uuid) from public, anon;
grant execute on function public.forfeit_1v1_match(uuid) to authenticated, service_role;

revoke all on function public.send_1v1_waiting_chat_message(uuid, text) from public, anon;
grant execute on function public.send_1v1_waiting_chat_message(uuid, text) to authenticated, service_role;

revoke all on function public.list_1v1_waiting_chat_messages(uuid, integer) from public, anon;
grant execute on function public.list_1v1_waiting_chat_messages(uuid, integer) to authenticated, service_role;

revoke all on function public.rematch_1v1_room(uuid, text) from public, anon;
grant execute on function public.rematch_1v1_room(uuid, text) to authenticated, service_role;

revoke all on function public.cleanup_inactive_1v1_rooms() from public, anon;
grant execute on function public.cleanup_inactive_1v1_rooms() to authenticated, service_role;

revoke all on function public.finish_1v1_room_by_score(uuid) from public, anon, authenticated;
grant execute on function public.finish_1v1_room_by_score(uuid) to service_role;

revoke all on function public.process_1v1_room_completion() from public, anon, authenticated;
grant execute on function public.process_1v1_room_completion() to service_role;

revoke all on function public.clear_1v1_ready_on_start() from public, anon, authenticated;
grant execute on function public.clear_1v1_ready_on_start() to service_role;

notify pgrst, 'reload schema';


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260513_fix_1v1_ready_start_in_place.sql
-- -----------------------------------------------------------------------------

-- Start 1v1 waiting rooms in place instead of handing both players to a new room.
-- The old handoff path could leave one or both clients stuck on "Syncing with opponent"
-- while following the cancelled lobby room to the fresh in-progress room.

create or replace function public.set_1v1_ready(p_room_id uuid, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_ready_count integer := 0;
  v_player_count integer := 0;
  v_started_room_id uuid;
  v_status text;
  v_started_at timestamptz;
  v_publish_for_spectators boolean := false;
  v_rounds integer := 10;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'completed' and v_room.rematch_room_id is not null then
    select count(*)::int
    into v_player_count
    from public.room_players
    where room_id = v_room.rematch_room_id;

    if v_player_count = 2 and exists (
      select 1
      from public.rooms r
      where r.id = v_room.rematch_room_id
        and r.status in ('waiting', 'in_progress')
    ) then
      select started_at
      into v_started_at
      from public.rooms
      where id = v_room.rematch_room_id;

      return jsonb_build_object(
        'status', 'in_progress',
        'ready_count', 2,
        'player_count', 2,
        'rematch_started', true,
        'room_id', v_room.rematch_room_id,
        'started_at', v_started_at
      );
    end if;

    update public.rooms
    set status = 'cancelled',
        ended_at = now(),
        updated_at = now()
    where id = v_room.rematch_room_id
      and status in ('waiting', 'in_progress');

    update public.rooms
    set rematch_room_id = null,
        updated_at = now()
    where id = p_room_id;

    update public.room_players
    set is_ready = false,
        last_seen = now()
    where room_id = p_room_id;

    select count(*)::int
    into v_player_count
    from public.room_players
    where room_id = p_room_id;

    return jsonb_build_object(
      'status', 'completed',
      'ready_count', 0,
      'player_count', v_player_count,
      'rematch_started', false,
      'rematch_cancelled', true,
      'room_id', p_room_id,
      'message', 'Opponent left the rematch. Rematch cancelled.'
    );
  end if;

  update public.room_players
  set is_ready = p_ready,
      last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid;

  if not found then
    raise exception 'Not in room';
  end if;

  select count(*)::int, count(*) filter (where is_ready)::int
  into v_player_count, v_ready_count
  from public.room_players
  where room_id = p_room_id;

  if v_room.status = 'waiting' and v_player_count = 2 and v_ready_count = 2 then
    if to_regclass('public.duel_invites') is not null then
      select exists (
        select 1
        from public.duel_invites di
        where di.room_id = p_room_id
      )
      into v_publish_for_spectators;
    end if;

    v_started_at := now() + interval '2 seconds';
    v_rounds := case
      when v_room.game_type = 'matching' then 5
      else greatest(5, least(coalesce(v_room.rounds, 10), 50))
    end;

    delete from public.room_results
    where room_id = p_room_id;

    update public.room_players
    set is_ready = false,
        score = 0,
        total_time_ms = 0,
        fastest_round_ms = 0,
        current_round = 1,
        finished_at = null,
        last_seen = now()
    where room_id = p_room_id;

    update public.rooms
    set status = 'in_progress',
        started_at = v_started_at,
        current_round = 1,
        rounds = v_rounds,
        is_public = coalesce(v_room.is_public, false) or v_publish_for_spectators,
        join_code = case when coalesce(v_room.is_public, false) or v_publish_for_spectators then null else join_code end,
        ended_at = null,
        winner_user_id = null,
        rematch_room_id = null,
        updated_at = now()
    where id = p_room_id;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', false,
      'room_id', p_room_id,
      'started_at', v_started_at
    );
  end if;

  if v_room.status = 'completed' and v_player_count = 2 and v_ready_count = 2 then
    v_started_room_id := public.rematch_1v1_room(p_room_id, null);

    select started_at
    into v_started_at
    from public.rooms
    where id = v_started_room_id;

    return jsonb_build_object(
      'status', 'in_progress',
      'ready_count', 2,
      'player_count', 2,
      'rematch_started', true,
      'room_id', v_started_room_id,
      'started_at', v_started_at
    );
  end if;

  select status, started_at
  into v_status, v_started_at
  from public.rooms
  where id = p_room_id;

  return jsonb_build_object(
    'status', coalesce(v_status, v_room.status),
    'ready_count', v_ready_count,
    'player_count', v_player_count,
    'rematch_started', false,
    'room_id', p_room_id,
    'started_at', v_started_at
  );
end;
$$;

revoke all on function public.set_1v1_ready(uuid, boolean) from public, anon;
grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';


-- -----------------------------------------------------------------------------
-- Historical migration folded into baseline: 20260513_preserve_1v1_completed_players.sql
-- -----------------------------------------------------------------------------

-- Keep completed/cancelled 1v1 player rows available for both clients.
-- Deleting a player row immediately after one client reached the result screen
-- made the other client more likely to miss the final completed snapshot.

create or replace function public.leave_1v1_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_remaining_players integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status = 'in_progress' then
    raise exception 'Cannot leave an active match. Use forfeit instead.';
  end if;

  if v_room.status = 'waiting' then
    delete from public.room_players
    where room_id = p_room_id
      and user_id = v_uid;

    select count(*)::int
    into v_remaining_players
    from public.room_players
    where room_id = p_room_id;

    if v_remaining_players = 0 then
      update public.rooms
      set status = 'cancelled',
          current_round = 1,
          started_at = null,
          winner_user_id = null,
          ended_at = now(),
          rematch_room_id = null,
          updated_at = now()
      where id = p_room_id;

      if to_regclass('public.duel_invites') is not null then
        update public.duel_invites
        set status = 'cancelled',
            responded_at = now()
        where room_id = p_room_id
          and status = 'pending';
      end if;

      return jsonb_build_object(
        'room_id', p_room_id,
        'status', 'cancelled',
        'player_count', 0
      );
    end if;

    update public.room_players
    set is_ready = false,
        score = 0,
        total_time_ms = 0,
        fastest_round_ms = 0,
        current_round = 1,
        finished_at = null,
        last_seen = now()
    where room_id = p_room_id;

    update public.rooms
    set status = 'waiting',
        current_round = 1,
        started_at = null,
        winner_user_id = null,
        ended_at = null,
        updated_at = now()
    where id = p_room_id;

    return jsonb_build_object(
      'room_id', p_room_id,
      'status', 'waiting',
      'player_count', v_remaining_players
    );
  end if;

  update public.room_players
  set is_ready = false,
      last_seen = now()
  where room_id = p_room_id
    and user_id = v_uid;

  update public.rooms
  set rematch_room_id = null,
      updated_at = now()
  where id = p_room_id;

  select count(*)::int
  into v_remaining_players
  from public.room_players
  where room_id = p_room_id;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', v_room.status,
    'player_count', v_remaining_players
  );
end;
$$;

revoke all on function public.leave_1v1_room(uuid) from public, anon;
grant execute on function public.leave_1v1_room(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';


-- -----------------------------------------------------------------------------
-- Final bootstrap grants for new Supabase projects.
-- RLS policies above still control row access; these grants expose the tables to
-- Supabase's Data API for anon/authenticated clients.
-- -----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
