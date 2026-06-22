-- Class workspaces, invites, class-scoped chat, and class-scoped leaderboards.
-- DATA SAFETY: additive migration only. No deletes, truncates, or existing data resets.

create extension if not exists pgcrypto;

create table if not exists public.academies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default '',
  state text not null default 'CA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_classes (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  class_name text not null,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('pending', 'active', 'completed', 'archived', 'rejected')),
  visibility text not null default 'listed' check (visibility in ('listed', 'unlisted')),
  join_mode text not null default 'request_and_code' check (join_mode in ('request_only', 'code_only', 'request_and_code', 'closed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_departments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.academy_classes(id) on delete cascade,
  name text not null,
  department_type text not null default 'agency',
  city text not null default '',
  county text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.class_memberships (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.academy_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid references public.class_departments(id) on delete set null,
  role text not null default 'cadet' check (role in ('cadet', 'moderator', 'class_admin')),
  is_active boolean not null default false,
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, user_id)
);

create unique index if not exists class_memberships_one_active_per_user
  on public.class_memberships (user_id)
  where is_active and status = 'active';

create table if not exists public.class_invites (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.academy_classes(id) on delete cascade,
  token_hash text not null unique,
  code_hint text not null,
  role_granted text not null default 'cadet' check (role_granted in ('cadet', 'moderator', 'class_admin')),
  department_id uuid references public.class_departments(id) on delete set null,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  disabled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.class_join_requests (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.academy_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid references public.class_departments(id) on delete set null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'cancelled')),
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (class_id, user_id, status)
);

create table if not exists public.class_creation_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  academy_name text not null,
  academy_city text not null default '',
  academy_state text not null default 'CA',
  class_name text not null,
  start_date date,
  end_date date,
  departments text[] not null default '{}'::text[],
  requester_department text not null default '',
  requester_note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text not null default '',
  created_class_id uuid references public.academy_classes(id) on delete set null,
  created_invite_code text,
  discord_notified_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.class_messages (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.academy_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  department_name text,
  message text not null,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  source_public_message_id uuid unique
);

