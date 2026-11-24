-- The Pro plan ends with its paid period (plus pro_grace_days): the hourly sweep downgrades a
-- provider only after the period has ended, and keeps Pro while the subscription is active.
begin;
select plan(8);
select has_function('private', 'expire_pro_plans', 'the Pro expiry sweep is installed');
select tests.setup_fixture();

update public.providers set plan = 'pro'
 where id in (tests.uid('provider_b'), tests.uid('provider_c'), tests.uid('provider_d'), tests.uid('provider_e'));
insert into public.subscriptions (provider_id, plan, status, current_period_end) values
  (tests.uid('provider_c'), 'pro', 'canceled', now() + interval '2 days'),
  (tests.uid('provider_d'), 'pro', 'active', now() - interval '5 days'),
  (tests.uid('provider_b'), 'pro', 'past_due', now() - interval '1 day'),
  (tests.uid('provider_e'), 'pro', 'past_due', now() - interval '1 day');

-- No grace (the default): the sweep runs.
select private.expire_pro_plans();
select is((select plan::text from public.providers where id = tests.uid('provider_c')), 'pro',
          'a cancelled Pro keeps the plan until the paid period ends');
select is((select plan::text from public.providers where id = tests.uid('provider_d')), 'pro',
          'an active subscription keeps Pro whatever its date says');
select is((select plan::text from public.providers where id = tests.uid('provider_b')), 'free',
          'an unpaid Pro past its period loses the plan');

-- The period of the cancelled one ends: the next sweep downgrades it.
update public.subscriptions set current_period_end = now() - interval '1 hour' where provider_id = tests.uid('provider_c');
select private.expire_pro_plans();
select is((select plan::text from public.providers where id = tests.uid('provider_c')), 'free',
          'the cancelled Pro loses the plan once the paid period has ended');
select is((select count(*)::int from public.audit_log
            where action = 'provider.plan_expired' and entity_id = tests.uid('provider_c')::text), 1,
          'the downgrade is recorded in the audit log');

-- Grace: a past-due Pro keeps the plan for pro_grace_days after the period. (The first sweep
-- already downgraded this provider with no grace, so it is put back on Pro first.)
update public.providers set plan = 'pro' where id = tests.uid('provider_e');
update public.platform_settings set value = '3' where key = 'pro_grace_days';
select private.expire_pro_plans();
select is((select plan::text from public.providers where id = tests.uid('provider_e')), 'pro',
          'a past-due Pro keeps the plan within the grace period');
update public.subscriptions set current_period_end = now() - interval '4 days' where provider_id = tests.uid('provider_e');
select private.expire_pro_plans();
select is((select plan::text from public.providers where id = tests.uid('provider_e')), 'free',
          'and loses it after the grace period');

select * from finish();
rollback;
