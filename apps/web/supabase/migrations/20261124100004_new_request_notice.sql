-- A provider is told when a request they can answer arrives (docs/operacao/08, 8.2 item 6).
-- Until now the request only showed up when the provider opened /pro/pedidos, so the time to the
-- first proposal depended on the provider remembering to look.
--
-- Who is told: the providers that open_requests_for_me() would list the request for (approved,
-- taking platform requests, approved in the occupation, serving the neighborhood), never the
-- client and never a provider with a block between them and the client. At most 30 per request, in random order, so a popular occupation does not turn one
-- request into hundreds of messages and no provider is always first. private.notify() keeps the
-- daily cap per recipient and skips accounts without a confirmed contact.
--
-- The template name is shared by the e-mail and the WhatsApp message: WhatsApp only sends it after
-- a template called pedido_novo, with two body variables, is approved in WhatsApp Manager.
alter table public.notifications drop constraint notifications_template_check;
alter table public.notifications add constraint notifications_template_check check (template in (
  'proposta_recebida', 'atendimento_confirmado', 'lembrete_atendimento',
  'pagamento_recebido', 'orcamento_respondido', 'plantao_oferecido', 'agendamento_solicitado',
  'shift_canceled_by_deletion', 'booking_canceled_by_deletion', 'pedido_novo'));

create function private.notify_new_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
begin
  if new.status <> 'open' then
    return null;
  end if;
  for v_provider in
    select pr.id
      from public.providers pr
      join public.profiles pf on pf.id = pr.id and pf.deleted_at is null
     where pr.status = 'approved'
       and pr.accepts_platform_requests
       and pr.id <> new.client_id
       and exists (select 1 from public.provider_occupations po
                    where po.provider_id = pr.id and po.occupation_slug = new.occupation_slug
                      and po.approved and po.registry_status <> 'rejected')
       and private.provider_serves(pr.id, new.neighborhood_id)
       and not private.blocked_between(pr.id, new.client_id)
     order by random()
     limit 30
  loop
    perform private.notify(v_provider, 'pedido_novo', jsonb_build_object('request_id', new.id));
  end loop;
  return null;
end;
$$;

revoke all on function private.notify_new_request() from public, anon, authenticated;

create trigger requests_60_notify_providers
  after insert on public.requests
  for each row execute function private.notify_new_request();
