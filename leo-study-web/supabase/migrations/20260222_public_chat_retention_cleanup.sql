-- Automatically remove public chat messages older than 48 hours.
-- Runs hourly via pg_cron and keeps cleanup server-side.

create extension if not exists pg_cron with schema extensions;

create or replace function public.cleanup_public_messages_48h()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.public_messages
  where created_at < now() - interval '48 hours';

  get diagnostics v_deleted = row_count;
  raise notice 'public_messages cleanup removed % rows', v_deleted;
  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.cleanup_public_messages_48h() from public;
revoke all on function public.cleanup_public_messages_48h() from anon, authenticated;
grant execute on function public.cleanup_public_messages_48h() to service_role;

do $$
declare
  job_record record;
begin
  for job_record in
    select jobid
    from cron.job
    where jobname = 'public_chat_cleanup_48h_hourly'
  loop
    perform cron.unschedule(job_record.jobid);
  end loop;
exception
  when undefined_table then
    null;
end;
$$;

select cron.schedule(
  'public_chat_cleanup_48h_hourly',
  '0 * * * *',
  $$select public.cleanup_public_messages_48h();$$
);

comment on function public.cleanup_public_messages_48h() is
  'Deletes rows from public_messages older than 48 hours. Scheduled hourly by pg_cron.';
