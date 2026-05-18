create table if not exists public.banned_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_banned_users_created_at
  on public.banned_users (created_at desc);

alter table public.banned_users enable row level security;

drop policy if exists banned_users_select_self_or_owner on public.banned_users;
create policy banned_users_select_self_or_owner
on public.banned_users
for select
to authenticated
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
to authenticated
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

drop policy if exists banned_users_delete_owner_only on public.banned_users;
create policy banned_users_delete_owner_only
on public.banned_users
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

grant select on public.banned_users to authenticated;
grant insert, update, delete on public.banned_users to authenticated;
revoke all on public.banned_users from anon;

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

revoke all on function public.is_user_banned(uuid) from public, anon;
grant execute on function public.is_user_banned(uuid) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
