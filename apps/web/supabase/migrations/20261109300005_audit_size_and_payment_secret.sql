-- Audit entries are immutable, so an oversized one is refused rather than kept. Rows written before this
-- constraint are not rechecked (NOT VALID).
alter table public.audit_log
  add constraint audit_log_data_size check (pg_column_size(data) <= 8192) not valid;

-- The Vault key of a payment account is deleted with the account, including when the account goes with
-- its provider or user through a cascade. Otherwise the subaccount API key outlives the account.
create function private.drop_payment_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.api_key_secret_id is not null then
    delete from vault.secrets where id = old.api_key_secret_id;
  end if;
  return old;
end;
$$;

revoke all on function private.drop_payment_secret() from public;

create trigger provider_payment_accounts_drop_secret
  after delete on public.provider_payment_accounts
  for each row execute function private.drop_payment_secret();
