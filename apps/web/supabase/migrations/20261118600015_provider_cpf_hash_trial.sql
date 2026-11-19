-- Free trial bound to the CPF of the receiving account (DD51).
-- cpf_hash is HMAC-SHA256 of the CPF/CNPJ that Asaas validated for the account, computed by asaas-onboard
-- with the platform secret (documentFingerprint in _shared/secrets.ts). The digits are not stored, and the
-- hash cannot be enumerated without that secret. Format: 64 lowercase hex characters.
-- Written only by the service role. Accounts created before this column keep NULL: they cannot start the
-- free trial.

alter table public.provider_payment_accounts
  add column cpf_hash text;

alter table public.provider_payment_accounts
  add constraint provider_payment_accounts_cpf_hash_format
  check (cpf_hash is null or cpf_hash ~ '^[0-9a-f]{64}$');

comment on column public.provider_payment_accounts.cpf_hash is
  'HMAC-SHA256 (platform webhook token, "document-fingerprint:<CPF or CNPJ digits>"), lowercase hex. NULL for accounts created before the trial binding.';
