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
