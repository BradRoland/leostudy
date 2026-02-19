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
