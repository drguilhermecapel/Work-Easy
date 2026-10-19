-- 08 Notifications: an outbox filled by triggers and drained by the notify-dispatch
-- Edge Function through claim_notifications(). Templates must exist in WhatsApp
-- Business with the same names.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  phone text,
  email text,
  channel public.notification_channel not null,
  template text not null check (template in (
    'proposta_recebida', 'atendimento_confirmado', 'lembrete_atendimento',
    'pagamento_recebido', 'orcamento_respondido', 'plantao_oferecido'
  )),
  params jsonb not null default '{}',
  status public.notification_status not null default 'queued',
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index notifications_due_idx on public.notifications (scheduled_for) where status = 'queued';
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- Queues one message for a user: WhatsApp when the profile has a phone, e-mail
-- otherwise; nothing when there is no contact.
create function private.notify(
  p_user uuid,
  p_template text,
  p_params jsonb,
  p_scheduled_for timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_email text;
begin
  if p_user is null then
    return;
  end if;
  select nullif(p.phone, ''), nullif(u.email, '') into v_phone, v_email
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = p_user and p.deleted_at is null;

  if v_phone is null and v_email is null then
    return;
  end if;

  insert into public.notifications (user_id, phone, email, channel, template, params, scheduled_for)
  values (p_user, v_phone, v_email,
          case when v_phone is not null then 'whatsapp' else 'email' end::public.notification_channel,
          p_template, coalesce(p_params, '{}'), coalesce(p_scheduled_for, now()));
end;
$$;

-- ---------------------------------------------------------------------------
-- Enqueueing triggers
-- ---------------------------------------------------------------------------

-- Proposal received -> client.
create function private.notify_proposal_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(
    r.client_id, 'proposta_recebida',
    jsonb_build_object('request_id', r.id, 'proposal_id', new.id, 'provider_name', p.display_name,
                       'price_cents', new.price_cents))
    from public.requests r
    join public.providers p on p.id = new.provider_id
   where r.id = new.request_id;
  return null;
end;
$$;

create trigger proposals_notify
  after insert on public.proposals
  for each row execute function private.notify_proposal_received();

-- Booking accepted -> both parties, plus a reminder 24 h before the start.
-- Canceling the booking skips reminders still queued.
create function private.notify_booking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_params jsonb;
  v_user uuid;
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    v_params := jsonb_build_object(
      'booking_id', new.id,
      'starts_at', lower(new.period),
      'occupation_slug', new.occupation_slug,
      'provider_name', (select p.display_name from public.providers p where p.id = new.provider_id));
    foreach v_user in array array[new.client_id, new.provider_id] loop
      perform private.notify(v_user, 'atendimento_confirmado', v_params);
      if lower(new.period) - interval '24 hours' > now() then
        perform private.notify(v_user, 'lembrete_atendimento', v_params, lower(new.period) - interval '24 hours');
      end if;
    end loop;
  elsif tg_op = 'UPDATE' and new.status = 'canceled' and old.status is distinct from 'canceled' then
    update public.notifications n
       set status = 'skipped', error = 'booking canceled'
     where n.status = 'queued'
       and n.template = 'lembrete_atendimento'
       and n.params ->> 'booking_id' = new.id::text;
  end if;
  return null;
end;
$$;

create trigger bookings_50_notify
  after insert or update of status on public.bookings
  for each row execute function private.notify_booking_status();

-- Payment received/confirmed -> provider.
create function private.notify_payment_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('received', 'confirmed')
     and (tg_op = 'INSERT' or old.status not in ('received', 'confirmed')) then
    perform private.notify(new.provider_id, 'pagamento_recebido',
                           jsonb_build_object('payment_id', new.id, 'booking_id', new.booking_id,
                                              'quote_id', new.quote_id, 'amount_cents', new.amount_cents));
  end if;
  return null;
end;
$$;

create trigger payments_notify
  after insert or update of status on public.payments
  for each row execute function private.notify_payment_received();

-- Quote answered -> provider.
create function private.notify_quote_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('accepted', 'declined') and old.status is distinct from new.status then
    perform private.notify(new.provider_id, 'orcamento_respondido',
                           jsonb_build_object('quote_id', new.id, 'title', new.title, 'status', new.status,
                                              'client_name', new.client_name, 'total_cents', new.total_cents));
  end if;
  return null;
end;
$$;

create trigger quotes_notify
  after update of status on public.quotes
  for each row execute function private.notify_quote_answered();

-- ---------------------------------------------------------------------------
-- Dispatch
-- ---------------------------------------------------------------------------

-- Service role: claims a batch of due messages (marked 'sending') for notify-dispatch.
create function public.claim_notifications(p_limit int default 50)
returns setof public.notifications
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  with batch as (
    select n.id
      from public.notifications n
     where n.status = 'queued' and n.scheduled_for <= now()
     order by n.scheduled_for
     limit greatest(1, least(coalesce(p_limit, 50), 500))
     for update skip locked
  )
  update public.notifications n
     set status = 'sending', attempts = n.attempts + 1
    from batch
   where n.id = batch.id
  returning n.*;
end;
$$;

revoke all on function public.claim_notifications(int) from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;

-- Scheduler (pg_cron + pg_net). The dispatcher is called only when the Vault holds
-- 'notify_dispatch_url' (e.g. https://<ref>.supabase.co/functions/v1/notify-dispatch)
-- and 'cron_secret'; locally both are absent and the job does nothing.
create function private.dispatch_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.notifications n where n.status = 'queued' and n.scheduled_for <= now()) then
    return;
  end if;
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'notify_dispatch_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb
  );
end;
$$;

-- Housekeeping: expire old requests, quotes and shift offers (shifts exist after 09).
create function private.expire_stale()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.requests set status = 'closed' where status = 'open' and expires_at <= now();
  update public.quotes set status = 'expired' where status = 'sent' and valid_until < private.sp_date(now());
  update public.shift_offers o set status = 'expired'
    from public.shifts s
   where s.id = o.shift_id and o.status = 'offered' and lower(s.period) <= now();
end;
$$;

select cron.schedule('workeasy-dispatch-notifications', '* * * * *', 'select private.dispatch_notifications()');
select cron.schedule('workeasy-expire-stale', '*/15 * * * *', 'select private.expire_stale()');

-- ---------------------------------------------------------------------------
-- Policies and grants
-- ---------------------------------------------------------------------------

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

grant select on public.notifications to authenticated;

revoke all on all functions in schema private from public;
