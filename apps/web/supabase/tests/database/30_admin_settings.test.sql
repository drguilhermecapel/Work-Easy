-- Administration settings: admin_set_setting checks the type and the range of the keys the screen
-- edits, including the three revenue settings of migration 12 whose zero has a meaning (commission
-- ceiling: no ceiling; free proposals per month: no limit; Pro trial days: no trial). An accepted
-- change writes one audit entry with the old and the new value; a refused one writes nothing.
begin;
select plan(60);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- A known starting point for the three keys: the migration seeds them, but the shared local
-- database may have been edited through the screen.
insert into public.platform_settings (key, value) values
  ('commission_cap_cents', '15000'), ('free_proposals_per_month', '5'), ('pro_trial_days', '30')
on conflict (key) do update set value = excluded.value;

-- ================================================================ who can call it
select tests.authenticate_as('provider_a');
select throws_ok($$select public.admin_set_setting('pro_trial_days', '14')$$,
                 'P0001', 'not_allowed', 'a provider cannot change the trial');
select throws_ok($$select public.admin_set_setting('free_proposals_per_month', '50')$$,
                 'P0001', 'not_allowed', 'a provider cannot lift the free limit');
select tests.authenticate_as('client_a');
select throws_ok($$select public.admin_set_setting('commission_cap_cents', '0')$$,
                 'P0001', 'not_allowed', 'a client cannot remove the commission ceiling');
select tests.authenticate_anon();
select throws_ok($$select public.admin_set_setting('pro_trial_days', '14')$$,
                 '42501', null, 'anon cannot call it');
select tests.clear_authentication();
select is((select value from public.platform_settings where key = 'commission_cap_cents'), '15000'::jsonb,
          'the refused calls left the ceiling as it was');
select is((select value from public.platform_settings where key = 'free_proposals_per_month'), '5'::jsonb,
          'and the free limit');
select is((select value from public.platform_settings where key = 'pro_trial_days'), '30'::jsonb,
          'and the trial');
select is((select count(*)::int from public.audit_log
            where action = 'setting.changed'
              and actor_id in (tests.uid('provider_a'), tests.uid('client_a'), tests.uid('admin'))),
          0, 'and logged nothing');
select ok(has_function_privilege('authenticated', 'public.admin_set_setting(text, jsonb)', 'execute'),
          'signed-in users reach the function (it refuses the ones who are not administrators)');
select ok(not has_function_privilege('anon', 'public.admin_set_setting(text, jsonb)', 'execute'),
          'anon does not');

-- ================================================================ accepted values
select tests.authenticate_as('admin');

-- Commission ceiling, in cents: 0 means no ceiling, 1000000 is R$ 10.000,00.
select is(public.admin_set_setting('commission_cap_cents', '20000')::text, '20000', 'ceiling: a normal value is accepted');
select is((select value from public.platform_settings where key = 'commission_cap_cents'), '20000'::jsonb,
          'ceiling: and stored');
select is(public.admin_set_setting('commission_cap_cents', '1000000')::text, '1000000', 'ceiling: R$ 10.000,00 is the top');
select is(public.admin_set_setting('commission_cap_cents', '0')::text, '0', 'ceiling: 0 (no ceiling) is accepted');

-- Free proposals per month: 0 means no limit.
select is(public.admin_set_setting('free_proposals_per_month', '8')::text, '8', 'free proposals: a normal value is accepted');
select is((select value from public.platform_settings where key = 'free_proposals_per_month'), '8'::jsonb,
          'free proposals: and stored');
select is(public.admin_set_setting('free_proposals_per_month', '100')::text, '100', 'free proposals: 100 is the top');
select is(public.admin_set_setting('free_proposals_per_month', '0')::text, '0', 'free proposals: 0 (no limit) is accepted');

-- Pro trial days: 0 means no trial, 90 is the longest.
select is(public.admin_set_setting('pro_trial_days', '14')::text, '14', 'trial: a normal value is accepted');
select is((select value from public.platform_settings where key = 'pro_trial_days'), '14'::jsonb,
          'trial: and stored');
select is(public.admin_set_setting('pro_trial_days', '90')::text, '90', 'trial: 90 days is the longest');
select is(public.admin_set_setting('pro_trial_days', '0')::text, '0', 'trial: 0 (no trial) is accepted');

