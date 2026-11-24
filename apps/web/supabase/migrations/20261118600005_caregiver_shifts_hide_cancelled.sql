-- 09 Care, plantão cancelado pela família: o cuidador que estava com o plantão continua vendo o
-- registro (período e status canceled) como histórico, mas as notas da família, o primeiro nome da
-- pessoa cuidada e o bairro vêm null. Depois do cancelamento não há mais finalidade para esses dados
-- de terceiros nesta visão. Redefine public.caregiver_shifts com o mesmo tipo de retorno e
-- o mesmo corpo da versão de 20261110200005_caregiver_notes_after_assignment.sql, exceto pelas três
-- colunas acima para status = canceled.

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
         case when s.status = 'canceled' then null
              when s.provider_id = (select auth.uid()) then s.notes
         end,
         case when s.status = 'canceled' then null else n.name end,
         case when s.status = 'canceled' then null else cr.first_name end
    from public.shifts s
    join public.households h on h.id = s.household_id
    left join public.neighborhoods n on n.id = h.neighborhood_id
    left join public.care_recipients cr on cr.id = s.care_recipient_id and cr.household_id = s.household_id
    left join public.shift_offers o on o.shift_id = s.id and o.provider_id = (select auth.uid())
   where s.provider_id = (select auth.uid())
      or (o.status = 'offered' and s.status = 'offered')
   order by lower(s.period);
$$;
