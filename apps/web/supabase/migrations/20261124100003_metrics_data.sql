-- Dates and history the launch metrics could only approximate (docs/operacao/08, 8.2 items 1 to 5).
-- Everything here is written by the database itself, from the transitions that already happen, so
-- no function or screen has to remember to fill it in.
--
--   1. payments.received_at: when the payment first became paid (confirmed, received, held or
--      released). updated_at moves again on a refund, so it never was that date.
--   2. quotes.completed_at: the provider marks an accepted quote as done (mark_quote_completed).
--      The status stays 'accepted'; this is the missing "the job happened" fact.
--   3. providers.approved_at: first time the provider was approved. A later suspension and
--      reactivation do not move it.
--   4. subscription_status_history: one row per status of a subscription, with the one before.
--   5. proposals.available_from: the first day the provider can go, as a date instead of free text.
--
-- Rows that already exist get no invented date: received_at and approved_at stay null for them
-- (there is no production data; a backfill from audit_log, if ever needed, is a separate decision).

-- 1 ---------------------------------------------------------------------------
alter table public.payments add column received_at timestamptz;

create function private.stamp_payment_received()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('confirmed', 'received', 'held', 'released') then
    if tg_op = 'INSERT' then
      new.received_at := coalesce(new.received_at, now());
    elsif old.received_at is null then
      new.received_at := now();
    else
      new.received_at := old.received_at;
    end if;
  elsif tg_op = 'UPDATE' then
    -- Not a client-writable column: whatever the statement says, the first date stays
    new.received_at := old.received_at;
  else
    new.received_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.stamp_payment_received() from public, anon, authenticated;

create trigger payments_90_received_at
  before insert or update on public.payments
  for each row execute function private.stamp_payment_received();

create index payments_received_at_idx on public.payments (received_at) where received_at is not null;

-- 2 ---------------------------------------------------------------------------
alter table public.quotes add column completed_at timestamptz;

create function private.guard_quote_completed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_context() and new.completed_at is distinct from old.completed_at then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_quote_completed() from public, anon, authenticated;

create trigger quotes_05_completed_guard
  before update on public.quotes
  for each row execute function private.guard_quote_completed();

-- The provider says the job of an accepted quote was done, or takes that back.
create function public.mark_quote_completed(p_quote uuid, p_done boolean default true)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_at timestamptz;
begin
  select * into v_quote from public.quotes where id = p_quote for update;
  if not found or v_quote.provider_id is distinct from (select auth.uid()) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'accepted' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  v_at := case when coalesce(p_done, true) then coalesce(v_quote.completed_at, now()) end;
  update public.quotes set completed_at = v_at where id = p_quote;
  return v_at;
end;
$$;

revoke all on function public.mark_quote_completed(uuid, boolean) from public, anon;
grant execute on function public.mark_quote_completed(uuid, boolean) to authenticated;

-- 3 ---------------------------------------------------------------------------
alter table public.providers add column approved_at timestamptz;

create function private.stamp_provider_approved()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.approved_at := old.approved_at;
  else
    new.approved_at := null;
  end if;
  if new.status = 'approved' and new.approved_at is null then
    new.approved_at := now();
  end if;
  return new;
end;
$$;

revoke all on function private.stamp_provider_approved() from public, anon, authenticated;

create trigger providers_90_approved_at
  before insert or update on public.providers
  for each row execute function private.stamp_provider_approved();

-- 4 ---------------------------------------------------------------------------
create table public.subscription_status_history (
  id bigint generated always as identity primary key,
  provider_id uuid not null references public.providers (id) on delete cascade,
  from_status public.subscription_status,
  to_status public.subscription_status not null,
  changed_at timestamptz not null default now()
);

create index subscription_status_history_provider_idx on public.subscription_status_history (provider_id, changed_at);
create index subscription_status_history_changed_idx on public.subscription_status_history (changed_at);

alter table public.subscription_status_history enable row level security;

create policy subscription_status_history_select on public.subscription_status_history
  for select to authenticated using (provider_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.subscription_status_history from anon, authenticated;
grant select on public.subscription_status_history to authenticated;
grant all on public.subscription_status_history to service_role;

create function private.record_subscription_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.subscription_status_history (provider_id, from_status, to_status)
    values (new.provider_id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.subscription_status_history (provider_id, from_status, to_status)
    values (new.provider_id, old.status, new.status);
  end if;
  return null;
end;
$$;

revoke all on function private.record_subscription_status() from public, anon, authenticated;

create trigger subscriptions_60_status_history
  after insert or update on public.subscriptions
  for each row execute function private.record_subscription_status();

-- 5 ---------------------------------------------------------------------------
alter table public.proposals add column available_from date;

comment on column public.payments.received_at is 'First time the payment became paid; set by trigger.';
comment on column public.quotes.completed_at is 'When the provider marked the accepted quote as done (mark_quote_completed).';
comment on column public.providers.approved_at is 'First approval of the provider; set by trigger.';
comment on column public.proposals.available_from is 'First day the provider can do the job (São Paulo date); optional.';
