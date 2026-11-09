-- The CRM document trigger function (migration 20261110100003) is run by its trigger only, so no role
-- needs EXECUTE on it. The revoke does not stop the trigger for the API roles: the privilege is
-- checked when the trigger is created, not when it fires.

revoke all on function private.guard_client_document() from public, anon, authenticated;
