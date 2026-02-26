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
