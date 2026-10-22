-- Test helpers shared by every pgTAP file. This file runs first (files run in name
-- order) and commits, so the `tests` schema exists for the others; each other file
-- runs in a transaction that is rolled back and starts by checking that the helpers are
-- installed (run this file first, e.g. after `supabase db reset`; running a single file
-- right after a reset fails on that first assertion instead of on a missing schema).
--
-- The helpers are test tooling, not API: execute is revoked from PUBLIC and the API roles
-- on the ones that write to auth.users or the catalog (create_user, setup_fixture,
-- make_booking, make_payment).
--
-- Authentication follows Supabase's model: the role (anon / authenticated /
-- service_role) and the JWT claims are set per transaction, the same as
-- `set local role ...; set local request.jwt.claims = '...'`.

set client_min_messages = warning;
create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Creates an auth user (and, by trigger, its profile). Key 'client_a' -> client_a@test.local.
create or replace function tests.create_user(p_key text, p_full_name text default null, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, phone, encrypted_password, email_confirmed_at,
                          phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_key || '@test.local', p_phone, '', now(), case when p_phone is not null then now() end,
          '{"provider": "email", "providers": ["email"]}',
          jsonb_build_object('full_name', coalesce(p_full_name, p_key)), now(), now());
  return v_id;
end;
$$;

create or replace function tests.uid(p_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where email = p_key || '@test.local';
$$;

-- SET ROLE is not allowed inside security definer functions, so these are invoker.
create or replace function tests.authenticate_as(p_key text)
returns void
language plpgsql
as $$
declare
  v_id uuid := tests.uid(p_key);
begin
  if v_id is null then
    raise exception 'unknown test user %', p_key;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_id, 'role', 'authenticated', 'email', p_key || '@test.local')::text,
                     true);
end;
$$;

create or replace function tests.authenticate_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
end;
$$;

create or replace function tests.authenticate_service()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
end;
$$;

-- Back to the test session's own role (postgres, bypasses RLS) for setup and checks.
create or replace function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- São Paulo wall-clock time, e.g. tests.sp('2030-01-07 09:00').
create or replace function tests.sp(p_local text)
returns timestamptz
language sql
immutable
as $$
  select p_local::timestamp at time zone 'America/Sao_Paulo';
$$;

-- Period of p_hours starting at a São Paulo wall-clock time.
create or replace function tests.sp_period(p_local text, p_hours numeric default 2)
returns tstzrange
language sql
immutable
as $$
  select tstzrange(tests.sp(p_local), tests.sp(p_local) + make_interval(secs => p_hours * 3600));
$$;

-- A Monday in São Paulo, p_weeks weeks after the current one, so date-dependent tests keep
-- working as the calendar moves (book_direct refuses past slots, check-in has a window).
create or replace function tests.future_monday(p_weeks int default 52)
returns date
language sql
stable
as $$
  select (date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date::timestamp) + make_interval(weeks => p_weeks))::date;
$$;

-- A São Paulo wall-clock time on the Monday + p_days of the week p_weeks ahead, e.g.
-- tests.at(52, 0, '09:00') is Monday 09:00.
create or replace function tests.at(p_weeks int, p_days int, p_time text)
returns text
language sql
stable
as $$
  select (tests.future_monday(p_weeks) + p_days)::text || ' ' || p_time;
$$;

-- Fixture independent of the real catalog: three occupations with contrasting
-- policies, three neighborhoods, two clients, five approved providers and an admin.
create or replace function tests.setup_fixture()
returns void
language plpgsql
as $$
declare
  v_n1 uuid;
  v_n2 uuid;