create table if not exists public.class_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.class_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create table if not exists public.class_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.class_messages(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  note text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.class_audit_events (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.academy_classes(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_academies_updated_at on public.academies;
create trigger trg_academies_updated_at before update on public.academies
for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_academy_classes_updated_at on public.academy_classes;
create trigger trg_academy_classes_updated_at before update on public.academy_classes
for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_class_memberships_updated_at on public.class_memberships;
create trigger trg_class_memberships_updated_at before update on public.class_memberships
for each row execute function public.set_timestamp_updated_at();

create unique index if not exists academies_name_city_state_key
  on public.academies (lower(name), lower(city), lower(state));
create unique index if not exists academy_classes_academy_name_key
  on public.academy_classes (academy_id, lower(class_name));
create unique index if not exists class_departments_class_name_key
  on public.class_departments (class_id, lower(name));
create index if not exists academy_classes_active_idx on public.academy_classes (status, visibility, end_date);
create index if not exists class_departments_class_idx on public.class_departments (class_id, name);
create index if not exists class_memberships_user_idx on public.class_memberships (user_id, status, is_active);
create index if not exists class_memberships_class_role_idx on public.class_memberships (class_id, role, status);
create index if not exists class_join_requests_class_status_idx on public.class_join_requests (class_id, status, created_at desc);
create index if not exists class_creation_requests_status_idx on public.class_creation_requests (status, created_at desc);
create index if not exists class_messages_class_created_idx on public.class_messages (class_id, created_at desc);
create index if not exists class_audit_events_class_created_idx on public.class_audit_events (class_id, created_at desc);

alter table public.academies enable row level security;
alter table public.academy_classes enable row level security;
alter table public.class_departments enable row level security;
alter table public.class_memberships enable row level security;
alter table public.class_invites enable row level security;
alter table public.class_join_requests enable row level security;
alter table public.class_creation_requests enable row level security;
alter table public.class_messages enable row level security;
alter table public.class_message_reactions enable row level security;
alter table public.class_message_reports enable row level security;
alter table public.class_audit_events enable row level security;

create or replace function public.class_invite_hash(p_code text)
returns text
language sql
stable
set search_path = public
as $$
  select encode(extensions.digest(convert_to(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.generate_class_invite_code(p_class_name text)
returns text
language sql
volatile
set search_path = public
as $$
  select upper(
    coalesce(nullif(regexp_replace(p_class_name, '[^a-zA-Z0-9]+', '', 'g'), ''), 'CLASS')
    || '-' ||
    substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 6)
  );
$$;

create or replace function public.is_owner(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'owner'
  );
$$;

create or replace function public.is_class_member(p_class_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner(p_user_id) or exists (
    select 1 from public.class_memberships
    where class_id = p_class_id and user_id = p_user_id and status = 'active'
  );
$$;

create or replace function public.is_class_admin(p_class_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner(p_user_id) or exists (
    select 1 from public.class_memberships
    where class_id = p_class_id
      and user_id = p_user_id
      and status = 'active'
      and role = 'class_admin'
  );
$$;

create or replace function public.can_moderate_class(p_class_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner(p_user_id) or exists (
    select 1 from public.class_memberships
    where class_id = p_class_id
      and user_id = p_user_id
      and status = 'active'
      and role in ('class_admin', 'moderator')
  );
$$;

create or replace function public.get_active_class_id(p_user_id uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select class_id from public.class_memberships
  where user_id = p_user_id and status = 'active' and is_active
  order by joined_at desc
  limit 1;
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'academies' and policyname = 'academies_read_all') then
    create policy academies_read_all on public.academies for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'academy_classes' and policyname = 'academy_classes_read_all') then
    create policy academy_classes_read_all on public.academy_classes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_departments' and policyname = 'class_departments_read_all') then
    create policy class_departments_read_all on public.class_departments for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_memberships' and policyname = 'class_memberships_read_related') then
    create policy class_memberships_read_related on public.class_memberships for select to authenticated
      using (user_id = auth.uid() or public.is_class_admin(class_id, auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_creation_requests' and policyname = 'class_creation_requests_insert_self') then
    create policy class_creation_requests_insert_self on public.class_creation_requests for insert to authenticated
      with check (requester_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_creation_requests' and policyname = 'class_creation_requests_read_owner_or_self') then
    create policy class_creation_requests_read_owner_or_self on public.class_creation_requests for select to authenticated
      using (requester_user_id = auth.uid() or public.is_owner(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_creation_requests' and policyname = 'class_creation_requests_update_owner') then
    create policy class_creation_requests_update_owner on public.class_creation_requests for update to authenticated
      using (public.is_owner(auth.uid())) with check (public.is_owner(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_invites' and policyname = 'class_invites_read_admin') then
    create policy class_invites_read_admin on public.class_invites for select to authenticated
      using (public.is_class_admin(class_id, auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_invites' and policyname = 'class_invites_write_admin') then
    create policy class_invites_write_admin on public.class_invites for all to authenticated
      using (public.is_class_admin(class_id, auth.uid())) with check (public.is_class_admin(class_id, auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_join_requests' and policyname = 'class_join_requests_insert_self') then
    create policy class_join_requests_insert_self on public.class_join_requests for insert to authenticated
      with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_join_requests' and policyname = 'class_join_requests_read_self_or_admin') then
    create policy class_join_requests_read_self_or_admin on public.class_join_requests for select to authenticated
      using (user_id = auth.uid() or public.is_class_admin(class_id, auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_join_requests' and policyname = 'class_join_requests_update_admin') then
    create policy class_join_requests_update_admin on public.class_join_requests for update to authenticated
      using (public.is_class_admin(class_id, auth.uid())) with check (public.is_class_admin(class_id, auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_messages' and policyname = 'class_messages_read_members') then
    create policy class_messages_read_members on public.class_messages for select to authenticated
      using (public.is_class_member(class_id, auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_messages' and policyname = 'class_messages_insert_members') then
    create policy class_messages_insert_members on public.class_messages for insert to authenticated
      with check (user_id = auth.uid() and public.is_class_member(class_id, auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_messages' and policyname = 'class_messages_update_moderators') then
    create policy class_messages_update_moderators on public.class_messages for update to authenticated
      using (public.can_moderate_class(class_id, auth.uid())) with check (public.can_moderate_class(class_id, auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_message_reactions' and policyname = 'class_message_reactions_read_members') then
    create policy class_message_reactions_read_members on public.class_message_reactions for select to authenticated
      using (exists (select 1 from public.class_messages m where m.id = message_id and public.is_class_member(m.class_id, auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_message_reactions' and policyname = 'class_message_reactions_insert_own') then
    create policy class_message_reactions_insert_own on public.class_message_reactions for insert to authenticated
      with check (user_id = auth.uid() and exists (select 1 from public.class_messages m where m.id = message_id and public.is_class_member(m.class_id, auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_message_reactions' and policyname = 'class_message_reactions_delete_own') then
    create policy class_message_reactions_delete_own on public.class_message_reactions for delete to authenticated
      using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_message_reports' and policyname = 'class_message_reports_insert_self') then
    create policy class_message_reports_insert_self on public.class_message_reports for insert to authenticated
      with check (reporter_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_message_reports' and policyname = 'class_message_reports_read_moderators') then
    create policy class_message_reports_read_moderators on public.class_message_reports for select to authenticated
      using (exists (select 1 from public.class_messages m where m.id = message_id and public.can_moderate_class(m.class_id, auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_audit_events' and policyname = 'class_audit_events_read_admins') then
    create policy class_audit_events_read_admins on public.class_audit_events for select to authenticated
      using (class_id is null and public.is_owner(auth.uid()) or public.is_class_admin(class_id, auth.uid()));
  end if;
end $$;

grant select on public.academies, public.academy_classes, public.class_departments to anon, authenticated;
grant select, insert, update on public.class_memberships to authenticated;
grant select, insert, update on public.class_invites to authenticated;
grant select, insert, update on public.class_join_requests to authenticated;
grant select, insert, update on public.class_creation_requests to authenticated;
grant select, insert, update on public.class_messages to authenticated;
grant select, insert, delete on public.class_message_reactions to authenticated;
grant select, insert, update on public.class_message_reports to authenticated;
grant select, insert on public.class_audit_events to authenticated;

do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.leaderboard'::regclass and attname = 'class_id') then
    alter table public.leaderboard add column class_id uuid references public.academy_classes(id) on delete set null;
  end if;
  if to_regclass('public.weekly_leaderboard') is not null and not exists (select 1 from pg_attribute where attrelid = 'public.weekly_leaderboard'::regclass and attname = 'class_id') then
    alter table public.weekly_leaderboard add column class_id uuid references public.academy_classes(id) on delete set null;
  end if;
  if to_regclass('public.game_attempt_history') is not null and not exists (select 1 from pg_attribute where attrelid = 'public.game_attempt_history'::regclass and attname = 'class_id') then
    alter table public.game_attempt_history add column class_id uuid references public.academy_classes(id) on delete set null;
  end if;
  if to_regclass('public.duel_player_stats') is not null and not exists (select 1 from pg_attribute where attrelid = 'public.duel_player_stats'::regclass and attname = 'class_id') then
    alter table public.duel_player_stats add column class_id uuid references public.academy_classes(id) on delete set null;
  end if;
end $$;

with academy as (
  insert into public.academies (name, city, state)
  values ('Police Academy 180', '', 'CA')
  on conflict (lower(name), lower(city), lower(state)) do update set updated_at = now()
  returning id
),
class_180 as (
  insert into public.academy_classes (academy_id, class_name, status, visibility, join_mode)
  select id, 'Class 180', 'active', 'listed', 'request_and_code' from academy
  on conflict (academy_id, lower(class_name)) do update set status = 'active', visibility = 'listed', updated_at = now()
  returning id
),
department as (
  insert into public.class_departments (class_id, name, department_type)
  select id, 'Unassigned', 'agency' from class_180
  on conflict (class_id, lower(name)) do update set name = excluded.name
  returning id, class_id
)
insert into public.class_memberships (class_id, user_id, department_id, role, is_active, status)
select department.class_id, p.user_id, department.id, 'cadet', true, 'active'
from public.profiles p
cross join department
on conflict (class_id, user_id) do update
set status = 'active',
    is_active = coalesce(public.class_memberships.is_active, true),
    department_id = coalesce(public.class_memberships.department_id, excluded.department_id);

update public.leaderboard
set class_id = (select id from public.academy_classes where class_name = 'Class 180' limit 1)
where class_id is null;

update public.weekly_leaderboard
set class_id = (select id from public.academy_classes where class_name = 'Class 180' limit 1)
where class_id is null;

update public.game_attempt_history
set class_id = (select id from public.academy_classes where class_name = 'Class 180' limit 1)
where class_id is null;

update public.duel_player_stats
set class_id = (select id from public.academy_classes where class_name = 'Class 180' limit 1)
where class_id is null;

insert into public.class_messages (class_id, user_id, display_name, department_name, message, created_at, is_deleted, deleted_at, deleted_by, source_public_message_id)
select
  (select id from public.academy_classes where class_name = 'Class 180' limit 1),
  pm.user_id,
  pm.display_name,
  pm.agency,
  pm.message,
  pm.created_at,
  pm.is_deleted,
  pm.deleted_at,
  pm.deleted_by,
  pm.id
from public.public_messages pm
where (select id from public.academy_classes where class_name = 'Class 180' limit 1) is not null
on conflict (source_public_message_id) do nothing;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'unique_user_game_duration_filter' and conrelid = 'public.leaderboard'::regclass) then
    alter table public.leaderboard drop constraint unique_user_game_duration_filter;
  end if;
end $$;

create unique index if not exists leaderboard_class_user_game_duration_filter_key
  on public.leaderboard (class_id, user_id, game, match_duration, match_filter);

drop index if exists weekly_leaderboard_user_game_week_mode_key;
create unique index if not exists weekly_leaderboard_class_user_game_week_mode_key
  on public.weekly_leaderboard (class_id, user_id, game, week_start, match_duration, match_filter);

create index if not exists idx_leaderboard_class_game_score on public.leaderboard (class_id, game, score desc, round desc, created_at desc);
create index if not exists idx_weekly_leaderboard_class_week_score on public.weekly_leaderboard (class_id, week_start desc, game, score desc, round desc, updated_at desc);
create index if not exists idx_game_attempt_history_class_user_created on public.game_attempt_history (class_id, user_id, created_at desc);
create index if not exists idx_duel_player_stats_class_type_wins on public.duel_player_stats (class_id, game_type, wins desc, updated_at desc);

create or replace function public.upsert_leaderboard(
  p_user_id uuid,
  p_game text,
  p_match_duration int,
  p_match_filter text,
  p_score int,
  p_round int
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_class_id uuid := public.get_active_class_id(p_user_id);
begin
  insert into public.leaderboard (class_id, user_id, game, match_duration, match_filter, score, round)
  values (v_class_id, p_user_id, p_game, p_match_duration, p_match_filter, p_score, p_round)
  on conflict (class_id, user_id, game, match_duration, match_filter)
  do update set score = greatest(public.leaderboard.score, excluded.score),
                round = excluded.round,
                created_at = now();
end;
$$;

create or replace function public.set_active_class(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.class_memberships
    where class_id = p_class_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'You are not a member of this class';
  end if;
  update public.class_memberships set is_active = false where user_id = auth.uid();
  update public.class_memberships set is_active = true where user_id = auth.uid() and class_id = p_class_id;
end;
$$;

create or replace function public.request_class_creation(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  insert into public.class_creation_requests (
    requester_user_id,
    academy_name,
    academy_city,
    academy_state,
    class_name,
    start_date,
    end_date,
    departments,
    requester_department,
    requester_note
  )
  values (
    auth.uid(),
    trim(coalesce(p_payload->>'academyName', '')),
    trim(coalesce(p_payload->>'academyCity', '')),
    upper(trim(coalesce(p_payload->>'academyState', 'CA'))),
    trim(coalesce(p_payload->>'className', '')),
    nullif(p_payload->>'startDate', '')::date,
    nullif(p_payload->>'endDate', '')::date,
    coalesce(array(select distinct trim(value) from jsonb_array_elements_text(coalesce(p_payload->'departments', '[]'::jsonb)) as value where trim(value) <> ''), '{}'::text[]),
    trim(coalesce(p_payload->>'requesterDepartment', '')),
    trim(coalesce(p_payload->>'requesterNote', ''))
  )
  returning id into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.owner_approve_class_creation_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.class_creation_requests%rowtype;
  v_academy_id uuid;
  v_class_id uuid;
  v_department_name text;
  v_requester_department_id uuid;
  v_invite_code text;
begin
  if not public.is_owner(auth.uid()) then
    raise exception 'Owner role required';
  end if;
  select * into v_request from public.class_creation_requests where id = p_request_id for update;
  if not found then raise exception 'Class request not found'; end if;
  if v_request.status <> 'pending' then raise exception 'Class request already decided'; end if;

  insert into public.academies (name, city, state)
  values (v_request.academy_name, v_request.academy_city, v_request.academy_state)
  on conflict (lower(name), lower(city), lower(state)) do update set updated_at = now()
  returning id into v_academy_id;

  insert into public.academy_classes (academy_id, class_name, start_date, end_date, status, visibility, join_mode, created_by)
  values (v_academy_id, v_request.class_name, v_request.start_date, v_request.end_date, 'active', 'listed', 'request_and_code', v_request.requester_user_id)
  on conflict (academy_id, lower(class_name)) do update
    set start_date = excluded.start_date,
        end_date = excluded.end_date,
        status = 'active',
        visibility = 'listed',
        updated_at = now()
  returning id into v_class_id;

  foreach v_department_name in array coalesce(v_request.departments, '{}'::text[]) loop
    if trim(v_department_name) <> '' then
      insert into public.class_departments (class_id, name)
      values (v_class_id, trim(v_department_name))
      on conflict (class_id, lower(name)) do nothing;
    end if;
  end loop;

  insert into public.class_departments (class_id, name)
  values (v_class_id, coalesce(nullif(v_request.requester_department, ''), 'Unassigned'))
  on conflict (class_id, lower(name)) do update set name = excluded.name
  returning id into v_requester_department_id;

  update public.class_memberships set is_active = false where user_id = v_request.requester_user_id;
  insert into public.class_memberships (class_id, user_id, department_id, role, is_active, status)
  values (v_class_id, v_request.requester_user_id, v_requester_department_id, 'class_admin', true, 'active')
  on conflict (class_id, user_id) do update
    set role = 'class_admin',
        department_id = excluded.department_id,
        status = 'active',
        is_active = true;

  v_invite_code := public.generate_class_invite_code(v_request.class_name);
  insert into public.class_invites (class_id, token_hash, code_hint, role_granted, created_by)
  values (v_class_id, public.class_invite_hash(v_invite_code), right(v_invite_code, 4), 'cadet', auth.uid());

  update public.class_creation_requests
  set status = 'approved',
      decided_by = auth.uid(),
      decided_at = now(),
      created_class_id = v_class_id,
      created_invite_code = v_invite_code
  where id = p_request_id;

  insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
  values (v_class_id, auth.uid(), v_request.requester_user_id, 'class_request_approved', jsonb_build_object('requestId', p_request_id, 'inviteCode', v_invite_code));

  return jsonb_build_object('classId', v_class_id, 'inviteCode', v_invite_code);
end;
$$;

create or replace function public.owner_reject_class_creation_request(p_request_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner(auth.uid()) then raise exception 'Owner role required'; end if;
  update public.class_creation_requests
  set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(p_reason, '')
  where id = p_request_id and status = 'pending';
end;
$$;

create or replace function public.create_class_invite(
  p_class_id uuid,
  p_role text default 'cadet',
  p_department_id uuid default null,
  p_max_uses int default null,
  p_expires_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_name text;
  v_code text;
begin
  if not public.is_class_admin(p_class_id, auth.uid()) then raise exception 'Class admin role required'; end if;
  if p_role not in ('cadet', 'moderator', 'class_admin') then raise exception 'Unsupported invite role'; end if;
  select class_name into v_class_name from public.academy_classes where id = p_class_id;
  v_code := public.generate_class_invite_code(v_class_name);
  insert into public.class_invites (class_id, token_hash, code_hint, role_granted, department_id, max_uses, expires_at, created_by)
  values (p_class_id, public.class_invite_hash(v_code), right(v_code, 4), p_role, p_department_id, p_max_uses, p_expires_at, auth.uid());
  insert into public.class_audit_events (class_id, actor_user_id, event_type, metadata)
  values (p_class_id, auth.uid(), 'invite_created', jsonb_build_object('role', p_role));
  return v_code;
end;
$$;

create or replace function public.accept_class_invite(p_code text, p_department_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.class_invites%rowtype;
  v_department_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_invite from public.class_invites
  where token_hash = public.class_invite_hash(p_code)
  for update;
  if not found then raise exception 'Invite not found'; end if;
  if v_invite.disabled_at is not null then raise exception 'Invite is disabled'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then raise exception 'Invite has expired'; end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then raise exception 'Invite has no uses remaining'; end if;

  v_department_id := coalesce(v_invite.department_id, p_department_id);
  update public.class_memberships set is_active = false where user_id = auth.uid();
  insert into public.class_memberships (class_id, user_id, department_id, role, is_active, status)
  values (v_invite.class_id, auth.uid(), v_department_id, v_invite.role_granted, true, 'active')
  on conflict (class_id, user_id) do update
    set department_id = coalesce(excluded.department_id, public.class_memberships.department_id),
        role = case
          when public.class_memberships.role = 'class_admin' then 'class_admin'
          else excluded.role
        end,
        status = 'active',
        is_active = true;
  update public.class_invites set use_count = use_count + 1 where id = v_invite.id;
  insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
  values (v_invite.class_id, auth.uid(), auth.uid(), 'invite_accepted', jsonb_build_object('inviteId', v_invite.id));
  return v_invite.class_id;
end;
$$;

create or replace function public.request_to_join_class(p_class_id uuid, p_department_id uuid default null, p_note text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.class_memberships where class_id = p_class_id and user_id = auth.uid() and status = 'active') then
    raise exception 'You are already in this class';
  end if;
  insert into public.class_join_requests (class_id, user_id, department_id, note)
  values (p_class_id, auth.uid(), p_department_id, coalesce(p_note, ''))
  on conflict (class_id, user_id, status) do update set note = excluded.note, department_id = excluded.department_id
  returning id into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.approve_class_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.class_join_requests%rowtype;
begin
  select * into v_request from public.class_join_requests where id = p_request_id for update;
  if not found then raise exception 'Join request not found'; end if;
  if not public.is_class_admin(v_request.class_id, auth.uid()) then raise exception 'Class admin role required'; end if;
  update public.class_memberships set is_active = false where user_id = v_request.user_id;
  insert into public.class_memberships (class_id, user_id, department_id, role, is_active, status)
  values (v_request.class_id, v_request.user_id, v_request.department_id, 'cadet', true, 'active')
  on conflict (class_id, user_id) do update
    set department_id = excluded.department_id, status = 'active', is_active = true;
  update public.class_join_requests set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = p_request_id;
  insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
  values (v_request.class_id, auth.uid(), v_request.user_id, 'join_request_approved', jsonb_build_object('requestId', p_request_id));
end;
$$;

create or replace function public.deny_class_join_request(p_request_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.class_join_requests%rowtype;
begin
  select * into v_request from public.class_join_requests where id = p_request_id for update;
  if not found then raise exception 'Join request not found'; end if;
  if not public.is_class_admin(v_request.class_id, auth.uid()) then raise exception 'Class admin role required'; end if;
  update public.class_join_requests
  set status = 'denied', decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(p_reason, '')
  where id = p_request_id;
end;
$$;

create or replace function public.class_moderate_message(p_message_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
begin
  select class_id into v_class_id from public.class_messages where id = p_message_id;
  if not found then raise exception 'Message not found'; end if;
  if not public.can_moderate_class(v_class_id, auth.uid()) then raise exception 'Class moderator role required'; end if;
  if p_action <> 'delete' then raise exception 'Unsupported moderation action'; end if;
  update public.class_messages
  set is_deleted = true, deleted_at = now(), deleted_by = auth.uid(), message = '[Message deleted]'
  where id = p_message_id;
end;
$$;

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
  perform public.upsert_weekly_leaderboard(
    p_user_id,
    p_game,
    p_week_start,
    p_match_duration,
    p_match_filter,
    p_score,
    p_round,
    p_attempted_at,
    public.get_active_class_id(p_user_id)
  );
end;
$$;

create or replace function public.upsert_weekly_leaderboard(
  p_user_id uuid,
  p_game text,
  p_week_start timestamptz,
  p_match_duration int,
  p_match_filter text,
  p_score int,
  p_round int,
  p_attempted_at timestamptz default now(),
  p_class_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_class_id uuid := coalesce(p_class_id, public.get_active_class_id(p_user_id));
begin
  insert into public.weekly_leaderboard (
    class_id, user_id, game, week_start, match_duration, match_filter, score, round, created_at, updated_at
  )
  values (
    v_class_id, p_user_id, p_game, p_week_start, p_match_duration, p_match_filter,
    greatest(0, coalesce(p_score, 0)), greatest(0, coalesce(p_round, 0)),
    coalesce(p_attempted_at, now()), coalesce(p_attempted_at, now())
  )
  on conflict (class_id, user_id, game, week_start, match_duration, match_filter)
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

grant execute on function public.set_active_class(uuid) to authenticated;
grant execute on function public.request_class_creation(jsonb) to authenticated;
grant execute on function public.owner_approve_class_creation_request(uuid) to authenticated;
grant execute on function public.owner_reject_class_creation_request(uuid, text) to authenticated;
grant execute on function public.create_class_invite(uuid, text, uuid, int, timestamptz) to authenticated;
grant execute on function public.accept_class_invite(text, uuid) to authenticated;
grant execute on function public.request_to_join_class(uuid, uuid, text) to authenticated;
grant execute on function public.approve_class_join_request(uuid) to authenticated;
grant execute on function public.deny_class_join_request(uuid, text) to authenticated;
grant execute on function public.class_moderate_message(uuid, text) to authenticated;
grant execute on function public.upsert_weekly_leaderboard(uuid, text, timestamptz, int, text, int, int, timestamptz, uuid) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.class_creation_requests; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.class_join_requests; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.class_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.class_message_reactions; exception when duplicate_object then null; end;
end $$;
