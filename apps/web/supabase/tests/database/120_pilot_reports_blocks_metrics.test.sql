-- Launch round of 24/11/2026: care line visibility, waiting list, shifts created by the operation,
-- new request notice, blocks, reports, search rotation and the dates the metrics needed.
begin;
select plan(77);
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

select tests.authenticate_as('admin');
select lives_ok($$select public.admin_set_setting('pilot_neighborhoods', '["t-bairro-1", "t-bairro-2"]'::jsonb)$$,
                'the administration chooses the neighborhoods of the pilot');
select throws_ok($$select public.admin_set_setting('pilot_neighborhoods', '["t-bairro-1", "bairro-que-nao-existe"]'::jsonb)$$,
                 '23514', 'invalid_setting', 'a slug that is not a neighborhood is refused, so a typo cannot hide the filter');
select throws_ok($$select public.admin_set_setting('pilot_neighborhoods', '"t-bairro-1"'::jsonb)$$,
                 '23514', 'invalid_setting', 'the pilot is a list');
select throws_ok($$select public.admin_set_setting('care_line_open', '"sim"'::jsonb)$$,
                 '23514', 'invalid_setting', 'the care line switch is true or false');
select lives_ok($$select public.admin_set_setting('pilot_neighborhoods', '[]'::jsonb)$$, 'the empty list offers every neighborhood again');
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
select throws_ok($$select count(*) from public.user_blocks$$, '42501', null,
                 'the table of blocks is not readable by the app: the blocked side learns nothing and the blocker gets no ids from it');
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
select isnt((select ref from public.my_blocks()), tests.uid('client_a'), 'and its handle is not the id of the client');
select lives_ok(format($$select public.unblock_user(%L)$$, tests.uid('client_a')), 'asking to unblock by the id of the client is accepted');
select is((select count(*)::int from public.my_blocks()), 1, 'but it removes nothing: the id of a client is not a way to refer to a block');
select lives_ok($$select public.unblock_user((select ref from public.my_blocks()))$$, 'the handle removes the block');
select is((select count(*)::int from public.my_blocks()), 0, 'and the list is empty again');
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
-- Only this report's entries: audit_log keeps what other runs committed (the integration suite
-- resolves a report of its own), so a count over the whole table depends on the database's past.
select is((select count(*)::int from public.audit_log
            where action = 'report.resolved' and entity = 'content_report'
              and entity_id = (select id::text from ids where name = 'rep1')),
          1, 'closing a report is audited');
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
select is((select count(*)::int from public.audit_log
            where action = 'shift.created_by_admin' and entity = 'shift'
              and entity_id in (select s.id::text from public.shifts s where s.household_id = (select id from ids where name = 'house'))),
          1, 'and that is audited');

-- ---------------------------------------------------------------------------
-- Review fixes (migration 20261124100009)
-- ---------------------------------------------------------------------------
-- pedido_novo has a cap of its own: provider_a already has 10 of them today, so a new request does not reach
-- that provider, and still reaches another one
insert into public.notifications (user_id, email, channel, template, params)
select tests.uid('provider_a'), 'a@test.local', 'email', 'pedido_novo', '{}' from generate_series(1, 10);
select tests.authenticate_as('client_b');
with r as (
  insert into public.requests (occupation_slug, neighborhood_id, description)
  values ('t-reparo', tests.neighborhood('t-bairro-1'), 'Consertar a porta do armario da sala.')
  returning id
)
insert into ids select 'req4', id from r;
select tests.clear_authentication();
select is((select count(*)::int from public.notifications
            where user_id = tests.uid('provider_a') and template = 'pedido_novo'
              and params ->> 'request_id' = (select id::text from ids where name = 'req4')), 0,
          'a provider over its own cap of new-request notices is not told of the next one');
select is((select count(*)::int from public.notifications
            where user_id = tests.uid('provider_d') and template = 'pedido_novo'
              and params ->> 'request_id' = (select id::text from ids where name = 'req4')), 1,
          'a provider under the cap is');

