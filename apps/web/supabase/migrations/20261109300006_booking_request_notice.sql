-- A provider is told of a new direct booking request. The template name is shared by the e-mail and the
-- WhatsApp message, so it must be approved in WhatsApp Manager under the same name before WhatsApp sends it.
alter table public.notifications drop constraint notifications_template_check;
alter table public.notifications add constraint notifications_template_check check (template in (
  'proposta_recebida', 'atendimento_confirmado', 'lembrete_atendimento',
  'pagamento_recebido', 'orcamento_respondido', 'plantao_oferecido', 'agendamento_solicitado'));

create function private.notify_booking_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'requested' then
    perform private.notify(new.provider_id, 'agendamento_solicitado',
      jsonb_build_object('booking_id', new.id, 'starts_at', lower(new.period)));
  end if;
  return null;
end;
$$;

create trigger bookings_51_notify_request
  after insert on public.bookings
  for each row execute function private.notify_booking_requested();
