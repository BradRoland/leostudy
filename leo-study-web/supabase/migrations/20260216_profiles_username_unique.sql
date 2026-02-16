-- Enforce unique usernames (case-insensitive).
-- Required for correct behavior under concurrency (two users picking same name).

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