-- a quote cannot be created already marked as done
select tests.authenticate_as('provider_a');
select lives_ok($$insert into public.quotes (title, status, completed_at) values ('Orcamento de teste', 'draft', now())$$,
                'a provider creates a quote with a completion date');
select tests.clear_authentication();
select is((select completed_at from public.quotes where title = 'Orcamento de teste'), null,
          'the completion date is dropped: only mark_quote_completed writes it');

-- the dates of the metrics are stamped by the transition, not by any later update
alter table public.providers disable trigger providers_90_approved_at;
update public.providers set approved_at = null where id = tests.uid('provider_d');
alter table public.providers enable trigger providers_90_approved_at;
update public.providers set bio = 'Atualizada depois.' where id = tests.uid('provider_d');
select is((select approved_at from public.providers where id = tests.uid('provider_d')), null,
          'a provider approved before the column existed is not stamped by an unrelated update');
alter table public.payments disable trigger payments_90_received_at;
update public.payments set received_at = null where id = (select id from ids where name = 'pay1');
alter table public.payments enable trigger payments_90_received_at;
update public.payments set platform_fee_cents = 0 where id = (select id from ids where name = 'pay1');
select is((select received_at from public.payments where id = (select id from ids where name = 'pay1')), null,
          'a payment paid before the column existed is not stamped by an unrelated update');

-- the grace of the Pro plan has the range the webhook applies
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_set_setting('pro_grace_days', '90'::jsonb)$$, '23514', 'invalid_setting',
                 'a grace longer than 60 days is refused, so the webhook and the expiry job agree');
select lives_ok($$select public.admin_set_setting('pro_grace_days', '30'::jsonb)$$, 'a grace of 30 days is accepted');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- What the deletion of an account takes with it
-- ---------------------------------------------------------------------------
-- provider_e sent a report and has a proposal with a message; client_b is on the waiting list.
update public.profiles set city = 'São Paulo' where id = tests.uid('provider_e');
-- The proposal comes before the block: with a block between the two it would be refused
insert into public.proposals (request_id, provider_id, price_cents, message)
values ((select id from ids where name = 'req1'), tests.uid('provider_e'), 9000, 'Posso ir amanhã cedo, me chame.');
select tests.authenticate_as('client_a');
with r as (
  insert into public.requests (occupation_slug, neighborhood_id, description)
  values ('t-reparo', tests.neighborhood('t-bairro-1'), 'Pintar o portão da garagem neste mês.')
  returning id
)
insert into ids select 'req3', id from r;
select lives_ok(format($$select public.block_provider(%L)$$, tests.uid('provider_e')), 'a block on the account that will be deleted');
select tests.clear_authentication();

insert into public.quotes (provider_id, title, status, client_name) values (tests.uid('provider_e'), 'Orcamento da dona Maria', 'draft', 'Maria');
insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit) values (tests.uid('provider_e'), 't-reparo', 'Reparo na casa da dona Maria', 8000, 'hora');

update public.profiles set deleted_at = now() where id in (tests.uid('provider_e'), tests.uid('client_b'));

select is((select count(*)::int from public.content_reports where reporter_id = tests.uid('provider_e') or details is not null and target_type = 'request'), 0,
          'the reports of a deleted account lose their author and their text');
select is((select count(*)::int from public.user_blocks where blocked_id = tests.uid('provider_e')), 0,
          'blocks with a deleted account end');
select is((select count(*)::int from public.waitlist_entries where user_id = tests.uid('client_b')), 0,
          'the waiting list entries of a deleted account are removed');
select is((select count(*)::int from public.proposals where provider_id = tests.uid('provider_e') and message is not null), 0,
          'the free text of the proposals of a deleted provider is erased');
select is((select title from public.quotes where provider_id = tests.uid('provider_e')), 'Orçamento removido',
          'the title of a deleted provider''s quote, free text that can carry a client name, is replaced');
select is((select title from public.services where provider_id = tests.uid('provider_e')), 'Serviço removido',
          'and so is the title of a service');

select * from finish();
rollback;
