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
