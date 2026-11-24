-- Launch round of 24/11/2026: care line visibility, waiting list, shifts created by the operation,
-- new request notice, blocks, reports, search rotation and the dates the metrics needed.
begin;
select plan(52);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
select is((select value from public.platform_settings where key = 'care_line_open'), 'false'::jsonb,
          'the care line starts closed (D12)');
select tests.authenticate_anon();
select is((select count(*)::int from public.platform_settings where key in ('care_line_open', 'pilot_neighborhoods')), 2,
          'the two launch settings are public, so the app reads them without a session');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- New request notice
-- ---------------------------------------------------------------------------
-- Ana, Carla, Davi and Eva do t-reparo in Bairro Um; only Ana has a confirmed phone, and the
-- e-mail of every test user is confirmed, so all four can be told.
select tests.authenticate_as('client_a');
with r as (
  insert into public.requests (occupation_slug, neighborhood_id, description)
  values ('t-reparo', tests.neighborhood('t-bairro-1'), 'Trocar a torneira da cozinha, que pinga.')
  returning id
)
insert into ids select 'req1', id from r;
select tests.clear_authentication();

select is((select count(*)::int from public.notifications
            where template = 'pedido_novo' and params ->> 'request_id' = (select id::text from ids where name = 'req1')), 4,
          'the four providers that can answer the request are told');
select is((select count(*)::int from public.notifications
            where template = 'pedido_novo' and user_id in (tests.uid('provider_b'), tests.uid('client_a'))), 0,
          'a provider of another occupation and neighborhood and the client are not told');
select is((select count(*)::int
             from pg_proc p
             cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where p.oid = 'private.notify_new_request()'::regprocedure and a.privilege_type = 'EXECUTE'
              and a.grantee in (0, (select oid from pg_roles where rolname = 'anon'), (select oid from pg_roles where rolname = 'authenticated'))),
          0, 'the notice trigger function is not executable by the API roles');

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------
select tests.authenticate_as('client_a');
select lives_ok(format($$select public.block_provider(%L)$$, tests.uid('provider_c')), 'a client blocks a provider');
select lives_ok(format($$select public.block_provider(%L)$$, tests.uid('provider_c')), 'blocking twice is the same block');
select is((select count(*)::int from public.my_blocks()), 1, 'the block is in the client''s list');
select is((select label from public.my_blocks()), 'Carla Teste', 'with the public name of the provider');
select throws_ok(format($$select public.block_provider(%L)$$, tests.uid('client_a')), 'P0001', 'not_found',
                 'an account that is not a public provider cannot be blocked this way');
select is((select count(*)::int from public.search_providers('t-reparo') where slug = 't-carla'), 0,
          'the blocked provider leaves the client''s search');
with r as (
  insert into public.requests (occupation_slug, neighborhood_id, description)
  values ('t-reparo', tests.neighborhood('t-bairro-1'), 'Instalar um chuveiro novo no banheiro.')
  returning id
)
insert into ids select 'req2', id from r;
select tests.clear_authentication();

select is((select count(*)::int from public.notifications
            where template = 'pedido_novo' and user_id = tests.uid('provider_c')
              and params ->> 'request_id' = (select id::text from ids where name = 'req2')), 0,
          'the blocked provider is not told of the client''s next request');

select tests.authenticate_as('provider_c');
select is((select count(*)::int from public.open_requests_for_me()), 0, 'and does not see the client''s requests');
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'req2'), 9000)$$,
                 'P0001', 'not_allowed', 'nor sends a proposal to them');
select is((select count(*)::int from public.user_blocks), 0, 'the blocked side cannot read the block');
select tests.clear_authentication();

select tests.authenticate_anon();
select is((select count(*)::int from public.search_providers('t-reparo') where slug = 't-carla'), 1,
          'the block changes nothing for other visitors');
select tests.clear_authentication();

-- A provider blocks the author of a request without ever learning who it is
select tests.authenticate_as('provider_d');
select lives_ok($$select public.block_request_author((select id from ids where name = 'req1'))$$,
                'a provider blocks the author of a request it can answer');
select is((select count(*)::int from public.open_requests_for_me()), 0, 'and stops seeing that client''s requests');
select is((select label from public.my_blocks()), null, 'the list does not name a client');
select tests.clear_authentication();
select tests.authenticate_as('provider_b');
select throws_ok($$select public.block_request_author((select id from ids where name = 'req1'))$$, 'P0001', 'not_found',
                 'a provider that cannot answer the request cannot use it to block');
select tests.clear_authentication();

select tests.authenticate_as('client_a');
select lives_ok(format($$select public.unblock_user(%L)$$, tests.uid('provider_c')), 'the client removes the block');
select is((select count(*)::int from public.search_providers('t-reparo') where slug = 't-carla'), 1,
          'and the provider is back in the search');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
select tests.authenticate_as('client_a');
select lives_ok(format($$insert into ids select 'rep1', public.report_content('provider', %L, 'fraude', '  Pediu pagamento por fora.  ')$$,
                       tests.uid('provider_e')), 'a client reports a provider');
select is((select public.report_content('provider', tests.uid('provider_e'), 'spam')), (select id from ids where name = 'rep1'),
          'reporting the same target again returns the open report');
select throws_ok($$select public.report_content('provider', gen_random_uuid(), 'spam')$$, 'P0001', 'not_found',
                 'something that does not exist cannot be reported');
select throws_ok(format($$select public.report_content('provider', %L, 'porque sim')$$, tests.uid('provider_e')), '22023', 'invalid_input',
                 'the reason is one of the list');
