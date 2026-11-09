-- 09 Care, family notes for the caregiver: the family's notes on a shift (free text, up to 2000
-- characters) are returned only to the caregiver the shift is assigned to. Before the acceptance,
-- every caregiver who is offered the shift gets null in that column. The other columns and the
-- rule of which shifts are listed are unchanged. Redefines public.caregiver_shifts with the same
-- return type.

create or replace function public.caregiver_shifts()
returns table (
  shift_id uuid,
  period tstzrange,
  status public.shift_status,
  offer_status text,
  caregiver_payout_cents int,
  notes text,
  neighborhood_name text,
  recipient_first_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         s.period,
         s.status,
         o.status,
         s.caregiver_payout_cents,
         case when s.provider_id = (select auth.uid()) then s.notes end,
         n.name,
         cr.first_name
    from public.shifts s
    join public.households h on h.id = s.household_id
    left join public.neighborhoods n on n.id = h.neighborhood_id
    left join public.care_recipients cr on cr.id = s.care_recipient_id and cr.household_id = s.household_id
    left join public.shift_offers o on o.shift_id = s.id and o.provider_id = (select auth.uid())
   where s.provider_id = (select auth.uid())
      or (o.status = 'offered' and s.status = 'offered')
   order by lower(s.period);
$$;
