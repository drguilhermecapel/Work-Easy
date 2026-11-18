-- Consent proof retention counted from the deletion (migration 20261118600010, DD39). The account
-- deletion (anonymize_user) copies every consent decision of the account to consent_proofs, without the
-- account id, and sets retain_until to five years after the deletion, not after each decision.
-- run_retention_purge removes a proof once its retain_until has passed, and keeps the proofs within it.
begin;
select plan(19);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- Client A has one decision of two years ago. Client B has one decision of six years ago and one recent one.
insert into public.consents (user_id, purpose, version, granted, at) values
  (tests.uid('client_a'), 'terms', '2026-10', true, now() - interval '2 years'),
  (tests.uid('client_b'), 'marketing', '2019-01', true, now() - interval '6 years'),
  (tests.uid('client_b'), 'privacy', '2026-10', true, now() - interval '3 months');

-- Calls of one transaction share now(), so the deadlines below are compared with the same now().
select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$, 'service role anonymizes client A');
select lives_ok($$select public.anonymize_user(tests.uid('client_b'))$$, 'service role anonymizes client B');
select tests.clear_authentication();

-- (a) A decision of two years ago is copied, and kept until five years after the deletion.
select is((select count(*)::int from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_a')), 1,
          'the decision of two years ago is copied');
select ok((select p.retain_until from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_a'))
          between now() + interval '5 years' - interval '1 minute'
              and now() + interval '5 years' + interval '1 minute',
          'its retain_until is about five years after the deletion');
select is((select p.at from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_a')),
          (select c.at from public.consents c where c.user_id = tests.uid('client_a')),
          'the copy keeps the date of the decision');

-- (b) A decision of six years ago is copied too, with the same deadline counted from the deletion.
select is((select count(*)::int from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_b')), 2,
          'the decision of six years ago and the recent one are both copied');
select ok((select p.retain_until from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_b') and p.version = '2019-01')
          between now() + interval '5 years' - interval '1 minute'
              and now() + interval '5 years' + interval '1 minute',
          'the decision of six years ago is kept until five years after the deletion');
select ok((select p.at from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_b') and p.version = '2019-01') < now() - interval '5 years',
          'the copy of that decision keeps its own old date');

-- (d) The copies carry no account id: there is no user_id column, and no proof holds an account id.
select hasnt_column('public', 'consent_proofs', 'user_id', 'the proofs have no user_id column');
select ok(not exists (select 1 from public.consent_proofs p
                       where p::text like '%' || tests.uid('client_a')::text || '%'
                          or p::text like '%' || tests.uid('client_b')::text || '%'),
          'no proof holds the id of the account it came from');

-- A repeated anonymization adds no proof.
select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$, 'a repeated anonymization is accepted');
select tests.clear_authentication();
select is((select count(*)::int from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_a')), 1,
          'and it adds no proof');

-- (c) The purge removes a proof after its retain_until, and keeps a proof within its deadline.
-- The six-year proof of client B is past its deadline here; the other proofs are still within theirs.
update public.consent_proofs p set retain_until = now() - interval '1 second'
  from public.consent_proof_links l
 where l.proof_owner = p.proof_owner and l.user_id = tests.uid('client_b') and p.version = '2019-01';
select is((select count(*)::int from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_b')), 2,
          'before the purge, both proofs of client B are still stored');
select is((select (public.run_retention_purge() ->> 'consent_proofs_removed')::bigint), 1::bigint,
          'the purge reports the one proof past its deadline');
select is((select count(*)::int from public.consent_proofs where version = '2019-01'), 0,
          'the purge removes the proof after its retain_until');
select is((select count(*)::int from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_b')), 1,
          'the proof of client B within its deadline stays');
select is((select count(*)::int from public.consent_proofs p
             join public.consent_proof_links l on l.proof_owner = p.proof_owner
            where l.user_id = tests.uid('client_a')), 1,
          'the proof of client A within its deadline stays');
select ok(exists (select 1 from public.consent_proof_links where user_id = tests.uid('client_b')),
          'the link of client B stays while one of its proofs remains');

select * from finish();
rollback;
