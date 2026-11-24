-- create_own_booking must take the provider's row lock before it checks the agenda, the same lock the accept
-- paths and book_direct take, so the three writes to one provider's agenda run one after another. A
-- concurrent race is not reproducible in pgTAP; this guards the definition itself: it keeps its signature
-- and its body takes the lock before the check of the provider's shifts. Comments are removed from the
-- definition first, so a lock that survives only in a comment does not count.
begin;
select plan(2);
select has_function('public', 'create_own_booking', array['uuid', 'text', 'tstzrange', 'integer', 'text'],
  'create_own_booking keeps its signature');
select ok(
  (with body as (
     select regexp_replace(pg_get_functiondef('public.create_own_booking(uuid,text,tstzrange,integer,text)'::regprocedure),
                           '--[^\n]*', '', 'g') as src
   )
   select position('for no key update' in src) > 0
      and position('for no key update' in src) < position('from public.shifts' in src)
     from body),
  'create_own_booking takes the provider row lock before it checks the agenda'
);
select * from finish();
rollback;
