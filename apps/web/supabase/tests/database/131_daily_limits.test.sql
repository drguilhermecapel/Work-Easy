-- Daily limits (migrations 20261118600008 and 20261118600009). A client has at most 20 requests created on
-- the same São Paulo day, whatever their status: cancelling one does not free its place of the day. A user
-- has at most 20 granted consents of one purpose created on the same São Paulo day. Withdrawals
-- (granted = false) are never counted nor refused, and a repeated decision adds no row, so it is not refused.
begin;
select plan(21);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- ================================================================ requests per day
-- The test session stores 19 requests of the day, closed, so they do not use the open-request limit.
-- Only the client's own inserts below are open, and one at a time.
select tests.clear_authentication();
insert into public.requests (client_id, status, occupation_slug, neighborhood_id, description)
select tests.uid('client_a'), 'closed'::public.request_status, 't-reparo', tests.neighborhood('t-bairro-1'),
       'Pedido de hoje ' || g
  from generate_series(1, 19) as g;
select is((select count(*)::int from public.requests where client_id = tests.uid('client_a')), 19,
          'nineteen requests of the day are stored');

select tests.authenticate_as('client_a');
select lives_ok($$insert into public.requests (occupation_slug, neighborhood_id, description)
                  values ('t-reparo', tests.neighborhood('t-bairro-1'), 'Vigésimo pedido do dia')$$,
                'the twentieth request of the day is accepted');
select lives_ok($$update public.requests set status = 'canceled' where description = 'Vigésimo pedido do dia'$$,
                'the client cancels that request');
select throws_ok($$insert into public.requests (occupation_slug, neighborhood_id, description)
                   values ('t-reparo', tests.neighborhood('t-bairro-1'), 'Vigésimo primeiro pedido do dia')$$,
                 'P0001', 'request_daily_limit',
                 'the twenty-first request of the day is refused: the canceled one still counts');
select throws_ok($$insert into public.requests (occupation_slug, neighborhood_id, description)
                   select 't-reparo', tests.neighborhood('t-bairro-1'), 'Lote acima do limite ' || g
                     from generate_series(1, 2) as g$$,
                 'P0001', 'request_daily_limit', 'a bulk insert over the limit is refused as a whole');
select tests.clear_authentication();
select is((select count(*)::int from public.requests where client_id = tests.uid('client_a')), 20,
          'the refused requests were not stored: the day holds exactly twenty');

-- The day ends at midnight in São Paulo, not in UTC: requests created at 23:59 of the day before belong to that day
insert into public.requests (client_id, status, occupation_slug, neighborhood_id, description, created_at)
select tests.uid('client_b'), 'closed'::public.request_status, 't-reparo', tests.neighborhood('t-bairro-1'),
       'Pedido de ontem ' || g,
       (date_trunc('day', now() at time zone 'America/Sao_Paulo') - interval '1 minute') at time zone 'America/Sao_Paulo'
  from generate_series(1, 20) as g;
select is((select count(*)::int from public.requests
            where client_id = tests.uid('client_b')
              and private.sp_date(created_at) = private.sp_date(now()) - 1), 20,
          'the twenty requests of the day before are dated yesterday in São Paulo');

-- The first minute of today in São Paulo is dated today. If private.sp_date read the UTC date, this row would
-- be dated yesterday while now() is in the São Paulo evening (21:00 to 24:00 is already tomorrow in UTC); the
-- yesterday rows above catch the same regression during the rest of the day.
insert into public.requests (client_id, status, occupation_slug, neighborhood_id, description, created_at)
values (tests.uid('client_b'), 'closed'::public.request_status, 't-reparo', tests.neighborhood('t-bairro-1'),
        'Pedido do primeiro minuto de hoje',
        (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 minute') at time zone 'America/Sao_Paulo');
select is((select count(*)::int from public.requests
            where client_id = tests.uid('client_b')
              and private.sp_date(created_at) = private.sp_date(now())), 1,
          'the request of the first minute of today is dated today in São Paulo, not in UTC');

select tests.authenticate_as('client_b');
select lives_ok($$insert into public.requests (occupation_slug, neighborhood_id, description)
                  values ('t-reparo', tests.neighborhood('t-bairro-1'), 'Pedido do dia seguinte')$$,
                'the day after, a client whose day before was full is accepted again, while the full day of another client does not count');
select tests.clear_authentication();

-- ================================================================ consent grants per day
-- The history before this transaction: nineteen grants and five withdrawals, an hour ago (at), created today.
-- Calls of one transaction share now(), so the twentieth grant below is the only decision of its time, and its
-- repeat is the latest decision of the purpose: the repeat is skipped by the row-level check, not counted.
insert into public.consents (user_id, purpose, version, granted, at)
select tests.uid('client_a'), 'privacy'::public.consent_purpose, 'v' || g, true, now() - interval '1 hour'
  from generate_series(1, 19) as g;
insert into public.consents (user_id, purpose, version, granted, at)
select tests.uid('client_a'), 'privacy'::public.consent_purpose, 'r' || g, false, now() - interval '1 hour'
  from generate_series(1, 5) as g;

select tests.authenticate_as('client_a');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('privacy', 'v20', true)$$,
                'the twentieth grant of the purpose is accepted: the withdrawals of the day are not counted');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('privacy', 'v20', true)$$,
                'a repeat of the twentieth grant adds no row and is not refused');
select throws_ok($$insert into public.consents (purpose, version, granted) values ('privacy', 'v21', true)$$,
                 'P0001', 'consent_daily_limit', 'the twenty-first grant of the same purpose is refused');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('privacy', 'r6', false)$$,
                'a withdrawal is accepted on a day whose grants are full');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('terms', 'v1', true)$$,
                'another purpose is not affected by the full day of privacy');
select is((select count(*)::int from public.consents where user_id = auth.uid() and purpose = 'privacy' and granted), 20,
          'the privacy grants of the day are exactly twenty');
select is((select count(*)::int from public.consents where user_id = auth.uid() and purpose = 'privacy' and not granted), 6,
          'the withdrawals are stored, and the refused grant is not');
select tests.clear_authentication();

-- One statement with twenty-one grants of a purpose is refused as a whole
select tests.authenticate_as('client_b');
select throws_ok($$insert into public.consents (purpose, version, granted)
                   select 'marketing'::public.consent_purpose, 'v' || g, true from generate_series(1, 21) as g$$,
                 'P0001', 'consent_daily_limit', 'twenty-one grants of one purpose in one statement are refused as a whole');
select is((select count(*)::int from public.consents where user_id = auth.uid() and purpose = 'marketing'), 0,
          'and none of them was stored');
select tests.clear_authentication();

-- Grants of the day before do not count against today
insert into public.consents (user_id, purpose, version, granted, at, created_at)
select tests.uid('client_b'), 'location'::public.consent_purpose, 'd' || g, true,
       (date_trunc('day', now() at time zone 'America/Sao_Paulo') - interval '1 minute') at time zone 'America/Sao_Paulo',
       (date_trunc('day', now() at time zone 'America/Sao_Paulo') - interval '1 minute') at time zone 'America/Sao_Paulo'
  from generate_series(1, 20) as g;
select is((select count(*)::int from public.consents
            where user_id = tests.uid('client_b') and purpose = 'location'
              and private.sp_date(created_at) = private.sp_date(now()) - 1), 20,
          'the twenty grants of the day before are dated yesterday in São Paulo');
select tests.authenticate_as('client_b');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('location', 'hoje', true)$$,
                'the day after, a grant of the same purpose is accepted again');
select tests.clear_authentication();

select * from finish();
rollback;
