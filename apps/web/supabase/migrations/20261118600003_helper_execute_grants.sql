-- Execute grants of the private helpers.
--
-- is_valid_cpf and is_valid_cnpj were created by migration 20261110100003, after the last revoke on
-- the private schema, so they kept the default EXECUTE of PUBLIC. Their only caller is the guard
-- trigger of provider_clients, which runs as the role that writes the row: authenticated (a provider)
-- or service_role (Edge Functions).
revoke all on function private.is_valid_cpf(text) from public, anon;
revoke all on function private.is_valid_cnpj(text) from public, anon;
grant execute on function private.is_valid_cpf(text) to authenticated, service_role;
grant execute on function private.is_valid_cnpj(text) to authenticated, service_role;

-- anon no longer executes the role helpers. anon holds SELECT only, on the public catalog tables, and
-- no policy that applies to anon calls them. The security definer functions that call them run as the
-- owner, and the security invoker guard triggers run only for writes, which anon cannot make.
revoke execute on function private.is_client_context() from anon;
revoke execute on function private.is_service_role() from anon;
