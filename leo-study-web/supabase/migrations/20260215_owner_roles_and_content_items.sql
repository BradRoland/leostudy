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