select throws_ok($$insert into public.content_reports (target_type, target_id, reason) values ('provider', gen_random_uuid(), 'spam')$$,
                 '42501', null, 'reports are not written directly');
select throws_ok($$select public.admin_resolve_report((select id from ids where name = 'rep1'), 'dismissed')$$, 'P0001', 'not_allowed',
                 'only the administration closes a report');
select tests.clear_authentication();

select tests.authenticate_as('provider_e');
select is((select count(*)::int from public.content_reports), 0, 'the reported account does not see the report');
select throws_ok(format($$select public.report_content('provider', %L, 'spam')$$, tests.uid('provider_e')), 'P0001', 'not_allowed',
                 'nobody reports themselves');
select lives_ok($$select public.report_content('request', (select id from ids where name = 'req1'), 'ofensivo')$$,
                'a provider reports a request it can answer');
select tests.clear_authentication();

select tests.authenticate_as('admin');
select is((select count(*)::int from public.admin_list_reports('open')), 2, 'the administration sees the open reports');
select is((select details from public.admin_list_reports('open') where target_type = 'provider'), 'Pediu pagamento por fora.',
          'with the details, trimmed');
select is((select target_text from public.admin_list_reports('open') where target_type = 'request'),
          'Trocar a torneira da cozinha, que pinga.', 'and the text that was reported');
select lives_ok($$select public.admin_resolve_report((select id from ids where name = 'rep1'), 'actioned', 'Prestador suspenso.')$$,
                'the administration closes a report');
select throws_ok($$select public.admin_resolve_report((select id from ids where name = 'rep1'), 'dismissed')$$, 'P0001', 'invalid_transition',
                 'a closed report is not closed again');
select is((select count(*)::int from public.audit_log where action = 'report.resolved'), 1, 'closing a report is audited');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- Waiting list
-- ---------------------------------------------------------------------------
select tests.authenticate_as('client_b');
select lives_ok($$insert into public.waitlist_entries (neighborhood_id, occupation_slug) values (tests.neighborhood('t-bairro-3'), 't-reparo')$$,
                'a client joins the waiting list of a neighborhood');
select throws_ok($$insert into public.waitlist_entries (neighborhood_id, occupation_slug) values (tests.neighborhood('t-bairro-3'), 't-reparo')$$,
                 '23505', null, 'once per neighborhood and service');
select throws_ok(format($$insert into public.waitlist_entries (user_id, neighborhood_id) values (%L, tests.neighborhood('t-bairro-3'))$$,
                        tests.uid('client_a')), '42501', null, 'never in the name of another account');
select throws_ok($$select * from public.admin_waitlist_summary()$$, 'P0001', 'not_allowed', 'the summary is for the administration');
select tests.clear_authentication();
select tests.authenticate_as('admin');
select is((select entries from public.admin_waitlist_summary() where occupation_slug = 't-reparo'), 1::bigint,
          'the administration sees the demand by neighborhood and service');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- Dates for the metrics
-- ---------------------------------------------------------------------------
select isnt((select approved_at from public.providers where id = tests.uid('provider_a')), null,
            'an approved provider has the date of the first approval');
update public.providers set status = 'suspended' where id = tests.uid('provider_a');
update public.providers set status = 'approved', approved_at = '2000-01-01' where id = tests.uid('provider_a');
select ok((select approved_at > now() - interval '1 hour' from public.providers where id = tests.uid('provider_a')),
          'a suspension and a new approval do not move it, and it cannot be written');

insert into ids select 'bk1', tests.make_booking('provider_c', 'client_b', 't-reparo', tests.sp_period(tests.at(4, 0, '10:00'), 1));
insert into ids select 'pay1', tests.make_payment((select id from ids where name = 'bk1'), 'pending');
select is((select received_at from public.payments where id = (select id from ids where name = 'pay1')), null,
          'a pending payment has no receipt date');
update public.payments set status = 'received' where id = (select id from ids where name = 'pay1');
update public.payments set status = 'refunded', received_at = null where id = (select id from ids where name = 'pay1');
select isnt((select received_at from public.payments where id = (select id from ids where name = 'pay1')), null,
            'the receipt date is set when the payment is received and survives a refund');

-- ---------------------------------------------------------------------------
-- A shift created by the operation for a family
-- ---------------------------------------------------------------------------
select tests.authenticate_as('client_b');
with h as (insert into public.households (name) values ('Casa de teste') returning id)
insert into ids select 'house', id from h;
select is(public.care_access(), true, 'a family with a house has the care line in the menu');
select tests.clear_authentication();
select tests.authenticate_as('client_a');
select is(public.care_access(), false, 'an account outside the care line does not');
select throws_ok(format($$insert into public.shifts (household_id, period, rate_cents) values (%L, %L, 28000)$$,
                        (select id from ids where name = 'house'), tests.sp_period(tests.at(5, 0, '08:00'), 12)),
                 '42501', null, 'another client cannot create a shift in the house');
select tests.clear_authentication();
select tests.authenticate_as('admin');
select lives_ok(format($$insert into public.shifts (household_id, period, rate_cents) values (%L, %L, 28000)$$,
                       (select id from ids where name = 'house'), tests.sp_period(tests.at(5, 0, '08:00'), 12)),
                'the administration creates a shift for the family');
select tests.clear_authentication();
select is((select count(*)::int from public.audit_log where action = 'shift.created_by_admin'), 1, 'and that is audited');

select * from finish();
rollback;
