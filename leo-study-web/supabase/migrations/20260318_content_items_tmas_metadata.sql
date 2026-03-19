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
