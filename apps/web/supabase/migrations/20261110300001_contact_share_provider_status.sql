-- Contact sharing from the provider's side follows the same statuses as the client's side: a
-- request nobody accepted yet and a canceled job release no name and no phone to the counterpart.
-- Only the booking branch changes; the household branch is kept as it was.
create or replace function private.shares_contact(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
     where b.origin = 'platform'
       and ((b.client_id = (select auth.uid()) and b.provider_id = p_user
             and b.status not in ('requested', 'canceled'))
         or (b.provider_id = (select auth.uid()) and b.client_id = p_user
             and b.status not in ('requested', 'canceled')))
  )
  or exists (
    select 1 from public.shifts s
      join public.households h on h.id = s.household_id
     where (h.owner_id = (select auth.uid()) and s.provider_id = p_user)
        or (s.provider_id = (select auth.uid()) and h.owner_id = p_user)
  );
$$;
