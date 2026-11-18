-- One free Pro trial per CPF. Only the SHA-256 of the CPF digits is stored, never the CPF.
-- provider_id has no foreign key on purpose: deleting a provider account must not free the CPF
-- for another trial. Only the service role (subscriptions-manage) reads or writes this table.

create table public.trial_claims (
  cpf_hash text primary key,
  provider_id uuid not null,
  claimed_at timestamptz not null default now()
);

alter table public.trial_claims enable row level security;
revoke all on public.trial_claims from anon, authenticated;
grant select, insert, delete on public.trial_claims to service_role;
