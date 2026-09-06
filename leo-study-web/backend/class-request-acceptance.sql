-- Run only against a disposable staging database. Every test row rolls back.
begin;
create function pg_temp.assert_true(ok boolean, description text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %', description; end if; end;
$$;
create temporary table workflow_fixture(name text primary key, id uuid);
create temporary table workflow_codes(name text primary key, code text);
create temporary table workflow_before as select
  (select count(*) from public.class_memberships) memberships,
  (select count(*) from public.profiles) profiles,
  (select count(*) from public.academy_classes) classes;
grant select, insert, update on workflow_fixture to authenticated, service_role;
grant select, insert on workflow_codes to authenticated;
insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
values
('e1800000-0000-4000-8000-000000000001', 'workflow-owner@example.test', '{"full_name":"Workflow Owner"}', '{}', 'authenticated', 'authenticated'),
('e1800000-0000-4000-8000-000000000002', 'workflow-requester@example.test', '{"full_name":"Workflow Cadet"}', '{}', 'authenticated', 'authenticated'),
('e1800000-0000-4000-8000-000000000003', 'workflow-peer@example.test', '{}', '{}', 'authenticated', 'authenticated');
insert into public.user_roles(user_id, role) values ('e1800000-0000-4000-8000-000000000001', 'owner');
insert into workflow_fixture(name,id) select 'existing',id from public.academy_classes
  where status='active' and visibility='listed' and (end_date is null or end_date>=current_date) order by class_name limit 1;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1800000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into workflow_codes values ('existing',public.create_class_invite((select id from workflow_fixture where name='existing'),'cadet'));
select set_config('request.jwt.claims', '{"sub":"e1800000-0000-4000-8000-000000000002","role":"authenticated","email":"forged@example.test"}', true);
insert into workflow_fixture(name,id) values ('request', public.request_class_creation(jsonb_build_object(
  'academyName','Workflow Test Academy','academyCity','Test City','academyState','CA','className','Class 999 Workflow',
  'startDate',current_date::text,'endDate',(current_date+180)::text,'departments',jsonb_build_array('Test PD','Test SO','test pd'),
  'requesterDepartment','Test PD','requesterNote','Acceptance test')));
select pg_temp.assert_true((select requester_email = 'workflow-requester@example.test' from public.class_creation_requests where id=(select id from workflow_fixture where name='request')), 'request identity comes from auth user, not forged email claims');
select pg_temp.assert_true((select array_length(departments,1)=2 from public.class_creation_requests where id=(select id from workflow_fixture where name='request')), 'department names deduplicate case-insensitively');
select pg_temp.assert_true(not exists(select 1 from public.class_memberships where user_id='e1800000-0000-4000-8000-000000000002'), 'pending requester has no class access');
select pg_temp.assert_true(public.request_class_creation(jsonb_build_object(
  'academyName','Workflow Test Academy','className','Class 999 Workflow','startDate',current_date::text,
  'endDate',(current_date+180)::text,'departments',jsonb_build_array('Test PD')))=(select id from workflow_fixture where name='request'), 'request retry returns the same request');
do $$ begin
  begin
    perform public.join_class_directly((select id from workflow_fixture where name='existing'),null);
    raise exception 'FAILED: pending requester joined directly';
  exception when others then if sqlerrm not like '%awaiting owner approval%' then raise; end if; end;
  begin
    perform public.accept_class_invite((select code from workflow_codes where name='existing'),null);
    raise exception 'FAILED: pending requester joined through invite';
  exception when others then if sqlerrm not like '%awaiting owner approval%' then raise; end if; end;
  begin
    perform public.owner_approve_class_creation_request((select id from workflow_fixture where name='request'));
    raise exception 'FAILED: requester approved own class';
  exception when others then if sqlerrm not like '%Owner role required%' then raise; end if; end;
  begin
    perform * from public.class_request_email_outbox;
    raise exception 'FAILED: requester accessed private delivery records';
  exception when insufficient_privilege then null; end;
  begin
    update public.class_creation_requests set status='approved' where id=(select id from workflow_fixture where name='request');
    raise exception 'FAILED: requester directly changed approval status';
  exception when insufficient_privilege then null; end;
  begin
    perform public.request_class_creation(jsonb_build_object('academyName','Bad Academy','className','Bad Class','startDate',current_date::text,'endDate',(current_date-1)::text,'departments',jsonb_build_array('Test PD')));
    raise exception 'FAILED: inverted dates accepted';
  exception when others then if sqlerrm not like '%Graduation must%' then raise; end if; end;
end; $$;

select set_config('request.jwt.claims', '{"sub":"e1800000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.assert_true(not exists(select 1 from public.class_creation_requests where id=(select id from workflow_fixture where name='request')), 'another user cannot read the request');

select set_config('request.jwt.claims', '{"sub":"e1800000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into workflow_fixture(name,id) values ('class', (public.owner_approve_class_creation_request((select id from workflow_fixture where name='request'))->>'classId')::uuid);
select pg_temp.assert_true((public.owner_approve_class_creation_request((select id from workflow_fixture where name='request'))->>'classId')::uuid=(select id from workflow_fixture where name='class'), 'approval retry returns the same class');
select pg_temp.assert_true(public.is_current_enrollment_class((select id from workflow_fixture where name='class')), 'new class outside old allowlist is eligible');
select pg_temp.assert_true(exists(select 1 from public.class_memberships where class_id=(select id from workflow_fixture where name='class') and user_id='e1800000-0000-4000-8000-000000000002' and role='class_admin' and status='active'), 'requester becomes class administrator');
select pg_temp.assert_true(not exists(select 1 from public.academy_classes where lower(class_name)='class 180' and public.is_current_enrollment_class(id)), 'retired Class 180 stays closed');

select set_config('request.jwt.claims', '{"sub":"e1800000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.request_class_creation(jsonb_build_object('academyName','Workflow Additional Academy','className','Workflow Next Class',
  'startDate',current_date::text,'endDate',(current_date+365)::text,'departments',jsonb_build_array('Test PD')));
select pg_temp.assert_true(public.join_class_directly((select id from workflow_fixture where name='class'),(select id from public.class_departments where class_id=(select id from workflow_fixture where name='class') and name='Test PD'))=(select id from workflow_fixture where name='class'), 'existing member can retain class access while requesting an additional class');
select pg_temp.assert_true(exists(select 1 from public.class_memberships where class_id=(select id from workflow_fixture where name='class') and user_id='e1800000-0000-4000-8000-000000000002' and role='class_admin' and is_active), 'additional pending request preserves active admin membership');

-- Normal new accounts can join an approved class, with department isolation.
select set_config('request.jwt.claims', '{"sub":"e1800000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.join_class_directly((select id from workflow_fixture where name='class'), (select id from public.class_departments where class_id <> (select id from workflow_fixture where name='class') limit 1));
    raise exception 'FAILED: foreign department accepted';
  exception when others then if sqlerrm not like '%Choose a department in this class%' then raise; end if; end;
end; $$;
select pg_temp.assert_true(public.join_class_directly((select id from workflow_fixture where name='class'),(select id from public.class_departments where class_id=(select id from workflow_fixture where name='class') and name='Test SO'))=(select id from workflow_fixture where name='class'), 'peer joins newly approved class');
select pg_temp.assert_true(exists(select 1 from public.class_memberships where user_id='e1800000-0000-4000-8000-000000000003' and class_id=(select id from workflow_fixture where name='class') and role='cadet'), 'joining peer does not become administrator');
select public.request_class_creation(jsonb_build_object('academyName','Existing Member Test Academy','className','Existing Member Next Class',
  'startDate',current_date::text,'endDate',(current_date+365)::text,'departments',jsonb_build_array('Test PD')));

reset role;
select pg_temp.assert_true((select raw_user_meta_data->>'academy_onboarding_version'='1' and raw_user_meta_data->>'full_name'='Workflow Cadet' from auth.users where id='e1800000-0000-4000-8000-000000000002'), 'unclassed requester onboarding marker commits atomically and original metadata is preserved');
select pg_temp.assert_true((select not (raw_user_meta_data ? 'academy_onboarding_version') from auth.users where id='e1800000-0000-4000-8000-000000000003'), 'existing member requesting an additional class is not forced into onboarding');
-- A legacy/conflicting request must not overwrite an existing class or promote
-- its requester into that class. Service insertion simulates a preexisting row.
with duplicate_request as (
  insert into public.class_creation_requests(requester_user_id, requester_name, requester_email, academy_name, academy_city, academy_state, class_name, start_date, end_date, departments, requester_department)
  values('e1800000-0000-4000-8000-000000000003','Workflow Peer','workflow-peer@example.test','Workflow Test Academy','Test City','CA','Class 999 Workflow',current_date,current_date+180,array['Test PD'],'Test PD') returning id
) insert into workflow_fixture(name,id) select 'duplicate', id from duplicate_request;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1800000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.owner_approve_class_creation_request((select id from workflow_fixture where name='duplicate'));
    raise exception 'FAILED: conflicting request overwrote existing class';
  exception when others then if sqlerrm not like '%already exists%' then raise; end if; end;
end; $$;
select public.owner_reject_class_creation_request((select id from workflow_fixture where name='duplicate'),'Please use the existing class.');
select pg_temp.assert_true(exists(select 1 from public.class_memberships where user_id='e1800000-0000-4000-8000-000000000003' and class_id=(select id from workflow_fixture where name='class') and role='cadet'), 'conflicting request never promotes existing member');
reset role;
select pg_temp.assert_true(exists(select 1 from public.class_request_email_outbox where request_id=(select id from workflow_fixture where name='duplicate') and event_type='request_rejected'), 'rejection queues requester update');
select pg_temp.assert_true((select count(*)=2 from public.class_request_email_outbox where request_id=(select id from workflow_fixture where name='request')), 'one owner review and one approval email, including retries');
select pg_temp.assert_true((select count(*) from public.profiles)=(select profiles from workflow_before), 'existing profiles preserved');
select pg_temp.assert_true((select count(*) from public.class_memberships)=(select memberships+2 from workflow_before), 'existing memberships preserved');

set local role service_role;
create temporary table claimed_emails as select * from public.claim_class_request_emails(25);
select pg_temp.assert_true((select count(*)=2 from claimed_emails where request_id=(select id from workflow_fixture where name='request')), 'queue claims both events');
select pg_temp.assert_true(not exists(select 1 from public.claim_class_request_emails(25) where request_id=(select id from workflow_fixture where name='request')), 'active leases prevent duplicate claims');
select pg_temp.assert_true(not public.finish_class_request_email((select id from claimed_emails limit 1),gen_random_uuid(),'sent','fake-provider-id',null), 'wrong lease cannot acknowledge email');
select pg_temp.assert_true(public.finish_class_request_email(id,lock_token,'retry',null,'Test temporary failure'), 'retry receipt saved') from claimed_emails where event_type='owner_review';
select pg_temp.assert_true(exists(select 1 from public.class_request_email_outbox where request_id=(select id from workflow_fixture where name='request') and event_type='owner_review' and status='pending' and available_at>now()), 'failed notification is durably scheduled for retry');
update public.class_request_email_outbox set locked_until=now()-interval '1 minute' where request_id=(select id from workflow_fixture where name='request') and status='sending';
select count(*) from public.claim_class_request_emails(25);
select pg_temp.assert_true(exists(select 1 from public.class_request_email_outbox where request_id=(select id from workflow_fixture where name='request') and event_type='request_approved' and status='needs_review'), 'expired uncertain delivery is held for review');
reset role;
select 'PASS: request, approval, enrollment, RLS, profile preservation, durable delivery tests' as result;
rollback;
