-- 13 The service role can run the guard triggers.
-- Fourteen triggers on public tables run as the caller and call these helpers. The helpers
-- were granted to anon and authenticated only, so any direct write by the service role
-- (Edge Functions: asaas-webhook and subscriptions-manage set providers.plan) failed with
-- "permission denied for function is_client_context" and Pro could never be switched on or off.
-- The helpers only read the session (current_user) or the catalog tables; for the service
-- role they answer "not a client", which is what lets the guards stand aside.
grant execute on function private.is_client_context() to service_role;
grant execute on function private.occupation_has_policy(text) to service_role;
grant execute on function private.provider_status_of(uuid) to service_role;
grant execute on function private.requires_registry(text) to service_role;
