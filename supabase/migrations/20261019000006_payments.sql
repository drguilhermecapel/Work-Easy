-- 06 Payments and subscriptions (Asaas). Only the service role (Edge Functions) writes;
-- payers, providers and admins read their rows. No card data is ever stored: card
-- payments use the Asaas invoice page.

create table public.provider_payment_accounts (
  provider_id uuid primary key references public.providers (id) on delete cascade,
  asaas_account_id text,
  asaas_wallet_id text,
  -- Supabase Vault secret holding the subaccount API key (see store_provider_payment_secret).
  api_key_secret_id uuid,
  status text,
  created_at timestamptz not null default now()
);

create table public.customer_payment_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  asaas_customer_id text not null,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete set null,
  quote_id uuid, -- references public.quotes, added in 07_quotes_reviews
  provider_id uuid references public.providers (id) on delete set null,
  payer_id uuid references public.profiles (id) on delete set null,
  asaas_payment_id text unique,
  method public.payment_method not null default 'undefined',
  amount_cents int not null check (amount_cents >= 0),
  platform_fee_cents int not null default 0 check (platform_fee_cents >= 0),
  status public.payment_status not null default 'pending',
  escrow boolean not null default false,
  invoice_url text,
  pix_qr_code text,
  pix_payload text,
  due_date date,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_booking_idx on public.payments (booking_id);
create index payments_quote_idx on public.payments (quote_id);
create index payments_provider_idx on public.payments (provider_id, created_at desc);
create index payments_payer_idx on public.payments (payer_id, created_at desc);
create index payments_status_idx on public.payments (status);

create trigger payments_touch
  before update on public.payments
  for each row execute function private.touch_updated_at();

-- Webhook idempotency: one row per Asaas event id.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  asaas_event_id text not null unique,
  payment_id uuid references public.payments (id) on delete set null,
  event_type text not null,
  payload jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index payment_events_payment_idx on public.payment_events (payment_id);

create table public.subscriptions (
  provider_id uuid primary key references public.providers (id) on delete cascade,
  plan public.plan_code not null default 'pro',
  status public.subscription_status not null,
  asaas_subscription_id text unique,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.provider_payment_accounts enable row level security;
alter table public.customer_payment_profiles enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.subscriptions enable row level security;

-- ---------------------------------------------------------------------------
-- Vault: the subaccount API key never leaves the server.
-- ---------------------------------------------------------------------------

create function public.store_provider_payment_secret(p_provider uuid, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if nullif(p_secret, '') is null or not exists (select 1 from public.providers p where p.id = p_provider) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select a.api_key_secret_id into v_secret_id
    from public.provider_payment_accounts a where a.provider_id = p_provider for update;

  if v_secret_id is not null and exists (select 1 from vault.secrets s where s.id = v_secret_id) then
    perform vault.update_secret(v_secret_id, p_secret);
  else
    v_secret_id := vault.create_secret(p_secret, 'asaas_api_key:' || p_provider::text,
                                       'Asaas subaccount API key of a WorkEasy provider');
  end if;

  insert into public.provider_payment_accounts (provider_id, api_key_secret_id)
  values (p_provider, v_secret_id)
  on conflict (provider_id) do update set api_key_secret_id = excluded.api_key_secret_id;

  perform private.audit('payment_account.secret_stored', 'provider', p_provider::text, '{}'::jsonb);
  return v_secret_id;
end;
$$;

-- Read side for Edge Functions that charge on the provider's subaccount.
create function public.get_provider_payment_secret(p_provider uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select ds.decrypted_secret into v_secret
    from public.provider_payment_accounts a
    join vault.decrypted_secrets ds on ds.id = a.api_key_secret_id
   where a.provider_id = p_provider;
  return v_secret;
end;
$$;

revoke all on function public.store_provider_payment_secret(uuid, text) from public, anon, authenticated;
revoke all on function public.get_provider_payment_secret(uuid) from public, anon, authenticated;
grant execute on function public.store_provider_payment_secret(uuid, text) to service_role;
grant execute on function public.get_provider_payment_secret(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Policies and grants (read only for the API roles)
-- ---------------------------------------------------------------------------

create policy provider_payment_accounts_select on public.provider_payment_accounts
  for select to authenticated
  using (provider_id = (select auth.uid()) or (select public.is_admin()));

create policy customer_payment_profiles_select on public.customer_payment_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy payments_select on public.payments
  for select to authenticated
  using (payer_id = (select auth.uid()) or provider_id = (select auth.uid()) or (select public.is_admin()));

create policy payment_events_select_admin on public.payment_events
  for select to authenticated using ((select public.is_admin()));

create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (provider_id = (select auth.uid()) or (select public.is_admin()));

-- The Vault reference is not exposed, even to the owner.
grant select (provider_id, asaas_account_id, asaas_wallet_id, status, created_at)
  on public.provider_payment_accounts to authenticated;
grant select on public.customer_payment_profiles, public.payments, public.payment_events,
  public.subscriptions to authenticated;

revoke all on all functions in schema private from public;
