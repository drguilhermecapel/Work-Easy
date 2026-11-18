-- create_own_booking must take the provider's row lock before it checks the agenda, the same lock the accept
-- paths and book_direct take, so the three writes to one provider's agenda run one after another. A
-- concurrent race is not reproducible in pgTAP; this guards the definition itself: it keeps its signature
-- and its body contains the lock statement.
begin;
select plan(2);
select has_function('public', 'create_own_booking', array['uuid', 'text', 'tstzrange', 'integer', 'text'],
  'create_own_booking keeps its signature');
select ok(
  position('for no key update' in pg_get_functiondef('public.create_own_booking(uuid,text,tstzrange,integer,text)'::regprocedure)) > 0,
  'create_own_booking takes the provider row lock before it checks the agenda'
);
select * from finish();
rollback;
