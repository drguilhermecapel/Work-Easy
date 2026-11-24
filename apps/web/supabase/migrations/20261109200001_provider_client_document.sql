-- Billing document (CPF or CNPJ, digits only) of a CRM client. charges-create creates the client
-- in the provider's Asaas subaccount from this stored value; a request body never supplies it.
-- The provider writes it through the CRM, like the other contact fields.
alter table public.provider_clients
  add column cpf_cnpj text check (cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$');

grant insert (cpf_cnpj) on public.provider_clients to authenticated;
grant update (cpf_cnpj) on public.provider_clients to authenticated;
