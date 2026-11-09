-- Account deletion, counterparts: the people left with a canceled shift or booking are told through the
-- notifications outbox (private.notify, the same rule as every other message: a confirmed contact only, and the
-- daily cap). Two templates are added: shift_canceled_by_deletion and booking_canceled_by_deletion. Their texts
-- are in apps/web/supabase/functions/_shared/notifications.ts, and each name must be approved in WhatsApp Manager
-- under the same name before WhatsApp sends it.
--
-- The deleted account is never told. Redefines public.cancel_shifts_for_user_deletion (20261110600006) and
-- public.cancel_unpaid_accepted_bookings_for_user (20261110600004) with the same signatures and the same results.

alter table public.notifications drop constraint notifications_template_check;
alter table public.notifications add constraint notifications_template_check check (template in (
  'proposta_recebida', 'atendimento_confirmado', 'lembrete_atendimento',
  'pagamento_recebido', 'orcamento_respondido', 'plantao_oferecido', 'agendamento_solicitado',
  'shift_canceled_by_deletion', 'booking_canceled_by_deletion'));

create or replace function public.cancel_shifts_for_user_deletion(p_user uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift uuid;
  v_party uuid;
  v_count int := 0;
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  for v_shift in
    select s.id
      from public.shifts s
      join public.households h on h.id = s.household_id
     where s.status in ('open', 'offered', 'assigned')
       and lower(s.period) > now()
       and (s.provider_id = p_user or h.owner_id = p_user)
     order by lower(s.period)
       for update of s
  loop
    -- The people left with the shift are told before their offers expire: the family, the assigned caregiver,
    -- and the caregivers still holding an offer. The deleted account is never one of them.
    for v_party in
      select distinct x.id
        from (
          select h.owner_id as id
            from public.shifts s
            join public.households h on h.id = s.household_id
           where s.id = v_shift
          union all
          select s.provider_id from public.shifts s where s.id = v_shift
          union all
          select o.provider_id from public.shift_offers o where o.shift_id = v_shift and o.status = 'offered'
        ) x
       where x.id is not null and x.id <> p_user
    loop
      perform private.notify(v_party, 'shift_canceled_by_deletion', jsonb_build_object('shift_id', v_shift));
    end loop;

    update public.shifts set status = 'canceled' where id = v_shift;
    update public.shift_offers set status = 'expired' where shift_id = v_shift and status = 'offered';
    perform private.audit('shift.canceled', 'shift', v_shift::text,
                          jsonb_build_object('status', 'canceled', 'cause', 'account_deletion'));
    v_count := v_count + 1;
  end loop;

  -- Shifts offered to the deleted caregiver: the offer goes with the account, so the shift is released.
  for v_shift in
    select s.id
      from public.shifts s
     where s.status = 'offered'
       and exists (select 1 from public.shift_offers o
                    where o.shift_id = s.id and o.provider_id = p_user and o.status = 'offered')
     order by s.id
       for update of s
  loop
    update public.shift_offers set status = 'expired'
     where shift_id = v_shift and provider_id = p_user and status = 'offered';
    if not exists (select 1 from public.shift_offers o where o.shift_id = v_shift and o.status = 'offered') then
      update public.shifts set status = 'open' where id = v_shift;
      perform private.audit('shift.reopened', 'shift', v_shift::text,
                            jsonb_build_object('status', 'open', 'cause', 'account_deletion'));
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.cancel_unpaid_accepted_bookings_for_user(p_user uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_other uuid;
  v_count int := 0;
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  perform set_config('workeasy.transition_reason', 'cancelada pela exclusão da conta', true);
  for v_booking in
    select b.id, b.client_id, b.provider_id
      from public.bookings b
     where b.status = 'accepted'
       and (b.client_id = p_user or b.provider_id = p_user)
     order by b.id
       for update
  loop
    update public.bookings
       set status = 'canceled',
           canceled_reason = 'cancelada pela exclusão da conta'
     where id = v_booking.id;

    -- The other party is told. An own booking has no client account, so it has no one to tell.
    v_other := case when v_booking.client_id = p_user then v_booking.provider_id else v_booking.client_id end;
    if v_other is not null and v_other <> p_user then
      perform private.notify(v_other, 'booking_canceled_by_deletion', jsonb_build_object('booking_id', v_booking.id));
    end if;
    v_count := v_count + 1;
  end loop;
  perform set_config('workeasy.transition_reason', '', true);
  return v_count;
end;
$$;
