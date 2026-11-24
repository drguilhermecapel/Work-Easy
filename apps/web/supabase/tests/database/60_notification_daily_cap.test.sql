-- Notification daily cap (migration 20261109100001): one destination (a WhatsApp number or an
-- e-mail address) receives at most notification_daily_cap messages per day, counted by one
-- atomic upsert. The counter keeps a hash of the destination, never the address, and API roles
-- cannot read it. Old counters are purged by a pg_cron job.
begin;
select plan(11);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

select has_table('private', 'notification_daily_counts', 'the daily counter table exists');
select is((select (value #>> '{}')::int from public.platform_settings where key = 'notification_daily_cap'), 50,
          'the cap is a platform setting, 50 by default');

-- start every destination of this test from zero, with a cap of 2
delete from private.notification_daily_counts;
update public.platform_settings set value = '2' where key = 'notification_daily_cap';

-- client A has a confirmed WhatsApp number (fixture)
select private.notify(tests.uid('client_a'), 'lembrete_atendimento', '{"marker": "cap-test"}');
select private.notify(tests.uid('client_a'), 'lembrete_atendimento', '{"marker": "cap-test"}');
select private.notify(tests.uid('client_a'), 'lembrete_atendimento', '{"marker": "cap-test"}');
select is((select count(*)::int from public.notifications where params ->> 'marker' = 'cap-test'), 2,
          'the third message to the same WhatsApp number in one day is not queued');
select is((select max(sent) from private.notification_daily_counts), 2, 'the counter stops at the cap');

-- client B has only a confirmed e-mail address (fixture): its own count, not the number's
select private.notify(tests.uid('client_b'), 'lembrete_atendimento', '{"marker": "cap-test"}');
select private.notify(tests.uid('client_b'), 'lembrete_atendimento', '{"marker": "cap-test"}');
select private.notify(tests.uid('client_b'), 'lembrete_atendimento', '{"marker": "cap-test"}');
select is((select count(*)::int from public.notifications
            where params ->> 'marker' = 'cap-test' and channel = 'email'), 2,
          'an e-mail address has its own daily count');
select ok(not exists (select 1 from private.notification_daily_counts where sent > 2),
          'no destination is ever counted above the cap');

-- a cap of zero stops every message
update public.platform_settings set value = '0' where key = 'notification_daily_cap';
select private.notify(tests.uid('client_a'), 'lembrete_atendimento', '{"marker": "cap-zero"}');
select is((select count(*)::int from public.notifications where params ->> 'marker' = 'cap-zero'), 0,
          'a cap of zero queues nothing');

-- without the setting the default applies
delete from private.notification_daily_counts;
delete from public.platform_settings where key = 'notification_daily_cap';
select private.notify(tests.uid('client_a'), 'lembrete_atendimento', '{"marker": "cap-default"}');
select is((select count(*)::int from public.notifications where params ->> 'marker' = 'cap-default'), 1,
          'without the setting the default cap (50) applies');

select is((select count(*)::int from cron.job where jobname = 'notification-counts-retention'), 1,
          'old counters are purged by a pg_cron job');

select tests.authenticate_as('client_a');
select throws_ok($$select count(*) from private.notification_daily_counts$$, '42501', null,
                 'API roles cannot read the counter table');
select tests.clear_authentication();

select * from finish();
rollback;
