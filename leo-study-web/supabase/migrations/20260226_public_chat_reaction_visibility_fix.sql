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