-- ================================================================ refused values
select throws_ok(format($$select public.admin_set_setting(%L, %L)$$, t.k, t.v), '23514', 'invalid_setting',
                 format('%s refuses %s', t.k, t.v))
  from (values
    ('commission_cap_cents', '-1'),
    ('commission_cap_cents', '1000001'),
    ('commission_cap_cents', '150.5'),
    ('commission_cap_cents', '"15000"'),
    ('commission_cap_cents', 'true'),
    ('commission_cap_cents', 'null'),
    ('commission_cap_cents', '1e12'),
    ('free_proposals_per_month', '-1'),
    ('free_proposals_per_month', '101'),
    ('free_proposals_per_month', '2.5'),
    ('free_proposals_per_month', '"5"'),
    ('free_proposals_per_month', 'false'),
    ('free_proposals_per_month', 'null'),
    ('pro_trial_days', '-1'),
    ('pro_trial_days', '91'),
    ('pro_trial_days', '0.5'),
    ('pro_trial_days', '"30"'),
    ('pro_trial_days', 'true'),
    ('pro_trial_days', 'null'),
    ('pro_trial_days', '[30]'),
    ('pro_trial_days', '{"days": 30}')
  ) as t(k, v);
select is((select value from public.platform_settings where key = 'commission_cap_cents'), '0'::jsonb,
          'refused values changed nothing: the ceiling is still 0');
select is((select value from public.platform_settings where key = 'free_proposals_per_month'), '0'::jsonb,
          'the free limit is still 0');
select is((select value from public.platform_settings where key = 'pro_trial_days'), '0'::jsonb,
          'the trial is still 0');

-- The new ranges did not touch the old ones: proposal_limit still starts at 1 (its 0 is not "no limit")
select throws_ok($$select public.admin_set_setting('proposal_limit', '0')$$, '23514', 'invalid_setting',
                 'proposal_limit still starts at 1');
select is(public.admin_set_setting('commission_bps', '5000')::text, '5000', 'commission_bps still accepts its top');
select throws_ok($$select public.admin_set_setting('commission_bps', '5001')$$, '23514', 'invalid_setting',
                 'and refuses one above it');
select is(public.admin_set_setting('t_other_key', '"x"')::text, '"x"', 'a key without a range still passes');

-- ================================================================ audit
select tests.clear_authentication();
-- 3 + 3 + 3 changes of the revenue keys, commission_bps and the other key: refused calls add nothing
select is((select count(*)::int from public.audit_log where action = 'setting.changed' and actor_id = tests.uid('admin')),
          11, 'each accepted change is logged once and the refused ones leave nothing');
select results_eq(
  $$select entity, entity_id, data - 'via' from public.audit_log
     where action = 'setting.changed' and actor_id = tests.uid('admin') and entity_id = 'pro_trial_days'
     order by id$$,
  $$values ('platform_setting', 'pro_trial_days', '{"from": 30, "to": 14}'::jsonb),
           ('platform_setting', 'pro_trial_days', '{"from": 14, "to": 90}'::jsonb),
           ('platform_setting', 'pro_trial_days', '{"from": 90, "to": 0}'::jsonb)$$,
  'the entries of the trial keep the key, the old value and the new one, in order');
select results_eq(
  $$select data - 'via' from public.audit_log
     where action = 'setting.changed' and actor_id = tests.uid('admin') and entity_id = 'commission_cap_cents'
     order by id$$,
  $$values ('{"from": 15000, "to": 20000}'::jsonb), ('{"from": 20000, "to": 1000000}'::jsonb),
           ('{"from": 1000000, "to": 0}'::jsonb)$$,
  'and the ones of the ceiling');
select results_eq(
  $$select data - 'via' from public.audit_log
     where action = 'setting.changed' and actor_id = tests.uid('admin') and entity_id = 'free_proposals_per_month'
     order by id$$,
  $$values ('{"from": 5, "to": 8}'::jsonb), ('{"from": 8, "to": 100}'::jsonb), ('{"from": 100, "to": 0}'::jsonb)$$,
  'and the ones of the free limit');
select is((select data ->> 'via' from public.audit_log
            where action = 'setting.changed' and actor_id = tests.uid('admin') and entity_id = 'pro_trial_days'
            order by id limit 1),
          'user', 'the entry says the change came from a user');
select is((select data -> 'from' from public.audit_log
            where action = 'setting.changed' and actor_id = tests.uid('admin') and entity_id = 't_other_key'),
          'null'::jsonb, 'a key written for the first time logs null as the old value');

-- ================================================================ the rules read the zeros as zeros
-- private.setting_int falls back to the default only for a missing or malformed value, so a
-- stored 0 reaches platform_fee() and check_proposal() as "no ceiling" and "no limit".
select is(private.setting_int('commission_cap_cents', 15000), 0, 'the rules read the ceiling 0 as 0, not as the default');
select is(private.setting_int('free_proposals_per_month', 5), 0, 'and the free limit 0');
select is(private.setting_int('pro_trial_days', 30), 0, 'and the trial 0');

select * from finish();
rollback;
