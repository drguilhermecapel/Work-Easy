-- Withdrawing the background-check consent (migration 20261109100005): the decision is recorded
-- and every background-check file of the provider is marked for deletion, in one call. Reviewed
-- files are marked too; the storage cleanup that reads the mark is a separate step.
begin;
select plan(9);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

insert into public.provider_documents (provider_id, step, storage_path, status) values
  (tests.uid('provider_a'), 'antecedentes', tests.uid('provider_a') || '/antecedentes-1.pdf', 'accepted'),
  (tests.uid('provider_a'), 'antecedentes', tests.uid('provider_a') || '/antecedentes-2.pdf', 'submitted'),
  (tests.uid('provider_a'), 'documento_selfie', tests.uid('provider_a') || '/selfie-withdraw.png', 'submitted'),
  (tests.uid('provider_b'), 'antecedentes', tests.uid('provider_b') || '/antecedentes-b.pdf', 'submitted');

select tests.authenticate_anon();
select throws_ok($$select public.withdraw_background_check('teste-1')$$, '42501', null, 'anon cannot withdraw a consent');

select tests.authenticate_as('provider_a');
select is(public.withdraw_background_check('teste-1'), 2,
          'the withdrawal marks the two background-check files of the provider and returns how many');
select throws_ok($$update public.provider_documents set deletion_requested_at = null$$, '42501', null,
                 'the owner cannot change the deletion mark directly');
select tests.clear_authentication();

select ok(exists (select 1 from public.consents
                   where user_id = tests.uid('provider_a') and purpose = 'background_check' and granted = false),
          'the withdrawal is recorded in the consent history');
select is((select count(*)::int from public.provider_documents
            where provider_id = tests.uid('provider_a') and step = 'antecedentes' and deletion_requested_at is not null), 2,
          'both background-check files are marked for deletion, reviewed or not');
select is((select deletion_requested_at from public.provider_documents where storage_path like '%selfie-withdraw.png'), null,
          'other documents of the provider are not marked');
select is((select count(*)::int from public.provider_documents
            where provider_id = tests.uid('provider_b') and deletion_requested_at is not null), 0,
          'another provider is not affected');

select tests.authenticate_as('provider_a');
select is(public.withdraw_background_check('teste-1'), 0, 'a second withdrawal marks nothing new');
select tests.clear_authentication();

select * from finish();
rollback;
