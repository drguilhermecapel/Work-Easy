-- Proposal integrity: created_at is server-owned (it drives the monthly free allowance), and a
-- sent offer cannot change.
begin;
select plan(11);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- Six open requests for a reserve (t-reparo) in the neighborhood the providers serve.
insert into ids select 'r' || n, md5('s50-r' || n)::uuid from generate_series(1, 7) n;
insert into public.requests (id, client_id, occupation_slug, neighborhood_id, description)
select i.id, tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido de teste ' || i.name
  from ids i;

-- A free provider sends a proposal; a backdated created_at on insert is accepted but ignored.
select tests.authenticate_as('provider_d');
select lives_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'r1'), 9000)$$,
                'a free provider sends a proposal');
select lives_ok($$insert into public.proposals (request_id, price_cents, created_at)
                  values ((select id from ids where name = 'r2'), 9000, now() - interval '40 days')$$,
                'a backdated created_at on insert is accepted');

-- created_at cannot be rewritten by the provider, so a proposal stays in the month it was sent.
select throws_ok($$update public.proposals set created_at = now() - interval '40 days'
                    where request_id = (select id from ids where name = 'r1')$$,
                 '42501', null, 'a provider cannot rewrite created_at of a proposal');

-- A sent offer is fixed: the price and the message the client saw cannot change.
select throws_ok($$update public.proposals set price_cents = 1000000 where request_id = (select id from ids where name = 'r1')$$,
                 'P0001', 'invalid_transition', 'the price of a sent proposal cannot change');
select throws_ok($$update public.proposals set message = 'Outra mensagem' where request_id = (select id from ids where name = 'r1')$$,
                 'P0001', 'invalid_transition', 'the message of a sent proposal cannot change');
select lives_ok($$update public.proposals set status = 'withdrawn' where request_id = (select id from ids where name = 'r1')$$,
                'a provider can still withdraw a sent proposal');

-- The count is still 5 for the month (withdrawn ones count): three more fill it, a sixth is refused.
select lives_ok($$insert into public.proposals (request_id, price_cents) values
                  ((select id from ids where name = 'r3'), 9000),
                  ((select id from ids where name = 'r4'), 9000),
                  ((select id from ids where name = 'r5'), 9000)$$,
                'the allowance is used up to five proposals');
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'r6'), 9000)$$,
                 'P0001', 'free_proposal_limit', 'the sixth proposal of the month is refused');

-- Server side: the clock sets created_at, and no role can change it after the insert.
select tests.clear_authentication();
select is((select created_at > now() - interval '5 minutes' from public.proposals
            where request_id = (select id from ids where name = 'r2')),
          true, 'the server clock sets created_at, not the client');
select throws_ok($$update public.proposals set created_at = now() - interval '40 days'
                    where request_id = (select id from ids where name = 'r2')$$,
                 'P0001', 'not_allowed', 'created_at cannot change after the insert, even for the owner of the table');

select * from finish();
rollback;
