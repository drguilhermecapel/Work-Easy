-- Quote acceptance: the client accepts the total it was shown, and a provider cannot accept its own quote.
begin;
select plan(7);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid, token uuid);
grant all on ids to authenticated, anon, service_role;

-- Two sent quotes of an approved provider: 2 x R$ 50,00 = 10000 cents each.
insert into public.quotes (id, provider_id, title, items, status, valid_until) values
  (md5('s70-q1')::uuid, tests.uid('provider_c'), 'Troca de torneira',
   '[{"description":"Torneira","quantity":2,"unit_price_cents":5000}]', 'sent', '2031-12-31'),
  (md5('s70-q2')::uuid, tests.uid('provider_c'), 'Troca de descarga',
   '[{"description":"Descarga","quantity":2,"unit_price_cents":5000}]', 'sent', '2031-12-31');
insert into ids select 'q1', id, public_token from public.quotes where id = md5('s70-q1')::uuid;
insert into ids select 'q2', id, public_token from public.quotes where id = md5('s70-q2')::uuid;

select tests.authenticate_as('provider_c');
select throws_ok($$select public.respond_quote((select token from ids where name = 'q1'), true, 10000)$$,
                 'P0001', 'not_allowed', 'a provider cannot accept its own quote');

select tests.authenticate_anon();
select throws_ok($$select public.respond_quote((select token from ids where name = 'q1'), true)$$,
                 'P0001', 'not_allowed', 'accepting needs the total the client was shown');
select throws_ok($$select public.respond_quote((select token from ids where name = 'q1'), true, 20000)$$,
                 'P0001', 'quote_total_changed', 'a total that changed since the client read it is refused');
select tests.clear_authentication();
select is((select status::text from public.quotes where id = md5('s70-q1')::uuid), 'sent',
          'the quote stays sent after a refused acceptance');

select tests.authenticate_anon();
select is(public.respond_quote((select token from ids where name = 'q1'), true, 10000)::text, 'accepted',
          'the client accepts the total it was shown');
select is(public.respond_quote((select token from ids where name = 'q2'), false)::text, 'declined',
          'declining does not need a total');

select * from finish();
rollback;
