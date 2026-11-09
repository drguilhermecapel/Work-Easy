-- Support tasks (migration 20261110500003): the server opens a task through public.open_support_task,
-- which only the service role can run. The API roles neither write nor read the tasks; the service
-- role reads them, and writes them only through the function.
begin;
select plan(16);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

select has_function('public', 'open_support_task', array['text', 'jsonb'], 'the function that opens a task exists');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.support_tasks'::regclass),
          'RLS is on for the support tasks');

-- A signed-in user, an administrator and an anonymous caller cannot open or read a task.
select tests.authenticate_as('client_a');
select throws_ok($$select public.open_support_task('account_billing_key', '{}'::jsonb)$$, '42501', null,
                 'a user cannot open a task');
select throws_ok($$insert into public.support_tasks (kind) values ('forged')$$, '42501', null,
                 'a user cannot write a task directly');
select throws_ok('select count(*) from public.support_tasks', '42501', null, 'a user cannot read the tasks');
select tests.authenticate_as('admin');
select throws_ok('select count(*) from public.support_tasks', '42501', null,
                 'an administrator cannot read the tasks through the API');
select tests.authenticate_anon();
select throws_ok($$select public.open_support_task('account_billing_key', '{}'::jsonb)$$, '42501', null,
                 'anon cannot open a task');
select throws_ok('select count(*) from public.support_tasks', '42501', null, 'anon cannot read the tasks');

-- The service role opens tasks, reads them, and cannot insert rows directly.
select tests.authenticate_service();
select lives_ok($$select public.open_support_task('account_billing_key', '{"reason": "subaccount key missing"}'::jsonb)$$,
                'the service role opens a task');
select lives_ok($$select public.open_support_task('no_payload_kind', null)$$, 'a task without a payload is accepted');
select is((select count(*)::int from public.support_tasks where kind = 'account_billing_key'), 1,
          'the service role reads the task it opened');
select throws_ok($$insert into public.support_tasks (kind) values ('direct')$$, '42501', null,
                 'the service role writes tasks only through the function');
select throws_ok($$select public.open_support_task('bad_payload', '[]'::jsonb)$$, '23514', null,
                 'the payload of a task is a JSON object');
select tests.clear_authentication();

select is((select payload from public.support_tasks where kind = 'no_payload_kind'), '{}'::jsonb,
          'a missing payload is stored as an empty object');
select ok((select resolved_at is null from public.support_tasks where kind = 'account_billing_key'),
          'a new task is open');

select * from finish();
rollback;
