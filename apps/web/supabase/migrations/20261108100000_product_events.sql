-- 40 Product events: first-party funnel measurement (docs/arquitetura/observabilidade.md).
-- Rows are written only by security definer triggers on the business tables, never by the
-- API roles. A row holds ids and enum values in `props`, never names, phones, e-mails,
-- documents or free text. Only admins read the table; admin_funnel_daily() aggregates it.
-- Rows older than 400 days are deleted by a pg_cron job.

-- Calendar day in São Paulo, as an immutable function so that `day` can be a stored
-- generated column. The zone has had no daylight saving time since 2019.
create function private.product_event_day(p_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_at at time zone 'America/Sao_Paulo')::date;
$$;

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  event text not null check (event in (
    'request_created', 'proposal_sent', 'booking_requested', 'booking_accepted', 'payment_received',
    'provider_submitted', 'provider_approved', 'occupation_approved', 'pro_trial_started',
    'pro_subscribed', 'review_published'
  )),
  -- The person who did the step (client, provider or payer). Null once the account is deleted.
  user_id uuid references auth.users (id) on delete set null,
  -- The request, booking, provider or subscription the event is about (not a foreign key).
  subject_id uuid,
  props jsonb not null default '{}'::jsonb check (
    jsonb_typeof(props) = 'object' and octet_length(props::text) < 512
  ),
  day date generated always as (private.product_event_day(occurred_at)) stored
);

comment on table public.product_events is
  'Funnel events for the KPIs. Written by triggers only; props hold ids and enum values, never personal data.';

create index product_events_day_event_idx on public.product_events (day, event);
create index product_events_subject_idx on public.product_events (subject_id, event);
create index product_events_user_idx on public.product_events (user_id);

alter table public.product_events enable row level security;

create policy product_events_admin_select on public.product_events
  for select to authenticated
  using ((select public.is_admin()));

revoke all on public.product_events from anon, authenticated;
grant select on public.product_events to authenticated;

-- ---------------------------------------------------------------------------
-- Recording. Each trigger records a step once: on insert, or when the status (or flag)
-- moves into the step. A later update that keeps the same status records nothing.
-- ---------------------------------------------------------------------------

create function private.record_product_event(
  p_event text,
  p_user uuid,
  p_subject uuid,
  p_props jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.product_events (event, user_id, subject_id, props)
  values (p_event, p_user, p_subject, coalesce(p_props, '{}'::jsonb));
$$;

create function private.track_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.record_product_event('request_created', new.client_id, new.id,
    jsonb_build_object('occupation_slug', new.occupation_slug));
  return null;
end;
$$;

create function private.track_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'sent' then
    perform private.record_product_event('proposal_sent', new.provider_id, new.request_id);
  end if;
  return null;
end;
$$;

create function private.track_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'requested' then
    perform private.record_product_event('booking_requested', new.client_id, new.id,
      jsonb_build_object('origin', new.origin, 'occupation_slug', new.occupation_slug));
  end if;
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.record_product_event('booking_accepted', new.provider_id, new.id,
      jsonb_build_object('origin', new.origin, 'occupation_slug', new.occupation_slug));
  end if;
  return null;
end;
$$;

create function private.track_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('received', 'confirmed')
     and (tg_op = 'INSERT' or old.status not in ('received', 'confirmed')) then
    perform private.record_product_event('payment_received', new.payer_id, new.booking_id,
      jsonb_build_object('method', new.method));
  end if;
  return null;
end;
$$;

create function private.track_provider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending_review' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.record_product_event('provider_submitted', new.id, new.id);
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.record_product_event('provider_approved', new.id, new.id);
  end if;
  return null;
end;
$$;

create function private.track_provider_occupation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.approved and (tg_op = 'INSERT' or not old.approved) then
    perform private.record_product_event('occupation_approved', new.provider_id, new.provider_id,
      jsonb_build_object('occupation_slug', new.occupation_slug));
  end if;
  return null;
end;
$$;

-- A subscription is inserted as 'trialing' (free trial) or 'pending' (charge not paid yet) and
-- becomes 'active' when the first charge is paid, so 'active' is recorded on the change too.
create function private.track_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'trialing' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.record_product_event('pro_trial_started', new.provider_id, new.provider_id,
      jsonb_build_object('plan', new.plan));
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.record_product_event('pro_subscribed', new.provider_id, new.provider_id,
      jsonb_build_object('plan', new.plan));
  end if;
  return null;
end;
$$;

create function private.track_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    perform private.record_product_event('review_published', new.client_id, new.booking_id);
  end if;
  return null;
end;
$$;

create trigger product_events_requests
  after insert on public.requests
  for each row execute function private.track_request();

create trigger product_events_proposals
  after insert on public.proposals
  for each row execute function private.track_proposal();

create trigger product_events_bookings
  after insert or update on public.bookings
  for each row execute function private.track_booking();

create trigger product_events_payments
  after insert or update on public.payments
  for each row execute function private.track_payment();

create trigger product_events_providers
  after insert or update on public.providers
  for each row execute function private.track_provider();

create trigger product_events_provider_occupations
  after insert or update on public.provider_occupations
  for each row execute function private.track_provider_occupation();

create trigger product_events_subscriptions
  after insert or update on public.subscriptions
  for each row execute function private.track_subscription();

create trigger product_events_reviews
  after insert or update on public.reviews
  for each row execute function private.track_review();

-- ---------------------------------------------------------------------------
-- Retention. Named without the `workeasy-` prefix on purpose: the scheduler test in 04
-- lists the `workeasy-` jobs exactly, and this job belongs to the product events.
-- ---------------------------------------------------------------------------

create function private.purge_product_events()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.product_events where occurred_at < now() - interval '400 days';
$$;

select cron.schedule('product-events-retention', '17 3 * * *', 'select private.purge_product_events()');

-- ---------------------------------------------------------------------------
-- Admin reading: event counts per São Paulo day and event, at most 400 days per call.
-- ---------------------------------------------------------------------------

create function public.admin_funnel_daily(p_from date, p_to date)
returns table (day date, event text, events bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query
    select e.day, e.event, count(*)::bigint
      from public.product_events e
     where e.day between p_from and p_to
     group by e.day, e.event
     order by e.day, e.event;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.admin_funnel_daily(date, date) from public, anon;
grant execute on function public.admin_funnel_daily(date, date) to authenticated, service_role;

revoke all on all functions in schema private from public;
