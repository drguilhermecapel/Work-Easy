-- Consent proof after account deletion (migration 20261110500001): anonymize_user keeps the
-- decisions of the account without the account id, and links them to the account for the service
-- role only. Users and anonymous callers read neither table. The purge removes the expired proofs,
-- and the links that no proof is left for.
-- Changed by migration 20261118600010 (DD39): every decision is kept, and the five years count from
-- the deletion, not from each decision. The assertions on the deadline below were written for the
-- earlier rule (decisions filtered by their own date, deadline from each decision) and now expect the
-- new one. The assertion count is unchanged.
begin;
select plan(25);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- Decisions of client A: two recent and one older than five years. Client B has one recent decision.
insert into public.consents (user_id, purpose, version, granted, at) values
  (tests.uid('client_a'), 'terms', '2026-10', true, now() - interval '2 years'),
  (tests.uid('client_a'), 'privacy', '2026-10', true, now() - interval '1 year'),
  (tests.uid('client_a'), 'marketing', '2019-01', true, now() - interval '6 years'),
  (tests.uid('client_b'), 'terms', '2026-10', true, now() - interval '3 months');

select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$, 'service role anonymizes client A');
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$, 'a repeated anonymization is accepted');
select lives_ok($$select public.anonymize_user(tests.uid('client_b'))$$, 'service role anonymizes client B');
select tests.clear_authentication();

select is((select count(*)::int from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_a')), 3,
          'the three decisions are kept once, even after a repeated call');
select is((select count(*)::int from public.consent_proofs where version = '2019-01'), 1,
          'a decision older than five years is kept too: the five years count from the deletion');
-- Previously compared with the decision's date plus five years; now the deadline is five years after the deletion.
select ok((select p.retain_until from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_a') and p.purpose = 'terms')
          between now() + interval '5 years' - interval '1 minute'
              and now() + interval '5 years' + interval '1 minute',
          'a proof is kept until five years after the deletion, not after its decision');
select ok(exists (select 1 from public.consent_proof_links where user_id = tests.uid('client_a')),
          'the account is linked to its proofs');
select hasnt_column('public', 'consent_proofs', 'user_id', 'the proofs carry no account id');
select isnt((select proof_owner from public.consent_proof_links where user_id = tests.uid('client_a')),
            tests.uid('client_a'), 'the owner key is not the account id');
select is((select count(*)::int from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_b')), 1,
          'client B keeps its one recent decision');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.consent_proofs'::regclass),
          'RLS is on for the proofs');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.consent_proof_links'::regclass),
          'RLS is on for the links');

-- Nobody but the service role reads the proofs or the links through the API.
select tests.authenticate_as('client_a');
select throws_ok('select count(*) from public.consent_proofs', '42501', null,
                 'the account owner cannot read the proofs');
select throws_ok('select count(*) from public.consent_proof_links', '42501', null,
                 'the account owner cannot read the links');
select tests.authenticate_as('admin');
select throws_ok('select count(*) from public.consent_proofs', '42501', null,
                 'an administrator cannot read the proofs through the API');
select throws_ok('select count(*) from public.consent_proof_links', '42501', null,
                 'an administrator cannot read the links through the API');
select tests.authenticate_anon();
select throws_ok('select count(*) from public.consent_proofs', '42501', null, 'anon cannot read the proofs');
select throws_ok('select count(*) from public.consent_proof_links', '42501', null, 'anon cannot read the links');
select tests.clear_authentication();

-- Purge: the expired proofs go, and a link goes when no proof is left for it.
select has_function('private', 'purge_expired_consent_proofs', 'the purge function exists');
select is(has_function_privilege('authenticated', 'private.purge_expired_consent_proofs()', 'EXECUTE'), false,
          'authenticated cannot run the purge');

update public.consent_proofs set retain_until = now() - interval '1 day'
 where purpose = 'terms'
   and proof_owner = (select proof_owner from public.consent_proof_links where user_id = tests.uid('client_a'));
select private.purge_expired_consent_proofs();
select is((select count(*)::int from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_a')), 2,
          'the purge removes an expired proof and keeps the others of the account');
select is((select count(*)::int from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_b')), 1,
          'the purge keeps a proof that has not expired');

update public.consent_proofs set retain_until = now() - interval '1 day'
 where proof_owner = (select proof_owner from public.consent_proof_links where user_id = tests.uid('client_a'));
select private.purge_expired_consent_proofs();
select is((select count(*)::int from public.consent_proof_links where user_id = tests.uid('client_a')), 0,
          'the purge removes a link left without any proof');
select is((select count(*)::int from public.consent_proof_links where user_id = tests.uid('client_b')), 1,
          'the link of another account stays');

select * from finish();
rollback;
