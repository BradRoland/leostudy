-- Give Classes 181 and 182 the Class 180 department catalog.
-- The first active member in either enrollment class becomes its class admin.

with source_class as (
  select id
  from public.academy_classes
  where lower(trim(class_name)) = 'class 180'
  order by created_at
  limit 1
),
target_classes as (
  select id
  from public.academy_classes
  where lower(trim(class_name)) in ('class 181', 'class 182')
)
insert into public.class_departments (class_id, name, department_type, city, county)
select
  target_classes.id,
  source_departments.name,
  source_departments.department_type,
  source_departments.city,
  source_departments.county
from source_class
join public.class_departments source_departments
  on source_departments.class_id = source_class.id
cross join target_classes
on conflict (class_id, lower(name)) do update
set department_type = excluded.department_type,
    city = excluded.city,
    county = excluded.county;

create or replace function public.promote_first_current_class_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_name text;
begin
  if new.status <> 'active' or not new.is_active then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'active' and old.is_active then
      return new;
    end if;
  end if;

  -- Lock the class row until the membership transaction commits. Concurrent
  -- first joins serialize here, so exactly one member receives class_admin.
  select lower(trim(class_name))
  into v_class_name
  from public.academy_classes
  where id = new.class_id
  for update;

  if v_class_name not in ('class 181', 'class 182') then
    return new;
  end if;

  if not exists (
    select 1
    from public.class_memberships existing_membership
    where existing_membership.class_id = new.class_id
      and existing_membership.status = 'active'
      and existing_membership.is_active
      and existing_membership.id is distinct from new.id
  ) then
    new.role := 'class_admin';
  end if;

  return new;
end;
$$;

revoke all on function public.promote_first_current_class_member() from public, anon, authenticated;

drop trigger if exists trg_promote_first_current_class_member on public.class_memberships;
create trigger trg_promote_first_current_class_member
before insert or update of status, is_active on public.class_memberships
for each row execute function public.promote_first_current_class_member();

-- If somebody joined between the previous rollout and this migration, promote
-- the earliest active member unless the class already has an active admin.
with ranked_candidates as (
  select
    membership.id,
    row_number() over (
      partition by membership.class_id
      order by membership.joined_at, membership.created_at, membership.id
    ) as join_order
  from public.class_memberships membership
  join public.academy_classes class
    on class.id = membership.class_id
  where lower(trim(class.class_name)) in ('class 181', 'class 182')
    and membership.status = 'active'
    and membership.is_active
    and not exists (
      select 1
      from public.class_memberships existing_admin
      where existing_admin.class_id = membership.class_id
        and existing_admin.status = 'active'
        and existing_admin.is_active
        and existing_admin.role = 'class_admin'
    )
),
promoted_members as (
  update public.class_memberships membership
  set role = 'class_admin',
      updated_at = now()
  from ranked_candidates candidate
  where membership.id = candidate.id
    and candidate.join_order = 1
  returning membership.class_id, membership.user_id
)
insert into public.class_audit_events (class_id, actor_user_id, target_user_id, event_type, metadata)
select
  class_id,
  null,
  user_id,
  'first_member_promoted',
  jsonb_build_object('source', 'automatic_first_member_rule')
from promoted_members;

select pg_notify('pgrst', 'reload schema');