begin
  insert into public.areas (slug, name, description, icon, sort) values ('t-area', 'Área de teste', 'Teste', 'Home', 999);
  insert into public.occupations (slug, area_slug, name, synonyms) values
    ('t-domestica', 't-area', 'Doméstica de teste', '{faxina}'),
    ('t-medico', 't-area', 'Médico de teste', '{}'),
    ('t-reparo', 't-area', 'Reparo de teste', '{}');
  insert into public.occupation_policies (occupation_slug, regulated, verification, billing, rating_ranking,
                                          labor_lock, price_units, locations, confidence) values
    ('t-domestica', false, '{documento_selfie,cadastro_fiscal}', 'comissao_primeiro_servico', true, true,
     '{dia,hora}', '{domicilio}', 'conferido'),
    ('t-medico', true, '{documento_selfie,registro_profissional}', 'so_assinatura', false, false,
     '{sessao}', '{online}', 'conferido'),
    ('t-reparo', false, '{documento_selfie}', 'comissao_primeiro_servico', true, false,
     '{hora,servico}', '{domicilio}', 'conferido');
  update public.occupation_policies set registry_name = 'CRM', regulator_body = 'CFM/CRM'
   where occupation_slug = 't-medico';

  -- Care line: a policy priced by shift makes an occupation a care occupation.
  insert into public.occupations (slug, area_slug, name, synonyms) values
    ('t-cuidado', 't-area', 'Cuidador de teste', '{}');
  insert into public.occupation_policies (occupation_slug, regulated, verification, billing, rating_ranking,
                                          labor_lock, price_units, locations, confidence) values
    ('t-cuidado', false, '{documento_selfie}', 'so_assinatura', false, false, '{plantao}', '{domicilio}', 'conferido');

  -- The tests rely on the contract defaults, whatever was saved in the shared local database.
  insert into public.platform_settings (key, value) values
    ('commission_enabled', 'false'), ('commission_bps', '1200'), ('escrow_enabled', 'false'),
    ('proposal_limit', '3'), ('labor_lock_days_per_week', '2'), ('pro_price_cents', '4900')
  on conflict (key) do update set value = excluded.value;

  insert into public.neighborhoods (name, slug, zone) values ('Bairro Um', 't-bairro-1', 'Oeste') returning id into v_n1;
  insert into public.neighborhoods (name, slug, zone) values ('Bairro Dois', 't-bairro-2', 'Sul') returning id into v_n2;
  insert into public.neighborhoods (name, slug, zone) values ('Bairro Três', 't-bairro-3', 'Norte');

  perform tests.create_user('client_a', 'Cliente A', '5511900000001');
  perform tests.create_user('client_b', 'Cliente B');
  perform tests.create_user('provider_a', 'Prestadora A', '5511900000002');
  perform tests.create_user('provider_b', 'Prestador B', '5511900000003');
  perform tests.create_user('provider_c', 'Prestadora C');
  perform tests.create_user('provider_d', 'Prestador D');
  perform tests.create_user('provider_e', 'Prestadora E');
  perform tests.create_user('admin', 'Admin');
  insert into public.admins (user_id) values (tests.uid('admin'));

  update public.profiles set role = 'provider'
   where id in (tests.uid('provider_a'), tests.uid('provider_b'), tests.uid('provider_c'),
                tests.uid('provider_d'), tests.uid('provider_e'));

  insert into public.providers (id, display_name, slug, status, base_neighborhood_id) values
    (tests.uid('provider_a'), 'Ana Teste', 't-ana', 'approved', v_n1),
    (tests.uid('provider_b'), 'Bruno Teste', 't-bruno', 'approved', v_n2),
    (tests.uid('provider_c'), 'Carla Teste', 't-carla', 'approved', v_n1),
    (tests.uid('provider_d'), 'Davi Teste', 't-davi', 'approved', v_n1),
    (tests.uid('provider_e'), 'Eva Teste', 't-eva', 'approved', v_n1);

  -- Inserted by the test session (not an API role), so `approved` is honored.
  insert into public.provider_occupations (provider_id, occupation_slug, is_primary, registry_number, registry_uf,
                                           approved) values
    (tests.uid('provider_a'), 't-domestica', true, null, null, true),
    (tests.uid('provider_a'), 't-reparo', false, null, null, true),
    (tests.uid('provider_b'), 't-medico', true, '123456', 'SP', true),
    (tests.uid('provider_c'), 't-reparo', true, null, null, true),
    (tests.uid('provider_d'), 't-reparo', true, null, null, true),
    (tests.uid('provider_e'), 't-reparo', true, null, null, true);

  insert into public.provider_neighborhoods (provider_id, neighborhood_id) values
    (tests.uid('provider_a'), v_n1),
    (tests.uid('provider_b'), v_n2),
    (tests.uid('provider_c'), v_n1),
    (tests.uid('provider_d'), v_n1),
    (tests.uid('provider_e'), v_n1);
end;
$$;

-- Inserts a booking directly (as the test session); triggers still run.
create or replace function tests.make_booking(
  p_provider text,
  p_client text,
  p_occupation text,
  p_period tstzrange,
  p_status public.booking_status default 'accepted',
  p_price_cents int default 10000,
  p_origin public.booking_origin default 'platform'
)
returns uuid
language sql
as $$
  insert into public.bookings (client_id, provider_id, occupation_slug, period, price_cents, status, origin)
  values (tests.uid(p_client), tests.uid(p_provider), p_occupation, p_period, p_price_cents, p_status, p_origin)
  returning id;
$$;

-- Records a payment of an existing booking the way the webhook would (as the test session).
create or replace function tests.make_payment(
  p_booking uuid,
  p_status public.payment_status default 'received',
  p_amount_cents int default 10000
)
returns uuid
language sql
as $$
  insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status)
  select b.id, b.provider_id, b.client_id, p_amount_cents, p_status from public.bookings b where b.id = p_booking
  returning id;
$$;

create or replace function tests.neighborhood(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.neighborhoods where slug = p_slug;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
-- Helpers that write to auth.users, the catalog or the bookings stay with the test session.
revoke execute on function tests.create_user(text, text, text) from public, anon, authenticated, service_role;
revoke execute on function tests.setup_fixture() from public, anon, authenticated, service_role;
revoke execute on function tests.make_booking(text, text, text, tstzrange, public.booking_status, int, public.booking_origin)
  from public, anon, authenticated, service_role;
revoke execute on function tests.make_payment(uuid, public.payment_status, int)
  from public, anon, authenticated, service_role;

select plan(8);
select has_function('tests', 'authenticate_as', array['text'], 'helper authenticate_as exists');
select has_function('tests', 'setup_fixture', 'helper setup_fixture exists');
select has_function('tests', 'make_booking', 'helper make_booking exists');
select has_function('tests', 'future_monday', 'helper future_monday exists');
select is(tests.future_monday(0), date_trunc('week', now() at time zone 'America/Sao_Paulo')::date,
          'future_monday(0) is the Monday of the current São Paulo week');
select is(extract(isodow from tests.future_monday(52))::int, 1, 'future_monday returns a Monday');
select is((select count(*)::int from pg_proc p
            where p.pronamespace = 'tests'::regnamespace
              and p.proname in ('create_user', 'setup_fixture', 'make_booking', 'make_payment')
              and (has_function_privilege('anon', p.oid, 'execute')
                   or has_function_privilege('authenticated', p.oid, 'execute')
                   or has_function_privilege('service_role', p.oid, 'execute'))),
          0, 'helpers that write data are not executable by the API roles');
select is((select count(*)::int from public.platform_settings where key = 'proposal_limit'), 1,
          'the shared database has the contract settings (run after supabase db reset)');
select * from finish();
